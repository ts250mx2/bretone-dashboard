import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { BillingInvoice, BillingTicket, CFDI_SETTINGS, buildInvoiceDocument } from '@/lib/cfdi-builder';
import { buildRelativePath, saveCfdiFile } from '@/lib/cfdi-storage';
import { getPool, query } from '@/lib/db';
import { PacError, downloadCfdiFile, isSandbox, sendCfdiByEmail, stampCfdi } from '@/lib/facturadigital';
import { ensureInvoiceTable } from '@/lib/invoice-store';

type InvoiceRow = BillingInvoice & { Estado: string; UUID: string | null; Correo: string | null };
type ResultHeader = { affectedRows: number };

const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Error desconocido');
const invoiceFolio = (idFactura: number) => `F-${String(idFactura).padStart(6, '0')}`;

async function authenticated() {
  try {
    return Boolean(await getSession());
  } catch {
    return false;
  }
}

/** Marca la factura como "en timbrado" para que dos clics simultáneos no consuman dos timbres. */
async function claimInvoice(idFactura: number) {
  const pool = await getPool();
  const [result] = await pool.execute(`
    UPDATE tblFacturasDashboard
    SET TimbradoIniciadoEn = NOW(), ErrorTimbrado = NULL
    WHERE IdFactura = ?
      AND Estado = 'pendiente_timbrado'
      AND UUID IS NULL
      AND (TimbradoIniciadoEn IS NULL OR TimbradoIniciadoEn < DATE_SUB(NOW(), INTERVAL 5 MINUTE))
  `, [idFactura]);
  return (result as ResultHeader).affectedRows === 1;
}

async function releaseInvoice(idFactura: number, error: string) {
  await query(`UPDATE tblFacturasDashboard SET TimbradoIniciadoEn = NULL, ErrorTimbrado = ? WHERE IdFactura = ?`, [error.slice(0, 500), idFactura]);
}

async function rejectionFor(idFactura: number) {
  const rows = await query(`SELECT Estado, UUID, TimbradoIniciadoEn FROM tblFacturasDashboard WHERE IdFactura = ?`, [idFactura]);
  const invoice = rows[0];
  if (!invoice) return { error: 'La factura no existe', status: 404 };
  if (invoice.UUID) return { error: 'Esta factura ya fue timbrada', status: 409 };
  if (invoice.Estado === 'cancelada') return { error: 'La factura está cancelada', status: 409 };
  return { error: 'La factura ya se está timbrando en este momento', status: 409 };
}

/** Guarda XML y PDF en disco; si el almacenamiento falla el CFDI ya quedó respaldado en la base de datos. */
async function archiveDocuments(idFactura: number, uuid: string, stampedAt: Date, xml: Buffer, pdfUrl: string) {
  const stored = { xmlPath: '', pdfPath: '' };
  try {
    stored.xmlPath = await saveCfdiFile(buildRelativePath(idFactura, uuid, 'xml', stampedAt), xml);
  } catch (error) {
    console.error('No fue posible guardar el XML del CFDI:', error);
  }
  if (pdfUrl) {
    try {
      const pdf = await downloadCfdiFile(pdfUrl);
      stored.pdfPath = await saveCfdiFile(buildRelativePath(idFactura, uuid, 'pdf', stampedAt), pdf);
    } catch (error) {
      console.error('No fue posible guardar el PDF del CFDI:', error);
    }
  }
  if (stored.xmlPath || stored.pdfPath) {
    await query(`UPDATE tblCfdiDocumentosDashboard SET XmlRuta = ?, PdfRuta = ? WHERE IdFactura = ?`, [stored.xmlPath || null, stored.pdfPath || null, idFactura]);
  }
  return stored;
}

export async function POST(request: NextRequest) {
  if (!(await authenticated())) return NextResponse.json({ error: 'Sesión no válida' }, { status: 401 });

  let idFactura = 0;
  try {
    await ensureInvoiceTable();
    const body = await request.json() as Record<string, unknown>;
    idFactura = Number(body.idFactura);
    const shouldEmail = body.enviarCorreo !== false;
    if (!Number.isInteger(idFactura) || idFactura <= 0) return NextResponse.json({ error: 'La factura no es válida' }, { status: 400 });

    if (!(await claimInvoice(idFactura))) {
      const rejection = await rejectionFor(idFactura);
      return NextResponse.json({ error: rejection.error }, { status: rejection.status });
    }

    const [invoices, tickets] = await Promise.all([
      query(`SELECT * FROM tblFacturasDashboard WHERE IdFactura = ?`, [idFactura]) as Promise<InvoiceRow[]>,
      query(`
        SELECT FT.IdApertura, FT.IdVenta, FT.Folio, FT.FechaVenta, FT.ConsumoFacturable, V.Tarjeta
        FROM tblFacturaTicketsDashboard FT
        LEFT JOIN tblVentas V ON V.IdApertura = FT.IdApertura AND V.IdVenta = FT.IdVenta
        WHERE FT.IdFactura = ?
        ORDER BY FT.FechaVenta, FT.Folio
      `, [idFactura]) as Promise<BillingTicket[]>,
    ]);

    const invoice = invoices[0];
    if (!invoice) {
      await releaseInvoice(idFactura, 'La factura no existe');
      return NextResponse.json({ error: 'La factura no existe' }, { status: 404 });
    }

    let built;
    try {
      built = await buildInvoiceDocument(invoice, tickets);
    } catch (error) {
      await releaseInvoice(idFactura, errorMessage(error));
      return NextResponse.json({ error: errorMessage(error) }, { status: 400 });
    }

    let cfdi;
    try {
      cfdi = await stampCfdi(built.document);
    } catch (error) {
      const detail = error instanceof PacError ? error.message : errorMessage(error);
      await releaseInvoice(idFactura, detail);
      console.error('Error al timbrar el CFDI:', error);
      return NextResponse.json({ error: `El PAC rechazó el timbrado: ${detail}` }, { status: 502 });
    }

    // El CFDI ya existe ante el SAT: se resguarda antes que cualquier otra cosa.
    const xml = Buffer.from(cfdi.xmlBase64, 'base64');
    const stampedAt = new Date(cfdi.fechaTimbrado || Date.now());
    const stampedDate = Number.isNaN(stampedAt.getTime()) ? new Date() : stampedAt;
    await query(`
      INSERT INTO tblCfdiDocumentosDashboard
        (IdFactura, UUID, Serie, Folio, FechaTimbrado, RfcReceptor, Total, Ambiente, NoCertificado, NoCertificadoSAT, RfcProvCertif, CadenaQR, XmlUrl, PdfUrl, Xml)
      VALUES (?,?,?,?,?,?,?,?,?,?,?,?,?,?,?)
      ON DUPLICATE KEY UPDATE UUID = VALUES(UUID), Xml = VALUES(Xml)
    `, [
      idFactura, cfdi.uuid, CFDI_SETTINGS.serie, String(idFactura), cfdi.fechaTimbrado ? cfdi.fechaTimbrado.replace('T', ' ') : null,
      invoice.RFC, built.total, isSandbox() ? 'sandbox' : 'produccion', cfdi.noCertificado || null, cfdi.noCertificadoSAT || null,
      cfdi.rfcProvCertif || null, cfdi.cadenaQR || null, cfdi.xmlUrl || null, cfdi.pdfUrl || null, xml.toString('utf8'),
    ]);
    await query(`
      UPDATE tblFacturasDashboard
      SET Estado = 'timbrada', UUID = ?, Serie = ?, Folio = ?, TotalTimbrado = ?, TimbradaEn = NOW(), TimbradoIniciadoEn = NULL, ErrorTimbrado = NULL
      WHERE IdFactura = ?
    `, [cfdi.uuid, CFDI_SETTINGS.serie, String(idFactura), built.total, idFactura]);

    const stored = await archiveDocuments(idFactura, cfdi.uuid, stampedDate, xml, cfdi.pdfUrl);

    let emailSent = false;
    let emailError = '';
    const recipient = String(invoice.Correo || '').trim();
    if (shouldEmail && recipient) {
      try {
        const response = await sendCfdiByEmail(cfdi.uuid, recipient, `Factura ${invoiceFolio(idFactura)}`);
        emailSent = true;
        await query(`INSERT INTO tblCfdiEnviosDashboard (IdFactura, UUID, Correo, Mensaje, Exitoso, Respuesta) VALUES (?,?,?,?,1,?)`, [idFactura, cfdi.uuid, recipient, `Factura ${invoiceFolio(idFactura)}`, response.slice(0, 500)]);
      } catch (error) {
        emailError = errorMessage(error);
        await query(`INSERT INTO tblCfdiEnviosDashboard (IdFactura, UUID, Correo, Mensaje, Exitoso, Respuesta) VALUES (?,?,?,?,0,?)`, [idFactura, cfdi.uuid, recipient, `Factura ${invoiceFolio(idFactura)}`, emailError.slice(0, 500)]);
      }
    }

    const warnings = [
      stored.xmlPath ? '' : 'El XML no pudo guardarse en disco (queda respaldado en la base de datos)',
      stored.pdfPath ? '' : 'El PDF no pudo descargarse del PAC; se intentará al consultarlo',
      emailError ? `No fue posible enviar el correo: ${emailError}` : '',
    ].filter(Boolean);

    return NextResponse.json({
      success: true,
      uuid: cfdi.uuid,
      total: built.total,
      conceptos: built.conceptos,
      emailSent,
      warnings,
      message: `${invoiceFolio(idFactura)} timbrada correctamente${emailSent ? ` y enviada a ${recipient}` : ''}`,
    });
  } catch (error: unknown) {
    if (idFactura) await releaseInvoice(idFactura, errorMessage(error)).catch(() => {});
    console.error('Error stamping invoice:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { getBillingAmounts, verifySelfInvoiceToken } from '@/lib/billing';
import { getPool, query } from '@/lib/db';
import { ensureInvoiceTable } from '@/lib/invoice-store';
import { getTicketFiscalSummary } from '@/lib/taxes';

type RouteParams = { params: Promise<{ token: string }> };

const clean = (value: unknown) => String(value ?? '').trim().toUpperCase();
const errorMessage = (error: unknown) => error instanceof Error ? error.message : 'Error desconocido';
const errorCode = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';

async function getTicket(token: string) {
  const verified = verifySelfInvoiceToken(token);
  if (!verified) return { error: 'El enlace de facturación no es válido', status: 400 } as const;

  await ensureInvoiceTable();
  const rows = await query(`
    SELECT
      V.IdApertura,
      V.IdVenta,
      CONCAT(V.IdApertura, '-', V.IdVenta) AS Folio,
      V.FechaVenta,
      DATE_FORMAT(V.FechaVenta, '%Y-%m-%d') AS FechaOperacion,
      V.Total,
      V.Cancelada,
      S.IdSolicitud,
      S.Estado,
      S.RFC,
      S.RazonSocial,
      S.UUID,
      GD.IdFacturaGlobal,
      FT.IdFactura
    FROM tblVentas V
    LEFT JOIN tblSolicitudesFacturaDashboard S
      ON S.IdApertura = V.IdApertura AND S.IdVenta = V.IdVenta
    LEFT JOIN tblDetalleFacturaGlobalDashboard GD
      ON GD.IdApertura = V.IdApertura AND GD.IdVenta = V.IdVenta
    LEFT JOIN tblFacturaTicketsDashboard FT
      ON FT.IdApertura = V.IdApertura AND FT.IdVenta = V.IdVenta AND FT.AsignacionActiva = 1
    WHERE V.IdApertura = ? AND V.IdVenta = ?
    LIMIT 1
  `, [verified.idApertura, verified.idVenta]);

  if (!rows[0] || Number(rows[0].Cancelada) > 0) {
    return { error: 'La comanda no existe o fue cancelada', status: 404 } as const;
  }

  return {
    verified,
    ticket: { ...rows[0], ...getBillingAmounts(rows[0].Total, verified.idApertura, verified.idVenta) },
  };
}

export async function GET(_request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params;
    const result = await getTicket(token);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });

    return NextResponse.json({
      ticket: result.ticket,
      expiresAt: result.verified.expiresAt,
      expired: result.verified.expired,
      alreadyRequested: Boolean(result.ticket.IdSolicitud || result.ticket.IdFacturaGlobal || result.ticket.IdFactura),
    });
  } catch (error: unknown) {
    console.error('Error reading self-invoice ticket:', error);
    return NextResponse.json({ error: errorMessage(error) || 'No fue posible consultar el ticket' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, context: RouteParams) {
  try {
    const { token } = await context.params;
    const result = await getTicket(token);
    if ('error' in result) return NextResponse.json({ error: result.error }, { status: result.status });
    if (result.verified.expired) {
      return NextResponse.json({ error: 'La ventana de autofacturación de este ticket terminó' }, { status: 410 });
    }
    if (result.ticket.IdSolicitud || result.ticket.IdFacturaGlobal || result.ticket.IdFactura) {
      return NextResponse.json({ error: 'Este ticket ya fue incluido en una factura' }, { status: 409 });
    }

    const body = await request.json();
    const rfc = clean(body.rfc);
    const legalName = clean(body.razonSocial).replace(/\s+/g, ' ');
    const postalCode = clean(body.codigoPostal);
    const taxRegime = clean(body.regimenFiscal);
    const cfdiUse = clean(body.usoCFDI);
    const email = String(body.email ?? '').trim().toLowerCase();

    if (!/^([A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$/.test(rfc)) {
      return NextResponse.json({ error: 'Captura un RFC válido' }, { status: 400 });
    }
    if (legalName.length < 2 || legalName.length > 254) {
      return NextResponse.json({ error: 'Captura la razón social como aparece en la constancia fiscal' }, { status: 400 });
    }
    if (!/^\d{5}$/.test(postalCode) || !/^\d{3}$/.test(taxRegime) || !/^[A-Z0-9]{3}$/.test(cfdiUse)) {
      return NextResponse.json({ error: 'Revisa código postal, régimen fiscal y uso de CFDI' }, { status: 400 });
    }
    if (email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) {
      return NextResponse.json({ error: 'Captura un correo electrónico válido' }, { status: 400 });
    }

    const fiscal = await getTicketFiscalSummary(result.verified.idApertura, result.verified.idVenta);
    const pool = await getPool();
    const connection = await pool.getConnection();
    try {
      await connection.beginTransaction();
      await connection.query(`SELECT IdVenta FROM tblVentas WHERE IdApertura = ? AND IdVenta = ? FOR UPDATE`, [result.verified.idApertura, result.verified.idVenta]);
      const [used] = await connection.query(`SELECT IdFactura FROM tblFacturaTicketsDashboard WHERE IdApertura = ? AND IdVenta = ? AND AsignacionActiva = 1 LIMIT 1`, [result.verified.idApertura, result.verified.idVenta]);
      if ((used as unknown[]).length) throw Object.assign(new Error('Este ticket ya fue incluido en una factura'), { code: 'ER_DUP_ENTRY' });
      const [header] = await connection.execute(`
        INSERT INTO tblFacturasDashboard
          (Tipo, FechaOperacion, RFC, RazonSocial, CodigoPostal, RegimenFiscal, UsoCFDI, Correo, NumTickets,
           BaseGravable, IVA, IEPS, ConsumoFacturable, Propinas)
        VALUES ('cliente', ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
      `, [result.ticket.FechaOperacion, rfc, legalName, postalCode, taxRegime, cfdiUse, email || null, fiscal.base, fiscal.iva, fiscal.ieps, fiscal.consumption, result.ticket.tip]);
      const idFactura = (header as { insertId: number }).insertId;
      await connection.execute(`
        INSERT INTO tblFacturaTicketsDashboard
          (IdFactura, IdApertura, IdVenta, Folio, FechaVenta, BaseGravable, IVA, IEPS, ConsumoFacturable, Propina)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [idFactura, result.verified.idApertura, result.verified.idVenta, result.ticket.Folio, result.ticket.FechaVenta, fiscal.base, fiscal.iva, fiscal.ieps, fiscal.consumption, result.ticket.tip]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return NextResponse.json({
      success: true,
      message: email
        ? `Solicitud recibida. La factura se enviará a ${email} después del timbrado.`
        : 'Solicitud recibida y pendiente de timbrado.',
      status: 'pendiente_timbrado',
    }, { status: 201 });
  } catch (error: unknown) {
    if (errorCode(error) === 'ER_DUP_ENTRY') {
      return NextResponse.json({ error: 'Este ticket ya fue enviado a facturación' }, { status: 409 });
    }
    console.error('Error creating self-invoice request:', error);
    return NextResponse.json({ error: errorMessage(error) || 'No fue posible enviar la solicitud' }, { status: 500 });
  }
}

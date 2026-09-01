import { NextRequest, NextResponse } from 'next/server';
import { getSession } from '@/lib/auth';
import { query } from '@/lib/db';
import { PacError, sendCfdiByEmail } from '@/lib/facturadigital';
import { ensureInvoiceTable } from '@/lib/invoice-store';

const EMAIL_PATTERN = /^[^\s@]+@[^\s@]+\.[^\s@]{2,}$/;
const errorMessage = (error: unknown) => (error instanceof Error ? error.message : 'Error desconocido');

async function authenticated() {
  try {
    return Boolean(await getSession());
  } catch {
    return false;
  }
}

export async function POST(request: NextRequest) {
  if (!(await authenticated())) return NextResponse.json({ error: 'Sesión no válida' }, { status: 401 });

  try {
    await ensureInvoiceTable();
    const body = await request.json() as Record<string, unknown>;
    const idFactura = Number(body.idFactura);
    if (!Number.isInteger(idFactura) || idFactura <= 0) return NextResponse.json({ error: 'La factura no es válida' }, { status: 400 });

    const rows = await query(`SELECT IdFactura, UUID, Estado, Correo FROM tblFacturasDashboard WHERE IdFactura = ?`, [idFactura]);
    const invoice = rows[0] as { UUID: string | null; Estado: string; Correo: string | null } | undefined;
    if (!invoice) return NextResponse.json({ error: 'La factura no existe' }, { status: 404 });
    if (!invoice.UUID || invoice.Estado !== 'timbrada') return NextResponse.json({ error: 'Solo se pueden enviar facturas ya timbradas' }, { status: 409 });

    const recipient = String(body.correo ?? invoice.Correo ?? '').trim().toLowerCase();
    if (!EMAIL_PATTERN.test(recipient)) return NextResponse.json({ error: 'Captura un correo electrónico válido' }, { status: 400 });
    const note = String(body.mensaje || `Adjuntamos tu factura F-${String(idFactura).padStart(6, '0')}. Gracias por tu visita.`).trim().slice(0, 500);

    try {
      const response = await sendCfdiByEmail(invoice.UUID, recipient, note);
      await query(`INSERT INTO tblCfdiEnviosDashboard (IdFactura, UUID, Correo, Mensaje, Exitoso, Respuesta) VALUES (?,?,?,?,1,?)`, [idFactura, invoice.UUID, recipient, note, response.slice(0, 500)]);
      if (!invoice.Correo) await query(`UPDATE tblFacturasDashboard SET Correo = ? WHERE IdFactura = ?`, [recipient, idFactura]);
      return NextResponse.json({ success: true, message: `Factura enviada a ${recipient}` });
    } catch (error) {
      const detail = error instanceof PacError ? error.message : errorMessage(error);
      await query(`INSERT INTO tblCfdiEnviosDashboard (IdFactura, UUID, Correo, Mensaje, Exitoso, Respuesta) VALUES (?,?,?,?,0,?)`, [idFactura, invoice.UUID, recipient, note, detail.slice(0, 500)]);
      return NextResponse.json({ error: `No fue posible enviar el correo: ${detail}` }, { status: 502 });
    }
  } catch (error: unknown) {
    console.error('Error sending CFDI by email:', error);
    return NextResponse.json({ error: errorMessage(error) }, { status: 500 });
  }
}

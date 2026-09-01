import { NextRequest, NextResponse } from 'next/server';
import { createPortalTicketClaim, getBillingAmounts, verifyPortalTicketClaim } from '@/lib/billing';
import { getPool, query } from '@/lib/db';
import { ensureInvoiceTable } from '@/lib/invoice-store';
import { getTicketFiscalSummary } from '@/lib/taxes';

type SaleRow = {
  IdApertura: number;
  IdVenta: number;
  Folio: string | null;
  FolioVisible: string;
  FechaVenta: string;
  FechaOperacion: string;
  Total: number;
};

const attempts = new Map<string, { count: number; resetsAt: number }>();
const clean = (value: unknown) => String(value ?? '').trim().toUpperCase();
const errorCode = (error: unknown) => typeof error === 'object' && error !== null && 'code' in error ? String(error.code) : '';
const genericTicketError = 'No encontramos un ticket vigente con ese folio y total. Revisa los datos impresos e inténtalo de nuevo.';

function isRateLimited(request: NextRequest) {
  const now = Date.now();
  const address = request.headers.get('x-forwarded-for')?.split(',')[0]?.trim() || 'local';
  const entry = attempts.get(address);
  if (!entry || entry.resetsAt <= now) {
    attempts.set(address, { count: 1, resetsAt: now + 10 * 60 * 1000 });
    return false;
  }
  entry.count += 1;
  return entry.count > 12;
}

function fiscalError(body: Record<string, unknown>) {
  const rfc = clean(body.rfc);
  const legalName = clean(body.razonSocial).replace(/\s+/g, ' ');
  const postalCode = clean(body.codigoPostal);
  const taxRegime = clean(body.regimenFiscal);
  const cfdiUse = clean(body.usoCFDI);
  const email = String(body.email ?? '').trim().toLowerCase();
  if (!/^([A-ZÑ&]{3,4})\d{6}[A-Z0-9]{3}$/.test(rfc)) return 'Captura un RFC válido';
  if (legalName.length < 2 || legalName.length > 254) return 'Captura el nombre exactamente como aparece en tu constancia fiscal';
  if (!/^\d{5}$/.test(postalCode)) return 'Captura un código postal fiscal válido';
  if (!/^\d{3}$/.test(taxRegime)) return 'Selecciona un régimen fiscal válido';
  if (!/^[A-Z0-9]{3}$/.test(cfdiUse)) return 'Selecciona un uso de CFDI válido';
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return 'Captura un correo electrónico válido';
  return '';
}

async function findEligibleTicket(folio: string) {
  return query(`
    SELECT V.IdApertura, V.IdVenta, V.Folio,
           CONCAT(V.IdApertura, '-', V.IdVenta) AS FolioVisible,
           V.FechaVenta, DATE_FORMAT(V.FechaVenta, '%Y-%m-%d') AS FechaOperacion, V.Total
    FROM tblVentas V
    LEFT JOIN tblFacturaTicketsDashboard FT
      ON FT.IdApertura = V.IdApertura AND FT.IdVenta = V.IdVenta AND FT.AsignacionActiva = 1
    LEFT JOIN tblSolicitudesFacturaDashboard S
      ON S.IdApertura = V.IdApertura AND S.IdVenta = V.IdVenta AND S.Estado <> 'cancelada'
    LEFT JOIN tblDetalleFacturaGlobalDashboard GD
      ON GD.IdApertura = V.IdApertura AND GD.IdVenta = V.IdVenta
    WHERE (UPPER(COALESCE(V.Folio, '')) = ? OR CONCAT(V.IdApertura, '-', V.IdVenta) = ?)
      AND COALESCE(V.Cancelada, 0) = 0
      AND FT.IdFactura IS NULL AND S.IdSolicitud IS NULL AND GD.IdVenta IS NULL
      AND (
        (YEAR(V.FechaVenta) = YEAR(CURDATE()) AND MONTH(V.FechaVenta) = MONTH(CURDATE()))
        OR (
          YEAR(V.FechaVenta) = YEAR(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
          AND MONTH(V.FechaVenta) = MONTH(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))
          AND DAY(V.FechaVenta) >= DAY(LAST_DAY(DATE_SUB(CURDATE(), INTERVAL 1 MONTH))) - 4
        )
      )
    ORDER BY V.FechaVenta DESC
    LIMIT 5
  `, [folio, folio]) as Promise<SaleRow[]>;
}

export async function POST(request: NextRequest) {
  try {
    await ensureInvoiceTable();
    const body = await request.json() as Record<string, unknown>;
    const action = String(body.action || 'validate');

    if (action === 'validate') {
      if (isRateLimited(request)) {
        return NextResponse.json({ error: 'Demasiados intentos. Espera unos minutos antes de volver a intentar.' }, { status: 429 });
      }
      const folio = clean(body.folio).replace(/\s+/g, '');
      const submittedTotal = Math.round(Number(body.total) * 100) / 100;
      if (!folio || !Number.isFinite(submittedTotal) || submittedTotal <= 0) {
        return NextResponse.json({ error: genericTicketError }, { status: 400 });
      }

      const candidates = await findEligibleTicket(folio);
      const matches = candidates.filter((sale) => {
        const amount = getBillingAmounts(Number(sale.Total), sale.IdApertura, sale.IdVenta);
        return Math.abs(amount.totalWithTip - submittedTotal) < 0.005;
      });
      if (matches.length !== 1) return NextResponse.json({ error: genericTicketError }, { status: 404 });

      const sale = matches[0];
      const amounts = getBillingAmounts(Number(sale.Total), sale.IdApertura, sale.IdVenta);
      return NextResponse.json({
        success: true,
        claim: createPortalTicketClaim(sale.IdApertura, sale.IdVenta),
        ticket: {
          folio: sale.FolioVisible,
          date: sale.FechaVenta,
          consumption: amounts.taxableConsumption,
          tip: amounts.tip,
          tipPercentage: amounts.tipPercentage,
          total: amounts.totalWithTip,
        },
      });
    }

    if (action !== 'invoice') return NextResponse.json({ error: 'Operación no válida' }, { status: 400 });
    const claim = verifyPortalTicketClaim(String(body.claim || ''));
    if (!claim || claim.expired) return NextResponse.json({ error: 'La validación venció. Vuelve a capturar tu ticket.' }, { status: 410 });
    const invalid = fiscalError(body);
    if (invalid) return NextResponse.json({ error: invalid }, { status: 400 });

    const eligible = await findEligibleTicket(`${claim.idApertura}-${claim.idVenta}`);
    const sale = eligible.find(item => item.IdApertura === claim.idApertura && item.IdVenta === claim.idVenta);
    if (!sale) return NextResponse.json({ error: 'Este ticket ya no está disponible para facturación.' }, { status: 409 });

    const fiscal = await getTicketFiscalSummary(claim.idApertura, claim.idVenta);
    const amounts = getBillingAmounts(Number(sale.Total), claim.idApertura, claim.idVenta);
    const rfc = clean(body.rfc);
    const legalName = clean(body.razonSocial).replace(/\s+/g, ' ');
    const postalCode = clean(body.codigoPostal);
    const taxRegime = clean(body.regimenFiscal);
    const cfdiUse = clean(body.usoCFDI);
    const email = String(body.email).trim().toLowerCase();

    const pool = await getPool();
    const connection = await pool.getConnection();
    let idFactura = 0;
    try {
      await connection.beginTransaction();
      const [locked] = await connection.query(`SELECT IdVenta, Cancelada FROM tblVentas WHERE IdApertura = ? AND IdVenta = ? FOR UPDATE`, [claim.idApertura, claim.idVenta]);
      const lockedSale = (locked as { Cancelada: number }[])[0];
      if (!lockedSale || Number(lockedSale.Cancelada)) throw Object.assign(new Error('Ticket no disponible'), { code: 'TICKET_USED' });
      const [used] = await connection.query(`
        SELECT 1 FROM tblFacturaTicketsDashboard WHERE IdApertura = ? AND IdVenta = ? AND AsignacionActiva = 1
        UNION ALL SELECT 1 FROM tblSolicitudesFacturaDashboard WHERE IdApertura = ? AND IdVenta = ? AND Estado <> 'cancelada'
        UNION ALL SELECT 1 FROM tblDetalleFacturaGlobalDashboard WHERE IdApertura = ? AND IdVenta = ?
        LIMIT 1
      `, [claim.idApertura, claim.idVenta, claim.idApertura, claim.idVenta, claim.idApertura, claim.idVenta]);
      if ((used as unknown[]).length) throw Object.assign(new Error('Ticket ya facturado'), { code: 'TICKET_USED' });

      const [header] = await connection.execute(`
        INSERT INTO tblFacturasDashboard
          (Tipo, FechaOperacion, RFC, RazonSocial, CodigoPostal, CodigoPostalExpedicion, RegimenFiscal, UsoCFDI, Correo, NumTickets,
           BaseGravable, IVA, IEPS, ConsumoFacturable, Propinas)
        VALUES ('cliente', ?, ?, ?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, ?)
      `, [sale.FechaOperacion, rfc, legalName, postalCode, String(process.env.ISSUER_POSTAL_CODE || '').trim() || null, taxRegime, cfdiUse, email, fiscal.base, fiscal.iva, fiscal.ieps, fiscal.consumption, amounts.tip]);
      idFactura = (header as { insertId: number }).insertId;
      await connection.execute(`
        INSERT INTO tblFacturaTicketsDashboard
          (IdFactura, IdApertura, IdVenta, Folio, FechaVenta, BaseGravable, IVA, IEPS, ConsumoFacturable, Propina)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
      `, [idFactura, claim.idApertura, claim.idVenta, sale.FolioVisible, sale.FechaVenta, fiscal.base, fiscal.iva, fiscal.ieps, fiscal.consumption, amounts.tip]);
      await connection.commit();
    } catch (error) {
      await connection.rollback();
      throw error;
    } finally {
      connection.release();
    }

    return NextResponse.json({
      success: true,
      invoiceFolio: `F-${String(idFactura).padStart(6, '0')}`,
      status: 'pendiente_timbrado',
      message: `Tu solicitud ${`F-${String(idFactura).padStart(6, '0')}`} fue recibida y quedó pendiente de timbrado.`,
    }, { status: 201 });
  } catch (error: unknown) {
    if (['ER_DUP_ENTRY', 'TICKET_USED'].includes(errorCode(error))) {
      return NextResponse.json({ error: 'Este ticket ya fue enviado a facturación.' }, { status: 409 });
    }
    console.error('Error in public invoice portal:', error);
    return NextResponse.json({ error: 'No fue posible procesar la solicitud. Inténtalo nuevamente.' }, { status: 500 });
  }
}

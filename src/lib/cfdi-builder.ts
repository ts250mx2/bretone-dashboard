import { FiscalLine, getTicketFiscalSummary, splitIncludedTaxes } from '@/lib/taxes';

/** Claves del catálogo del SAT usadas por el restaurante; ajustables por variable de entorno. */
export const CFDI_SETTINGS = {
  serie: process.env.CFDI_SERIE || 'F',
  claveProdServ: process.env.CFDI_CLAVE_PROD_SERV || '90101501',
  claveUnidad: process.env.CFDI_CLAVE_UNIDAD || 'E48',
  claveProdServGlobal: process.env.CFDI_CLAVE_PROD_SERV_GLOBAL || '01010101',
  claveUnidadGlobal: process.env.CFDI_CLAVE_UNIDAD_GLOBAL || 'ACT',
  regimenEmisor: process.env.ISSUER_TAX_REGIME || '601',
  formaPagoEfectivo: process.env.CFDI_FORMA_PAGO_EFECTIVO || '01',
  formaPagoTarjeta: process.env.CFDI_FORMA_PAGO_TARJETA || '04',
};

const IVA = '002';
const IEPS = '003';

export type BillingInvoice = {
  IdFactura: number;
  Tipo: 'cliente' | 'publico_general' | 'global';
  FechaOperacion: string;
  RFC: string;
  RazonSocial: string;
  CodigoPostal: string;
  CodigoPostalExpedicion: string | null;
  RegimenFiscal: string;
  UsoCFDI: string;
  Periodicidad: string | null;
  Meses: string | null;
  Anio: number | null;
};

export type BillingTicket = {
  IdApertura: number;
  IdVenta: number;
  Folio: string;
  FechaVenta: string;
  ConsumoFacturable: number;
  Tarjeta?: number | null;
};

type Traslado = { Base: string; Impuesto: string; TipoFactor: 'Tasa'; TasaOCuota: string; Importe: string };
type Concepto = {
  ClaveProdServ: string;
  NoIdentificacion: string;
  Cantidad: string;
  ClaveUnidad: string;
  Unidad: string;
  Descripcion: string;
  ValorUnitario: string;
  Importe: string;
  ObjetoImp: string;
  Impuestos: { Traslados: Traslado[] };
};

const round = (value: number) => Math.round(value * 100) / 100;
const money = (value: number) => round(value).toFixed(2);
const taxRate = (percentage: number) => (percentage / 100).toFixed(6);

export function resolveIssuerPostalCode(invoice: Pick<BillingInvoice, 'Tipo' | 'CodigoPostal' | 'CodigoPostalExpedicion'>) {
  const candidates = [
    process.env.ISSUER_POSTAL_CODE,
    invoice.CodigoPostalExpedicion,
    invoice.Tipo === 'cliente' ? '' : invoice.CodigoPostal,
  ];
  const postalCode = candidates.map(value => String(value ?? '').trim()).find(value => /^\d{5}$/.test(value));
  if (!postalCode) {
    throw new Error('Falta el código postal de expedición. Captúralo en la factura o define ISSUER_POSTAL_CODE.');
  }
  return postalCode;
}

/** Agrupa las partidas de un ticket por combinación de tasas: un concepto del CFDI no admite tasas mezcladas. */
function groupLinesByRate(lines: FiscalLine[]) {
  const groups = new Map<string, { ivaRate: number; iepsRate: number; gross: number }>();
  for (const line of lines) {
    const key = `${line.ivaRate}|${line.iepsRate}`;
    const group = groups.get(key) || { ivaRate: line.ivaRate, iepsRate: line.iepsRate, gross: 0 };
    group.gross = round(group.gross + line.gross);
    groups.set(key, group);
  }
  return [...groups.values()].filter(group => Math.abs(group.gross) >= 0.01);
}

const ROUNDING_CANDIDATES = [0, -1, 1, -2, 2];

/**
 * Los precios del POS llevan impuestos incluidos. Se busca la base en centavos que reproduzca el total
 * del ticket y a la vez cuadre con Base × TasaOCuota; cuando no existe (pasa en ~1 de cada 5 importes),
 * la base absorbe el redondeo para conservar el total y el traslado queda dentro del centavo que tolera el SAT.
 */
function resolveTaxes(gross: number, ivaRate: number, iepsRate: number) {
  const ideal = gross / ((1 + iepsRate / 100) * (1 + ivaRate / 100));
  for (const step of ROUNDING_CANDIDATES) {
    const base = round(round(ideal) + step / 100);
    if (base <= 0) continue;
    const ieps = round(base * iepsRate / 100);
    const iva = round((base + ieps) * ivaRate / 100);
    if (round(base + ieps + iva) === round(gross)) return { base, ieps, iva };
  }
  const taxes = splitIncludedTaxes(gross, ivaRate, iepsRate);
  return { base: round(gross - taxes.iva - taxes.ieps), ieps: taxes.ieps, iva: taxes.iva };
}

function buildConcepto(
  group: { ivaRate: number; iepsRate: number; gross: number },
  ticket: BillingTicket,
  isGlobal: boolean,
): Concepto {
  const { base, ieps, iva } = resolveTaxes(group.gross, group.ivaRate, group.iepsRate);

  const traslados: Traslado[] = [];
  if (group.iepsRate > 0) {
    traslados.push({ Base: money(base), Impuesto: IEPS, TipoFactor: 'Tasa', TasaOCuota: taxRate(group.iepsRate), Importe: money(ieps) });
  }
  traslados.push({
    Base: money(base + ieps),
    Impuesto: IVA,
    TipoFactor: 'Tasa',
    TasaOCuota: taxRate(group.ivaRate),
    Importe: money(iva),
  });

  return {
    ClaveProdServ: isGlobal ? CFDI_SETTINGS.claveProdServGlobal : CFDI_SETTINGS.claveProdServ,
    NoIdentificacion: String(ticket.Folio).slice(0, 100),
    Cantidad: '1',
    ClaveUnidad: isGlobal ? CFDI_SETTINGS.claveUnidadGlobal : CFDI_SETTINGS.claveUnidad,
    Unidad: isGlobal ? 'ACTIVIDAD' : 'SERVICIO',
    Descripcion: isGlobal ? 'Venta' : `Consumo de alimentos y bebidas - Ticket ${ticket.Folio}`,
    ValorUnitario: money(base),
    Importe: money(base),
    ObjetoImp: '02',
    Impuestos: { Traslados: traslados },
  };
}

/** Efectivo o tarjeta según el medio que domine el importe facturado; el CFDI PUE exige una forma concreta. */
function resolveFormaPago(tickets: BillingTicket[]) {
  const card = tickets.reduce((sum, ticket) => sum + (Number(ticket.Tarjeta) > 0 ? Number(ticket.ConsumoFacturable) || 0 : 0), 0);
  const cash = tickets.reduce((sum, ticket) => sum + (Number(ticket.Tarjeta) > 0 ? 0 : Number(ticket.ConsumoFacturable) || 0), 0);
  return card > cash ? CFDI_SETTINGS.formaPagoTarjeta : CFDI_SETTINGS.formaPagoEfectivo;
}

function sumTraslados(conceptos: Concepto[]) {
  const grouped = new Map<string, Traslado>();
  for (const concepto of conceptos) {
    for (const traslado of concepto.Impuestos.Traslados) {
      const key = `${traslado.Impuesto}|${traslado.TasaOCuota}`;
      const current = grouped.get(key);
      if (!current) {
        grouped.set(key, { ...traslado });
        continue;
      }
      current.Base = money(Number(current.Base) + Number(traslado.Base));
      current.Importe = money(Number(current.Importe) + Number(traslado.Importe));
    }
  }
  return [...grouped.values()];
}

export type BuiltCfdi = {
  document: Record<string, unknown>;
  subTotal: number;
  impuestos: number;
  total: number;
  conceptos: number;
};

export async function buildInvoiceDocument(invoice: BillingInvoice, tickets: BillingTicket[]): Promise<BuiltCfdi> {
  if (!tickets.length) throw new Error('La factura no tiene tickets asociados');
  if (!/^\d{3}$/.test(CFDI_SETTINGS.regimenEmisor)) throw new Error('El régimen fiscal del emisor (ISSUER_TAX_REGIME) no es válido');

  const isGlobal = invoice.Tipo === 'global';
  const lugarExpedicion = resolveIssuerPostalCode(invoice);

  const summaries = await Promise.all(tickets.map(ticket => getTicketFiscalSummary(ticket.IdApertura, ticket.IdVenta)));
  const conceptos: Concepto[] = [];
  summaries.forEach((summary, index) => {
    const ticket = tickets[index];
    const groups = groupLinesByRate(summary.lines);
    if (!groups.length) throw new Error(`El ticket ${ticket.Folio} no tiene partidas facturables`);
    if (groups.some(group => group.gross < 0)) throw new Error(`El ticket ${ticket.Folio} tiene importes negativos y no puede timbrarse`);
    for (const group of groups) conceptos.push(buildConcepto(group, ticket, isGlobal));
  });

  const subTotal = round(conceptos.reduce((sum, concepto) => sum + Number(concepto.Importe), 0));
  const traslados = sumTraslados(conceptos);
  const impuestos = round(traslados.reduce((sum, traslado) => sum + Number(traslado.Importe), 0));
  const total = round(subTotal + impuestos);

  const document: Record<string, unknown> = {
    Version: '4.0',
    Exportacion: '01',
    Serie: CFDI_SETTINGS.serie,
    Folio: String(invoice.IdFactura),
    Fecha: 'AUTO',
    FormaPago: resolveFormaPago(tickets),
    MetodoPago: 'PUE',
    CondicionesDePago: 'CONTADO',
    Moneda: 'MXN',
    TipoCambio: '1',
    SubTotal: money(subTotal),
    Total: money(total),
    TipoDeComprobante: 'I',
    LugarExpedicion: lugarExpedicion,
    LeyendaFolio: isGlobal ? 'FACTURA GLOBAL' : 'FACTURA',
    Emisor: { RegimenFiscal: CFDI_SETTINGS.regimenEmisor },
    Receptor: {
      Rfc: invoice.RFC,
      Nombre: invoice.RazonSocial,
      UsoCFDI: invoice.UsoCFDI,
      RegimenFiscalReceptor: invoice.RegimenFiscal,
      DomicilioFiscalReceptor: invoice.CodigoPostal,
    },
    Conceptos: conceptos,
    Impuestos: { TotalImpuestosTrasladados: money(impuestos), Traslados: traslados },
  };

  if (isGlobal) {
    document.InformacionGlobal = {
      Periodicidad: invoice.Periodicidad || '01',
      Meses: invoice.Meses || invoice.FechaOperacion.slice(5, 7),
      'Año': String(invoice.Anio || invoice.FechaOperacion.slice(0, 4)),
    };
  }

  return { document, subTotal, impuestos, total, conceptos: conceptos.length };
}

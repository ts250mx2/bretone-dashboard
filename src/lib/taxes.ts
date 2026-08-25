import { query } from '@/lib/db';

export type FiscalLine = {
  idProducto: number;
  description: string;
  quantity: number;
  gross: number;
  base: number;
  ivaRate: number;
  iva: number;
  iepsRate: number;
  ieps: number;
  taxSource: 'producto' | 'pos' | 'predeterminada';
};

export type TicketFiscalSummary = {
  consumption: number;
  base: number;
  iva: number;
  ieps: number;
  lines: FiscalLine[];
};

type RawLine = {
  IdProducto: number;
  Descripcion: string;
  Cantidad: number;
  Precio: number;
  Descuento: number | null;
  IvaDetalle: number;
  IvaProducto: number;
  IvaConfigurada: number | null;
  IepsConfigurado: number | null;
};

const DEFAULT_IVA_RATE = Number(process.env.DEFAULT_RESTAURANT_IVA_RATE || 16);

export function splitIncludedTaxes(grossValue: number, ivaRateValue: number, iepsRateValue: number) {
  const gross = Math.round((Number(grossValue) || 0) * 100) / 100;
  const ivaRate = Math.max(0, Number(ivaRateValue) || 0);
  const iepsRate = Math.max(0, Number(iepsRateValue) || 0);
  const base = gross / ((1 + iepsRate / 100) * (1 + ivaRate / 100));
  const ieps = base * iepsRate / 100;
  const iva = (base + ieps) * ivaRate / 100;
  return {
    base: Math.round(base * 100) / 100,
    ieps: Math.round(ieps * 100) / 100,
    iva: Math.round(iva * 100) / 100,
  };
}

function mapLine(row: RawLine): FiscalLine {
  const configured = row.IvaConfigurada !== null;
  const posRate = Number(row.IvaDetalle) || Number(row.IvaProducto) || 0;
  const ivaRate = configured ? Number(row.IvaConfigurada) : (posRate || DEFAULT_IVA_RATE);
  const iepsRate = Number(row.IepsConfigurado) || 0;
  const gross = Math.round((Number(row.Cantidad) * Number(row.Precio) - Number(row.Descuento || 0)) * 100) / 100;
  const taxes = splitIncludedTaxes(gross, ivaRate, iepsRate);
  return {
    idProducto: row.IdProducto,
    description: row.Descripcion,
    quantity: Number(row.Cantidad),
    gross,
    ...taxes,
    ivaRate,
    iepsRate,
    taxSource: configured ? 'producto' : (posRate ? 'pos' : 'predeterminada'),
  };
}

export async function getTicketFiscalSummary(idApertura: number, idVenta: number): Promise<TicketFiscalSummary> {
  const [sales, rows] = await Promise.all([
    query(`SELECT Total FROM tblVentas WHERE IdApertura = ? AND IdVenta = ? AND COALESCE(Cancelada, 0) = 0 LIMIT 1`, [idApertura, idVenta]),
    query(`
      SELECT D.IdProducto, P.Producto AS Descripcion, D.Cantidad, D.Precio, D.Descuento,
             COALESCE(D.IVA, 0) AS IvaDetalle, COALESCE(P.IVA, 0) AS IvaProducto,
             F.TasaIVA AS IvaConfigurada, F.TasaIEPS AS IepsConfigurado
      FROM tblDetalleVentas D
      INNER JOIN tblProductos P ON P.IdProducto = D.IdProducto
      LEFT JOIN tblConfiguracionFiscalProductosDashboard F ON F.IdProducto = D.IdProducto
      WHERE D.IdApertura = ? AND D.IdVenta = ?
      ORDER BY D.Folio, P.Producto
    `, [idApertura, idVenta]),
  ]);
  if (!sales[0]) throw new Error('No se encontró una venta vigente para esa comanda');

  const lines = rows.map((row: RawLine) => mapLine(row));
  const saleTotal = Math.round(Number(sales[0].Total) * 100) / 100;
  const lineTotal = Math.round(lines.reduce((sum, line) => sum + line.gross, 0) * 100) / 100;
  const difference = Math.round((saleTotal - lineTotal) * 100) / 100;
  if (Math.abs(difference) >= 0.01) {
    const taxes = splitIncludedTaxes(difference, DEFAULT_IVA_RATE, 0);
    lines.push({ idProducto: 0, description: 'Ajuste del ticket', quantity: 1, gross: difference, ...taxes, ivaRate: DEFAULT_IVA_RATE, iepsRate: 0, taxSource: 'predeterminada' });
  }

  return {
    consumption: saleTotal,
    base: Math.round(lines.reduce((sum, line) => sum + line.base, 0) * 100) / 100,
    iva: Math.round(lines.reduce((sum, line) => sum + line.iva, 0) * 100) / 100,
    ieps: Math.round(lines.reduce((sum, line) => sum + line.ieps, 0) * 100) / 100,
    lines,
  };
}


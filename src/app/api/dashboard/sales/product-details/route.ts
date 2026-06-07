import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const productId = searchParams.get('id');
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo   = searchParams.get('dateTo')   || '';
  const trendGroup = searchParams.get('trendGroup') || 'dia';
  const getTrend = searchParams.get('getTrend') === 'true';

  if (!productId || productId === 'null' || productId === 'undefined') {
    return NextResponse.json({ message: 'Missing product ID' }, { status: 400 });
  }

  let dateFilter = '';
  let filterParams: any[] = [];

  if (dateFrom && dateTo) {
    dateFilter = `DATE(v.FechaVenta) BETWEEN ? AND ?`;
    filterParams = [dateFrom, dateTo];
  } else {
    dateFilter = `DATE(v.FechaVenta) = CURDATE()`;
  }

  try {
    const pId = Number(productId);

    // 1. Hourly sales query
    const sqlHours = `
      SELECT
        HOUR(v.FechaVenta)             AS hora,
        COALESCE(SUM(d.Cantidad * d.Precio), 0) AS total,
        COALESCE(SUM(d.Cantidad), 0)            AS cantidad
      FROM tblDetalleVentas d
      JOIN tblVentas v ON d.IdVenta = v.IdVenta AND d.IdApertura = v.IdApertura
      WHERE d.IdProducto = ? AND ${dateFilter} AND v.Cancelada = 0
      GROUP BY HOUR(v.FechaVenta)
      ORDER BY hora ASC
    `;
    const hoursParams = [pId, ...filterParams];

    // 2. Recent transactions query
    const sqlTickets = `
      SELECT
        v.IdVenta,
        v.IdApertura,
        CONCAT(v.IdApertura, '-', v.IdVenta) AS folio,
        v.FechaVenta AS fecha,
        COALESCE(v.Cliente, 'Público General') AS cliente,
        d.Cantidad AS cantidad,
        d.Precio AS precio,
        COALESCE(d.Descuento, 0) AS descuento,
        (d.Cantidad * d.Precio - COALESCE(d.Descuento, 0)) AS total
      FROM tblDetalleVentas d
      JOIN tblVentas v ON d.IdVenta = v.IdVenta AND d.IdApertura = v.IdApertura
      WHERE d.IdProducto = ? AND ${dateFilter} AND v.Cancelada = 0
      ORDER BY v.FechaVenta DESC
      LIMIT 20
    `;
    const ticketsParams = [pId, ...filterParams];

    // 3. Trend query (if requested)
    let sqlTrend = '';
    let trendParams: any[] = [];
    if (getTrend) {
      let selectTrend = `DATE(v.FechaVenta) AS fecha`;
      let groupTrend  = `DATE(v.FechaVenta)`;
      if (trendGroup === 'semana') {
        selectTrend = `DATE_SUB(DATE(v.FechaVenta), INTERVAL WEEKDAY(v.FechaVenta) DAY) AS fecha`;
        groupTrend  = `DATE_SUB(DATE(v.FechaVenta), INTERVAL WEEKDAY(v.FechaVenta) DAY)`;
      } else if (trendGroup === 'mes') {
        selectTrend = `DATE_FORMAT(v.FechaVenta, '%Y-%m-01') AS fecha`;
        groupTrend  = `DATE_FORMAT(v.FechaVenta, '%Y-%m-01')`;
      }

      sqlTrend = `
        SELECT
          ${selectTrend},
          COALESCE(SUM(d.Cantidad * d.Precio), 0) AS total,
          COUNT(DISTINCT v.IdVenta) AS transacciones
        FROM tblDetalleVentas d
        JOIN tblVentas v ON d.IdVenta = v.IdVenta AND d.IdApertura = v.IdApertura
        WHERE d.IdProducto = ? AND ${dateFilter} AND v.Cancelada = 0
        GROUP BY ${groupTrend}
        ORDER BY fecha ASC
      `;
      trendParams = [pId, ...filterParams];
    }

    const [hoursRows, ticketsRows, trendRows] = await Promise.all([
      query(sqlHours, hoursParams),
      query(sqlTickets, ticketsParams),
      getTrend ? query(sqlTrend, trendParams) : Promise.resolve([])
    ]);

    return NextResponse.json({
      hours: hoursRows,
      tickets: ticketsRows,
      trend: trendRows
    });
  } catch (error: any) {
    console.error('Error fetching product details:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

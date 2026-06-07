import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const categoryId = searchParams.get('id');
  const categoryName = searchParams.get('name') || '';
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo   = searchParams.get('dateTo')   || '';
  const trendGroup = searchParams.get('trendGroup') || 'dia';
  const getTrend = searchParams.get('getTrend') === 'true';

  let dateFilter = '';
  let filterParams: any[] = [];

  if (dateFrom && dateTo) {
    dateFilter = `DATE(v.FechaVenta) BETWEEN ? AND ?`;
    filterParams = [dateFrom, dateTo];
  } else {
    dateFilter = `DATE(v.FechaVenta) = CURDATE()`;
  }

  try {
    let sqlQuery = '';
    let params: any[] = [];
    let sqlHours = '';
    let hoursParams: any[] = [];
    let sqlTrend = '';
    let trendParams: any[] = [];

    const isCategorized = categoryId && categoryId !== 'null' && categoryId !== 'undefined';

    // ── Products Query ──
    if (isCategorized) {
      sqlQuery = `
        SELECT
          p.IdProducto AS id,
          p.Producto AS nombre,
          COALESCE(SUM(d.Cantidad * d.Precio), 0) AS total,
          COALESCE(SUM(d.Cantidad), 0)            AS cantidad
        FROM tblDetalleVentas d
        JOIN tblVentas v ON d.IdVenta = v.IdVenta AND d.IdApertura = v.IdApertura
        LEFT JOIN tblProductos p ON d.IdProducto = p.IdProducto
        WHERE p.IdCategoria = ? AND ${dateFilter} AND v.Cancelada = 0
        GROUP BY p.IdProducto, p.Producto
        ORDER BY total DESC
      `;
      params = [Number(categoryId), ...filterParams];

      sqlHours = `
        SELECT
          HOUR(v.FechaVenta)             AS hora,
          COALESCE(SUM(d.Cantidad * d.Precio), 0) AS total,
          COALESCE(SUM(d.Cantidad), 0)            AS cantidad
        FROM tblDetalleVentas d
        JOIN tblVentas v ON d.IdVenta = v.IdVenta AND d.IdApertura = v.IdApertura
        LEFT JOIN tblProductos p ON d.IdProducto = p.IdProducto
        WHERE p.IdCategoria = ? AND ${dateFilter} AND v.Cancelada = 0
        GROUP BY HOUR(v.FechaVenta)
        ORDER BY hora ASC
      `;
      hoursParams = [Number(categoryId), ...filterParams];
    } else {
      sqlQuery = `
        SELECT
          p.IdProducto AS id,
          p.Producto AS nombre,
          COALESCE(SUM(d.Cantidad * d.Precio), 0) AS total,
          COALESCE(SUM(d.Cantidad), 0)            AS cantidad
        FROM tblDetalleVentas d
        JOIN tblVentas v ON d.IdVenta = v.IdVenta AND d.IdApertura = v.IdApertura
        LEFT JOIN tblProductos p ON d.IdProducto = p.IdProducto
        WHERE p.IdCategoria IS NULL AND ${dateFilter} AND v.Cancelada = 0
        GROUP BY p.IdProducto, p.Producto
        ORDER BY total DESC
      `;
      params = [...filterParams];

      sqlHours = `
        SELECT
          HOUR(v.FechaVenta)             AS hora,
          COALESCE(SUM(d.Cantidad * d.Precio), 0) AS total,
          COALESCE(SUM(d.Cantidad), 0)            AS cantidad
        FROM tblDetalleVentas d
        JOIN tblVentas v ON d.IdVenta = v.IdVenta AND d.IdApertura = v.IdApertura
        LEFT JOIN tblProductos p ON d.IdProducto = p.IdProducto
        WHERE p.IdCategoria IS NULL AND ${dateFilter} AND v.Cancelada = 0
        GROUP BY HOUR(v.FechaVenta)
        ORDER BY hora ASC
      `;
      hoursParams = [...filterParams];
    }

    // ── Trend Query (if requested) ──
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
        LEFT JOIN tblProductos p ON d.IdProducto = p.IdProducto
        WHERE ${isCategorized ? 'p.IdCategoria = ?' : 'p.IdCategoria IS NULL'} AND ${dateFilter} AND v.Cancelada = 0
        GROUP BY ${groupTrend}
        ORDER BY fecha ASC
      `;
      trendParams = isCategorized ? [Number(categoryId), ...filterParams] : [...filterParams];
    }

    const [rows, hoursRows, trendRows] = await Promise.all([
      query(sqlQuery, params),
      query(sqlHours, hoursParams),
      getTrend ? query(sqlTrend, trendParams) : Promise.resolve([])
    ]);

    return NextResponse.json({ 
      products: rows, 
      hours: hoursRows, 
      trend: trendRows 
    });
  } catch (error: any) {
    console.error('Error fetching category details:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

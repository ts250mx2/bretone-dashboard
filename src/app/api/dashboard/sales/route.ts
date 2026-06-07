import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const period   = searchParams.get('period')   || 'today'; // today | yesterday | week | month
  const groupBy  = searchParams.get('groupBy')  || 'categoria'; // categoria | producto
  const dateFrom = searchParams.get('dateFrom') || ''; // YYYY-MM-DD
  const dateTo   = searchParams.get('dateTo')   || ''; // YYYY-MM-DD
  const trendGroup = searchParams.get('trendGroup') || 'dia'; // dia | semana | mes

  // Build date filter — custom range takes priority over period preset
  let dateFilter = '';
  let filterParams: string[] = [];

  if (dateFrom && dateTo) {
    dateFilter = `DATE(v.FechaVenta) BETWEEN ? AND ?`;
    filterParams = [dateFrom, dateTo];
  } else {
    switch (period) {
      case 'today':
        dateFilter = `DATE(v.FechaVenta) = CURDATE()`;
        break;
      case 'yesterday':
        dateFilter = `DATE(v.FechaVenta) = DATE_SUB(CURDATE(), INTERVAL 1 DAY)`;
        break;
      case 'week':
        dateFilter = `v.FechaVenta >= DATE_SUB(CURDATE(), INTERVAL 6 DAY)`;
        break;
      case 'month':
        dateFilter = `v.FechaVenta >= DATE_SUB(CURDATE(), INTERVAL 29 DAY)`;
        break;
      default:
        dateFilter = `DATE(v.FechaVenta) = CURDATE()`;
    }
  }

  try {
    // ── KPI Summary ──────────────────────────────────────────────────────────
    const sqlKpi = `
      SELECT
        COALESCE(SUM(v.Total), 0)       AS totalVentas,
        COUNT(v.IdVenta)                AS numTransacciones,
        COALESCE(AVG(v.Total), 0)       AS ticketPromedio,
        COALESCE(SUM(CASE WHEN v.Tarjeta = 0 THEN v.Total ELSE 0 END), 0) AS efectivo,
        COALESCE(SUM(CASE WHEN v.Tarjeta > 0 THEN v.Total ELSE 0 END), 0) AS tarjeta,
        0                               AS transferencia
      FROM tblVentas v
      WHERE ${dateFilter} AND v.Cancelada = 0
    `;
    const kpiRows = await query(sqlKpi, filterParams);

    const sqlCancel = `
      SELECT COUNT(*) AS canceladas 
      FROM tblVentas v 
      WHERE ${dateFilter} AND v.Cancelada > 0
    `;
    const cancelRows = await query(sqlCancel, filterParams);

    const kpiData = {
      ...(kpiRows[0] || { totalVentas: 0, numTransacciones: 0, ticketPromedio: 0, efectivo: 0, tarjeta: 0, transferencia: 0 }),
      canceladas: cancelRows[0]?.canceladas || 0
    };

    // ── Sales Trend (Day, Week, or Month) ────────────────────────────────────
    let selectTrend = `DATE(v.FechaVenta) AS fecha`;
    let groupTrend  = `DATE(v.FechaVenta)`;

    if (trendGroup === 'semana') {
      selectTrend = `DATE_SUB(DATE(v.FechaVenta), INTERVAL WEEKDAY(v.FechaVenta) DAY) AS fecha`;
      groupTrend  = `DATE_SUB(DATE(v.FechaVenta), INTERVAL WEEKDAY(v.FechaVenta) DAY)`;
    } else if (trendGroup === 'mes') {
      selectTrend = `DATE_FORMAT(v.FechaVenta, '%Y-%m-01') AS fecha`;
      groupTrend  = `DATE_FORMAT(v.FechaVenta, '%Y-%m-01')`;
    }

    const sqlTrend = `
      SELECT
        ${selectTrend},
        COALESCE(SUM(v.Total), 0)       AS total,
        COUNT(v.IdVenta)                AS transacciones
      FROM tblVentas v
      WHERE ${dateFilter} AND v.Cancelada = 0
      GROUP BY ${groupTrend}
      ORDER BY fecha ASC
    `;
    const trendRows = await query(sqlTrend, filterParams);

    // ── Breakdown by Category or Product ─────────────────────────────────────
    let breakdownRows: any[] = [];
    if (groupBy === 'categoria') {
      const sqlCat = `
        SELECT
          c.IdCategoria                           AS id,
          COALESCE(c.Categoria, 'Sin Categoría') AS nombre,
          COALESCE(SUM(d.Cantidad * d.Precio), 0) AS total,
          COALESCE(SUM(d.Cantidad), 0)            AS cantidad
        FROM tblDetalleVentas d
        JOIN tblVentas v ON d.IdVenta = v.IdVenta AND d.IdApertura = v.IdApertura
        LEFT JOIN tblProductos p ON d.IdProducto = p.IdProducto
        LEFT JOIN tblCategorias c ON p.IdCategoria = c.IdCategoria
        WHERE ${dateFilter} AND v.Cancelada = 0
        GROUP BY c.IdCategoria, c.Categoria
        ORDER BY total DESC
        LIMIT 10
      `;
      breakdownRows = await query(sqlCat, filterParams);
    } else {
      const sqlProd = `
        SELECT
          COALESCE(p.Producto, 'Sin Producto') AS nombre,
          COALESCE(SUM(d.Cantidad * d.Precio), 0) AS total,
          COALESCE(SUM(d.Cantidad), 0)            AS cantidad
        FROM tblDetalleVentas d
        JOIN tblVentas v ON d.IdVenta = v.IdVenta AND d.IdApertura = v.IdApertura
        LEFT JOIN tblProductos p ON d.IdProducto = p.IdProducto
        WHERE ${dateFilter} AND v.Cancelada = 0
        GROUP BY d.IdProducto, p.Producto
        ORDER BY total DESC
        LIMIT 10
      `;
      breakdownRows = await query(sqlProd, filterParams);
    }

    // ── Hourly Heatmap (hour 0–23, days of week 0–6) ────────────────────────
    const sqlHeatmap = `
      SELECT
        (DAYOFWEEK(v.FechaVenta) - 1)  AS diaSemana,
        HOUR(v.FechaVenta)             AS hora,
        COALESCE(SUM(v.Total), 0)      AS total,
        COUNT(v.IdVenta)               AS transacciones
      FROM tblVentas v
      WHERE ${dateFilter} AND v.Cancelada = 0
      GROUP BY (DAYOFWEEK(v.FechaVenta) - 1), HOUR(v.FechaVenta)
      ORDER BY (DAYOFWEEK(v.FechaVenta) - 1), HOUR(v.FechaVenta)
    `;
    const heatmapRows = await query(sqlHeatmap, filterParams);

    return NextResponse.json({
      kpi: kpiData,
      trend: trendRows,
      breakdown: breakdownRows,
      heatmap: heatmapRows,
    });
  } catch (error: any) {
    console.error('Dashboard sales error:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

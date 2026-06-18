import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo   = searchParams.get('dateTo')   || '';

  try {
    let dateFilter = '';
    let filterParams: string[] = [];

    if (dateFrom && dateTo) {
      dateFilter = `DATE(v.FechaVenta) BETWEEN ? AND ?`;
      filterParams = [dateFrom, dateTo];
    } else {
      // Find the most recent date with sales to avoid empty data
      const lastSaleRow = await query(`
        SELECT DATE(Max(FechaVenta)) AS lastDate 
        FROM tblVentas 
        WHERE Cancelada = 0
      `);
      let resolvedDate = '';
      if (lastSaleRow && lastSaleRow[0] && lastSaleRow[0].lastDate) {
        const d = new Date(lastSaleRow[0].lastDate);
        const year = d.getFullYear();
        const month = String(d.getMonth() + 1).padStart(2, '0');
        const day = String(d.getDate()).padStart(2, '0');
        resolvedDate = `${year}-${month}-${day}`;
      } else {
        const today = new Date();
        const year = today.getFullYear();
        const month = String(today.getMonth() + 1).padStart(2, '0');
        const day = String(today.getDate()).padStart(2, '0');
        resolvedDate = `${year}-${month}-${day}`;
      }
      dateFilter = `DATE(v.FechaVenta) = ?`;
      filterParams = [resolvedDate];
    }

    // Standard Hourly Sales Query (using HOUR(v.FechaVenta))
    const sqlStandard = `
      SELECT 
        COALESCE(Sum(d.Precio * d.Cantidad), 0) AS Total, 
        HOUR(v.FechaVenta) AS Hora 
      FROM tblDetalleVentas d
      JOIN tblVentas v ON d.IdVenta = v.IdVenta AND d.IdApertura = v.IdApertura 
      WHERE v.Cancelada = 0 AND ${dateFilter}
      GROUP BY HOUR(v.FechaVenta)
      ORDER BY Hora ASC
    `;

    // Real Hourly Sales Query (using HOUR(d.Fecha))
    const sqlReal = `
      SELECT 
        COALESCE(Sum(d.Precio * d.Cantidad), 0) AS Total, 
        HOUR(d.Fecha) AS Hora 
      FROM tblDetalleVentas d
      JOIN tblVentas v ON d.IdVenta = v.IdVenta AND d.IdApertura = v.IdApertura 
      WHERE v.Cancelada = 0 AND ${dateFilter}
      GROUP BY HOUR(d.Fecha)
      ORDER BY Hora ASC
    `;

    // Time delay queries by category (elapsed prep to pay time)
    const sqlTimeByCategory = `
      SELECT 
        COALESCE(c.Categoria, 'Sin Categoría') AS nombre,
        ROUND(AVG(TIMESTAMPDIFF(MINUTE, d.Fecha, v.FechaVenta)), 1) AS tiempoPromedio,
        COALESCE(SUM(d.Cantidad), 0) AS cantidad
      FROM tblDetalleVentas d
      JOIN tblVentas v ON d.IdVenta = v.IdVenta AND d.IdApertura = v.IdApertura
      LEFT JOIN tblProductos p ON d.IdProducto = p.IdProducto
      LEFT JOIN tblCategorias c ON p.IdCategoria = c.IdCategoria
      WHERE v.Cancelada = 0 AND ${dateFilter}
        AND d.Fecha IS NOT NULL AND v.FechaVenta IS NOT NULL
        AND v.FechaVenta >= d.Fecha
      GROUP BY c.IdCategoria, c.Categoria
      ORDER BY tiempoPromedio DESC
    `;

    // Time delay queries by product (elapsed prep to pay time)
    const sqlTimeByProduct = `
      SELECT 
        COALESCE(p.Producto, 'Sin Producto') AS nombre,
        COALESCE(c.Categoria, 'Sin Categoría') AS categoria,
        ROUND(AVG(TIMESTAMPDIFF(MINUTE, d.Fecha, v.FechaVenta)), 1) AS tiempoPromedio,
        COALESCE(SUM(d.Cantidad), 0) AS cantidad
      FROM tblDetalleVentas d
      JOIN tblVentas v ON d.IdVenta = v.IdVenta AND d.IdApertura = v.IdApertura
      LEFT JOIN tblProductos p ON d.IdProducto = p.IdProducto
      LEFT JOIN tblCategorias c ON p.IdCategoria = c.IdCategoria
      WHERE v.Cancelada = 0 AND ${dateFilter}
        AND d.Fecha IS NOT NULL AND v.FechaVenta IS NOT NULL
        AND v.FechaVenta >= d.Fecha
      GROUP BY p.IdProducto, p.Producto, c.Categoria
      ORDER BY tiempoPromedio DESC
      LIMIT 30
    `;

    const [standardRows, realRows, timeByCategoryRows, timeByProductRows] = await Promise.all([
      query(sqlStandard, filterParams),
      query(sqlReal, filterParams),
      query(sqlTimeByCategory, filterParams),
      query(sqlTimeByProduct, filterParams)
    ]);

    // Consolidate standard and real rows into hours
    const hoursMap: Record<number, { hora: number; totalStandard: number; totalReal: number }> = {};
    for (let h = 0; h < 24; h++) {
      hoursMap[h] = { hora: h, totalStandard: 0, totalReal: 0 };
    }

    standardRows.forEach(row => {
      const h = Number(row.Hora);
      if (hoursMap[h]) {
        hoursMap[h].totalStandard = Number(row.Total || 0);
      }
    });

    realRows.forEach(row => {
      const h = Number(row.Hora);
      if (hoursMap[h]) {
        hoursMap[h].totalReal = Number(row.Total || 0);
      }
    });

    const mergedData = Object.values(hoursMap)
      .map(item => {
        const diferencia = item.totalStandard - item.totalReal;
        const pctDiferencia = item.totalReal > 0 ? (diferencia / item.totalReal) * 100 : 0;
        return {
          ...item,
          diferencia,
          pctDiferencia
        };
      })
      // Filter out completely empty hours
      .filter(item => item.totalStandard > 0 || item.totalReal > 0);

    return NextResponse.json({
      dateFrom: filterParams[0],
      dateTo: filterParams[1] || filterParams[0],
      data: mergedData,
      timeByCategory: timeByCategoryRows,
      timeByProduct: timeByProductRows
    });
  } catch (error: any) {
    console.error('Error in api/dashboard/sales/comparativa-horas:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

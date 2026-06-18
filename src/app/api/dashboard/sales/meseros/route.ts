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
      dateFilter = `DATE(tblVentas.FechaVenta) BETWEEN ? AND ?`;
      filterParams = [dateFrom, dateTo];
    } else {
      // Find the most recent date with sales to avoid displaying empty data
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
      dateFilter = `DATE(tblVentas.FechaVenta) = ?`;
      filterParams = [resolvedDate];
    }

    // Execute the SQL query with range placeholders
    const sqlQuery = `
      SELECT 
        Sum(tblDetalleVentas.Precio * tblDetalleVentas.Cantidad) AS Total, 
        COALESCE(NULLIF(TRIM(tblUsuarios.Usuario), ''), 'Sin Mesero') AS Mesero, 
        HOUR(tblVentas.FechaVenta) AS Hora 
      FROM (tblDetalleVentas 
        INNER JOIN tblVentas ON tblDetalleVentas.IdVenta = tblVentas.IdVenta 
                             AND tblDetalleVentas.IdApertura = tblVentas.IdApertura) 
        LEFT JOIN tblUsuarios ON tblVentas.IdUsuarioMesa = tblUsuarios.IdUsuario 
      WHERE tblVentas.Cancelada = 0 
        AND ${dateFilter}
      GROUP BY COALESCE(NULLIF(TRIM(tblUsuarios.Usuario), ''), 'Sin Mesero'), HOUR(tblVentas.FechaVenta) 
      ORDER BY HOUR(tblVentas.FechaVenta)
    `;

    const rows = await query(sqlQuery, filterParams);

    return NextResponse.json({
      dateFrom: filterParams[0],
      dateTo: filterParams[1] || filterParams[0],
      data: rows
    });
  } catch (error: any) {
    console.error('Error in api/dashboard/sales/meseros:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

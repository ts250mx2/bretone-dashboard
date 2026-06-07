import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const startDate = searchParams.get('startDate');
  const endDate = searchParams.get('endDate');
  const idApertura = searchParams.get('idApertura'); // Optional, to filter by box opening

  if (!startDate || !endDate) {
    return NextResponse.json({
      error: 'Missing required parameters: startDate and endDate'
    }, { status: 400 });
  }

  try {
    let filterCond = 'DATE(A.FechaVenta) >= ? AND DATE(A.FechaVenta) <= ?';
    let params: any[] = [startDate, endDate];

    if (idApertura) {
      filterCond += ' AND A.IdApertura = ?';
      params.push(idApertura);
    }

    const sqlQuery = `
      SELECT 
          A.IdVenta, 
          A.IdApertura,
          CONCAT(A.IdApertura, '-', A.IdVenta) AS "Folio Venta", 
          A.FechaVenta, 
          COALESCE(A.Cliente, 'Público General') AS Cliente, 
          COUNT(H.IdVenta) AS Productos, 
          A.Total, 
          A.Efectivo AS "Pago Efectivo", 
          A.Tarjeta AS "Pago Tarjeta",
          U.Usuario AS Cajero,
          A.Cancelada
      FROM tblVentas A
      LEFT JOIN tblDetalleVentas H ON A.IdVenta = H.IdVenta AND A.IdApertura = H.IdApertura
      LEFT JOIN tblUsuarios U ON A.IdUsuarioPago = U.IdUsuario
      WHERE ${filterCond}
      GROUP BY
          A.IdVenta,
          A.IdApertura,
          A.Folio,
          A.FechaVenta,
          A.Cliente,
          A.Total,
          A.Efectivo,
          A.Tarjeta,
          U.Usuario,
          A.Cancelada
      ORDER BY A.FechaVenta DESC, A.Folio DESC
    `;

    const salesData = await query(sqlQuery, params);

    return NextResponse.json({
      success: true,
      data: salesData
    });

  } catch (error: any) {
    console.error('Error in API /ventas-detalle:', error);
    return NextResponse.json({
      error: error.message || 'Database error fetching detailed sales'
    }, { status: 500 });
  }
}

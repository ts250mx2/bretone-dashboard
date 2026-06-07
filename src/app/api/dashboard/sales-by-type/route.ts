import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ message: 'Faltan fechas dateFrom o dateTo' }, { status: 400 });
  }

  try {
    const sqlQuery = `
      SELECT
        CASE 
          WHEN VentaEn IN (0,3) THEN 'Mesa'
          WHEN VentaEn = 1 THEN 'Para Llevar'
          WHEN VentaEn = 2 THEN 'Domicilio'
          ELSE 'Otro'
        END AS nombre,
        COALESCE(SUM(Total), 0) AS total,
        COUNT(IdVenta) AS cantidad
      FROM tblVentas
      WHERE DATE(FechaVenta) BETWEEN ? AND ? AND Cancelada = 0
      GROUP BY nombre
      ORDER BY total DESC
    `;

    const rows = await query(sqlQuery, [dateFrom, dateTo]);

    // KPI data: aggregate the types
    let totalVentas = 0;
    let numTransacciones = 0;
    
    rows.forEach((r: any) => {
      totalVentas += Number(r.total);
      numTransacciones += Number(r.cantidad);
    });

    const ticketPromedio = numTransacciones > 0 ? totalVentas / numTransacciones : 0;

    return NextResponse.json({
      data: rows,
      kpis: {
        totalVentas,
        numTransacciones,
        ticketPromedio
      }
    });

  } catch (error: any) {
    console.error('Sales by type error:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

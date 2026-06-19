import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo = searchParams.get('dateTo') || '';

  if (!dateFrom || !dateTo) {
    return NextResponse.json({ error: 'Faltan parámetros dateFrom o dateTo' }, { status: 400 });
  }

  try {
    const sqlQuery = `
      SELECT 
        C.IdConsumo,
        C.FechaConsumo,
        C.IdUsuario,
        COALESCE(U.Usuario, 'Desconocido') AS Usuario,
        C.Subtotal,
        C.Descueto AS Descuento,
        C.Total,
        C.VentaEn
      FROM tblConsumos C
      LEFT JOIN tblUsuarios U ON C.IdUsuario = U.IdUsuario
      WHERE DATE(C.FechaConsumo) BETWEEN ? AND ?
      ORDER BY C.FechaConsumo DESC
    `;

    const data = await query(sqlQuery, [dateFrom, dateTo]);

    // Calculate KPIs
    let totalMonto = 0;
    let totalConsumos = data.length;
    const uniqueUsers = new Set();
    let totalDescuento = 0;

    data.forEach((row: any) => {
      totalMonto += Number(row.Total || 0);
      totalDescuento += Number(row.Descuento || 0);
      if (row.IdUsuario) {
        uniqueUsers.add(row.IdUsuario);
      }
    });

    const averageConsumo = totalConsumos > 0 ? totalMonto / totalConsumos : 0;

    return NextResponse.json({
      success: true,
      data,
      kpis: {
        totalMonto,
        totalConsumos,
        uniqueEmployees: uniqueUsers.size,
        averageConsumo,
        totalDescuento
      }
    });

  } catch (error: any) {
    console.error('Error in API /reportes/consumos:', error);
    return NextResponse.json({
      error: error.message || 'Error de base de datos consultando consumos'
    }, { status: 500 });
  }
}

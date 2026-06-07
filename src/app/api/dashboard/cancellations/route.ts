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
        C.IdCancelacion,
        C.FechaCancelacion,
        C.MotivoCancelacion,
        C.Aquien AS Cliente,
        C.IdVenta,
        C.IdApertura,
        COALESCE(SUM(DC.Cantidad * DC.Precio), 0) AS MontoCancelado,
        S.Usuario AS Supervisor,
        Caj.Usuario AS Cajero
      FROM tblCancelaciones C
      LEFT JOIN tblDetalleCancelaciones DC ON C.IdCancelacion = DC.IdCancelacion
      LEFT JOIN tblAperturasCierres A ON C.IdApertura = A.IdApertura
      LEFT JOIN tblUsuarios S ON C.IdSupervisor = S.IdUsuario
      LEFT JOIN tblUsuarios Caj ON A.IdCajero = Caj.IdUsuario
      WHERE DATE(C.FechaCancelacion) BETWEEN ? AND ?
      GROUP BY 
        C.IdCancelacion,
        C.FechaCancelacion,
        C.MotivoCancelacion,
        C.Aquien,
        C.IdVenta,
        C.IdApertura,
        S.Usuario,
        Caj.Usuario
      ORDER BY C.FechaCancelacion DESC
    `;

    const cancelaciones = await query(sqlQuery, [dateFrom, dateTo]);

    // KPI Calculation
    let totalMonto = 0;
    let totalTransacciones = cancelaciones.length;
    let motivosCount: Record<string, number> = {};

    cancelaciones.forEach((c: any) => {
      totalMonto += Number(c.MontoCancelado);
      const motivo = c.MotivoCancelacion || 'Sin motivo';
      motivosCount[motivo] = (motivosCount[motivo] || 0) + 1;
    });

    const topMotivos = Object.entries(motivosCount)
      .map(([motivo, count]) => ({ motivo, count }))
      .sort((a, b) => b.count - a.count);

    return NextResponse.json({
      success: true,
      data: cancelaciones,
      kpis: {
        totalMonto,
        totalTransacciones,
        topMotivos: topMotivos.slice(0, 5) // top 5 motivos
      }
    });

  } catch (error: any) {
    console.error('Error in API /cancellations:', error);
    return NextResponse.json({
      error: error.message || 'Error de base de datos consultando cancelaciones'
    }, { status: 500 });
  }
}

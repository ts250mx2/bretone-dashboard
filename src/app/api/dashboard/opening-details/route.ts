import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fechaInicio = searchParams.get('fechaInicio');
    const fechaFin = searchParams.get('fechaFin');

    if (!fechaInicio || !fechaFin) {
      return NextResponse.json({ error: 'Missing required parameters' }, { status: 400 });
    }

    const sql = `
      SELECT 
          A.IdApertura, 
          CONCAT(CAST(A.IdApertura AS CHAR)) AS \`Z\`, 
          COALESCE(A.IdComputadora, 1) AS Caja, 
          A.FechaApertura AS \`Fecha Apertura\`, 
          C.Usuario AS Cajero,
          COUNT(CASE WHEN V.Cancelada = 0 THEN V.IdVenta ELSE NULL END) AS Tickets, 
          COALESCE(SUM(CASE WHEN V.Cancelada = 0 THEN V.Total ELSE 0 END), 0) AS \`Total Venta\`, 
          CASE WHEN A.FechaCierre = '0000-00-00 00:00:00' OR A.FechaCierre IS NULL THEN NULL ELSE A.FechaCierre END AS FechaCierre
      FROM tblAperturasCierres A
      LEFT JOIN tblUsuarios C ON A.IdCajero = C.IdUsuario
      LEFT JOIN tblVentas V ON A.IdApertura = V.IdApertura
      WHERE DATE(A.FechaApertura) >= ? AND DATE(A.FechaApertura) <= ?
      GROUP BY A.IdApertura, A.FechaApertura, C.Usuario, A.FechaCierre, A.IdComputadora
      ORDER BY A.FechaApertura DESC
    `;

    const results = await query(sql, [fechaInicio, fechaFin]);
    return NextResponse.json(results);
  } catch (error: any) {
    console.error('Error fetching opening details:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

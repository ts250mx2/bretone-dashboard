import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fecha = searchParams.get('fecha'); // Expects YYYY-MM-DD

    if (!fecha) {
      return NextResponse.json({ error: 'Missing date parameter' }, { status: 400 });
    }

    // Query for all box openings on the selected date
    const sql = `
      SELECT
          A.IdApertura,
          A.FechaApertura AS RawFechaApertura,
          A.FechaCierre AS RawFechaCierre,
          DATE_FORMAT(A.FechaApertura, '%H:%i') AS HoraApertura,
          CASE WHEN A.FechaCierre = '0000-00-00 00:00:00' OR A.FechaCierre IS NULL THEN NULL ELSE DATE_FORMAT(A.FechaCierre, '%H:%i') END AS HoraCierre,
          COALESCE(A.IdComputadora, 1) AS Caja,
          A.FondoCaja,
          A.Efectivo,
          U.Usuario AS Cajero,
          SA.Usuario AS SupervisorApertura,
          SC.Usuario AS SupervisorCierre,
          COALESCE(V.Total, 0) AS TotalVentas,
          COALESCE(V.Operaciones, 0) AS NumTransacciones,
          COALESCE(VC.Total, 0) AS CancelacionesMonto,
          COALESCE(VC.Operaciones, 0) AS Cancelaciones
      FROM tblAperturasCierres A
      LEFT JOIN tblUsuarios U ON A.IdCajero = U.IdUsuario
      LEFT JOIN tblUsuarios SA ON A.IdSupervisorApertura = SA.IdUsuario
      LEFT JOIN tblUsuarios SC ON A.IdSupervisorCierre = SC.IdUsuario
      LEFT JOIN (
          SELECT IdApertura, SUM(Total) AS Total, COUNT(*) AS Operaciones
          FROM tblVentas
          WHERE Cancelada = 0
          GROUP BY IdApertura
      ) V ON A.IdApertura = V.IdApertura
      LEFT JOIN (
          SELECT IdApertura, SUM(Total) AS Total, COUNT(*) AS Operaciones
          FROM tblVentas
          WHERE Cancelada > 0
          GROUP BY IdApertura
      ) VC ON A.IdApertura = VC.IdApertura
      WHERE DATE(A.FechaApertura) = ?
      ORDER BY A.IdApertura DESC
    `;

    const rows = await query(sql, [fecha]);

    // Format the response for the frontend Kanban dashboard
    const result = rows.map((op: any) => {
      const closingFinished = op.RawFechaCierre && op.RawFechaCierre !== 'Invalid Date' && op.RawFechaCierre !== '0000-00-00 00:00:00';
      return {
        id: op.IdApertura,
        caja: op.Caja,
        cajero: op.Cajero || 'Cajero General',
        supervisorApertura: op.SupervisorApertura || 'Supervisor',
        supervisorCierre: op.SupervisorCierre || 'Supervisor',
        horaApertura: op.HoraApertura,
        horaCierre: op.HoraCierre,
        rawFechaApertura: op.RawFechaApertura,
        rawFechaCierre: closingFinished ? op.RawFechaCierre : null,
        fondoCaja: op.FondoCaja,
        ventas: op.TotalVentas,
        ventasCount: op.NumTransacciones,
        ticketPromedio: op.NumTransacciones > 0 ? op.TotalVentas / op.NumTransacciones : 0,
        cancelaciones: op.Cancelaciones,
        cancelacionesMonto: op.CancelacionesMonto,
        corteTerminado: !!closingFinished,
        efectivoCierre: op.Efectivo,
      };
    });

    return NextResponse.json(result);
  } catch (error: any) {
    console.error('Error fetching operations list:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

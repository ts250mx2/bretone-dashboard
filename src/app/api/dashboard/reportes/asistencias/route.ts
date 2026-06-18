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
      dateFilter = `DATE(tblAsistencias.FechaAsistencia) BETWEEN ? AND ?`;
      filterParams = [dateFrom, dateTo];
    } else {
      // Find the most recent date with check-ins to avoid displaying empty data
      const lastAsistRow = await query(`
        SELECT DATE(Max(FechaAsistencia)) AS lastDate 
        FROM tblAsistencias
      `);
      let resolvedDate = '';
      if (lastAsistRow && lastAsistRow[0] && lastAsistRow[0].lastDate) {
        const d = new Date(lastAsistRow[0].lastDate);
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
      dateFilter = `DATE(tblAsistencias.FechaAsistencia) = ?`;
      filterParams = [resolvedDate];
    }

    const sqlQuery = `
      SELECT 
        tblAsistencias.IdAsistencia, 
        tblAsistencias.IdUsuario, 
        COALESCE(tblUsuarios.Usuario, 'Desconocido') AS Usuario, 
        tblAsistencias.FechaAsistencia, 
        tblAsistencias.ExitoHuella 
      FROM tblAsistencias
      LEFT JOIN tblUsuarios ON tblAsistencias.IdUsuario = tblUsuarios.IdUsuario
      WHERE ${dateFilter}
      ORDER BY tblAsistencias.FechaAsistencia DESC
    `;

    const rows = await query(sqlQuery, filterParams);

    return NextResponse.json({
      dateFrom: filterParams[0],
      dateTo: filterParams[1] || filterParams[0],
      data: rows
    });
  } catch (error: any) {
    console.error('Error in api/dashboard/reportes/asistencias:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

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
      dateFilter = `DATE(tblAlertas.FechaAlerta) BETWEEN ? AND ?`;
      filterParams = [dateFrom, dateTo];
    } else {
      // Find the most recent date with alerts to avoid displaying empty data
      const lastAlertRow = await query(`
        SELECT DATE(Max(FechaAlerta)) AS lastDate 
        FROM tblAlertas
      `);
      let resolvedDate = '';
      if (lastAlertRow && lastAlertRow[0] && lastAlertRow[0].lastDate) {
        const d = new Date(lastAlertRow[0].lastDate);
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
      dateFilter = `DATE(tblAlertas.FechaAlerta) = ?`;
      filterParams = [resolvedDate];
    }

    const sqlQuery = `
      SELECT 
        tblAlertas.IdAlerta, 
        tblAlertas.Alerta, 
        tblAlertas.IdUsuario, 
        COALESCE(tblUsuarios.Usuario, 'Sistema/Otro') AS Usuario, 
        tblAlertas.IdApertura, 
        tblAlertas.FechaAlerta, 
        tblAlertas.Rojo 
      FROM tblAlertas
      LEFT JOIN tblUsuarios ON tblAlertas.IdUsuario = tblUsuarios.IdUsuario
      WHERE ${dateFilter}
      ORDER BY tblAlertas.FechaAlerta DESC
    `;

    const rows = await query(sqlQuery, filterParams);

    return NextResponse.json({
      dateFrom: filterParams[0],
      dateTo: filterParams[1] || filterParams[0],
      data: rows
    });
  } catch (error: any) {
    console.error('Error in api/dashboard/reportes/alertas:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

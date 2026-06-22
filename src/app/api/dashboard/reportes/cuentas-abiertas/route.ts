import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(request: NextRequest) {
  try {
    const sqlQuery = `
      SELECT 
          v.IdVenta, 
          v.IdApertura,
          CONCAT(v.IdApertura, '-', v.IdVenta) AS Folio, 
          v.FechaVenta, 
          v.Total,
          v.Personas,
          CASE 
            WHEN v.VentaEn IN (0, 3) THEN 'Mesa'
            WHEN v.VentaEn = 1 THEN 'Para Llevar'
            WHEN v.VentaEn = 2 THEN 'Domicilio'
            ELSE 'Otro'
          END AS TipoVenta,
          COALESCE(u.Usuario, 'Sin Mesero') AS Mesero,
          COUNT(d.IdVenta) AS CantidadProductos
      FROM tblVentas v
      LEFT JOIN tblDetalleVentas d ON v.IdVenta = d.IdVenta AND v.IdApertura = d.IdApertura
      LEFT JOIN tblUsuarios u ON v.IdUsuarioMesa = u.IdUsuario
      WHERE v.Cancelada = 0 AND v.Efectivo = 0 AND v.Tarjeta = 0
      GROUP BY
          v.IdVenta,
          v.IdApertura,
          v.FechaVenta,
          v.Total,
          v.Personas,
          v.VentaEn,
          u.Usuario
      ORDER BY v.FechaVenta ASC
    `;

    const openAccounts = await query(sqlQuery);

    return NextResponse.json({
      success: true,
      data: openAccounts
    });

  } catch (error: any) {
    console.error('Error in API /api/dashboard/reportes/cuentas-abiertas:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Database error fetching open accounts'
    }, { status: 500 });
  }
}

import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get('dateFrom');
  const dateTo = searchParams.get('dateTo');
  const tipo = searchParams.get('tipo');

  if (!dateFrom || !dateTo || !tipo) {
    return NextResponse.json({ message: 'Faltan parámetros' }, { status: 400 });
  }

  try {
    let ventaEnFilter = '';
    if (tipo === 'Mesa') {
      ventaEnFilter = 'v.VentaEn IN (0,3)';
    } else if (tipo === 'Para Llevar') {
      ventaEnFilter = 'v.VentaEn = 1';
    } else if (tipo === 'Domicilio') {
      ventaEnFilter = 'v.VentaEn = 2';
    } else {
      ventaEnFilter = 'v.VentaEn NOT IN (0,1,2,3)';
    }

    const sqlQuery = `
      SELECT
        COALESCE(p.Producto, 'Sin Producto') AS nombre,
        COALESCE(SUM(d.Cantidad * d.Precio), 0) AS total,
        COALESCE(SUM(d.Cantidad), 0) AS cantidad
      FROM tblDetalleVentas d
      JOIN tblVentas v ON d.IdVenta = v.IdVenta AND d.IdApertura = v.IdApertura
      LEFT JOIN tblProductos p ON d.IdProducto = p.IdProducto
      WHERE DATE(v.FechaVenta) BETWEEN ? AND ? 
        AND v.Cancelada = 0
        AND ${ventaEnFilter}
      GROUP BY d.IdProducto, p.Producto
      ORDER BY total DESC
      LIMIT 50
    `;

    const rows = await query(sqlQuery, [dateFrom, dateTo]);

    return NextResponse.json({ products: rows });

  } catch (error: any) {
    console.error('Sales by type details error:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

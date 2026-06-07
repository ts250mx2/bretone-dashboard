import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const dateFrom = searchParams.get('dateFrom') || '';
  const dateTo   = searchParams.get('dateTo')   || '';

  let dateFilter = '';
  let filterParams: any[] = [];

  if (dateFrom && dateTo) {
    dateFilter = `DATE(v.FechaVenta) BETWEEN ? AND ?`;
    filterParams = [dateFrom, dateTo];
  } else {
    dateFilter = `DATE(v.FechaVenta) = CURDATE()`;
  }

  try {
    const sqlQuery = `
      SELECT
        p.IdProducto AS id,
        p.Producto AS nombre,
        COALESCE(c.Categoria, 'Sin Categoría') AS categoria,
        COALESCE(SUM(d.Cantidad * d.Precio), 0) AS total,
        COALESCE(SUM(d.Cantidad), 0)            AS cantidad
      FROM tblDetalleVentas d
      JOIN tblVentas v ON d.IdVenta = v.IdVenta AND d.IdApertura = v.IdApertura
      LEFT JOIN tblProductos p ON d.IdProducto = p.IdProducto
      LEFT JOIN tblCategorias c ON p.IdCategoria = c.IdCategoria
      WHERE ${dateFilter} AND v.Cancelada = 0
      GROUP BY p.IdProducto, p.Producto, c.Categoria
      ORDER BY total DESC
    `;

    const rows = await query(sqlQuery, filterParams);

    return NextResponse.json({
      breakdown: rows
    });
  } catch (error: any) {
    console.error('Error fetching global products:', error);
    return NextResponse.json({ message: error.message }, { status: 500 });
  }
}

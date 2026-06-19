import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const idConsumo = searchParams.get('idConsumo');

  if (!idConsumo) {
    return NextResponse.json({ error: 'Falta el parámetro idConsumo' }, { status: 400 });
  }

  try {
    const sqlQuery = `
      SELECT 
        DC.IdProducto,
        DC.Cantidad,
        DC.Precio,
        (DC.Cantidad * DC.Precio) AS Total,
        DC.Iva,
        COALESCE(P.Producto, 'Producto Desconocido') AS Descripcion
      FROM tblDetalleConsumos DC
      LEFT JOIN tblProductos P ON DC.IdProducto = P.IdProducto
      WHERE DC.IdConsumo = ?
    `;

    const data = await query(sqlQuery, [idConsumo]);

    return NextResponse.json({
      success: true,
      data
    });
  } catch (error: any) {
    console.error('Error in API /reportes/consumos/items:', error);
    return NextResponse.json({
      error: error.message || 'Error de base de datos consultando detalle de consumo'
    }, { status: 500 });
  }
}

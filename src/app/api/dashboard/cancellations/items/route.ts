import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const { searchParams } = new URL(req.url);
  const idCancelacion = searchParams.get('idCancelacion');

  if (!idCancelacion) {
    return NextResponse.json({ error: 'Falta el parámetro idCancelacion' }, { status: 400 });
  }

  try {
    const sqlQuery = `
      SELECT 
        DC.Renglon,
        DC.IdProducto,
        DC.Cantidad,
        DC.Precio,
        (DC.Cantidad * DC.Precio) AS Total,
        DC.Iva,
        COALESCE(P.Producto, DC.ProductoDescripcion) AS Descripcion
      FROM tblDetalleCancelaciones DC
      LEFT JOIN tblProductos P ON DC.IdProducto = P.IdProducto
      WHERE DC.IdCancelacion = ?
      ORDER BY DC.Renglon ASC
    `;

    const data = await query(sqlQuery, [idCancelacion]);

    return NextResponse.json({
      success: true,
      data
    });
  } catch (error: any) {
    console.error('Error in API /cancellations/items:', error);
    return NextResponse.json({
      error: error.message || 'Error de base de datos consultando detalle de cancelacion'
    }, { status: 500 });
  }
}

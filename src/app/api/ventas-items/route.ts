import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const idVenta = searchParams.get('idVenta');
  const idApertura = searchParams.get('idApertura');

  if (!idVenta) {
    return NextResponse.json({
      error: 'Missing required parameter: idVenta is required'
    }, { status: 400 });
  }

  try {
    let sqlQuery = '';
    let params: any[] = [];

    if (idApertura) {
      sqlQuery = `
        SELECT 
            B.Cantidad, 
            P.Producto AS "Descripcion", 
            B.Precio AS "Precio", 
            COALESCE(B.Descuento, 0) AS Descuento, 
            (B.Cantidad * B.Precio - COALESCE(B.Descuento, 0)) AS Total
        FROM tblDetalleVentas B
        INNER JOIN tblProductos P ON B.IdProducto = P.IdProducto
        WHERE B.IdVenta = ? AND B.IdApertura = ?
        ORDER BY P.Producto
      `;
      params = [idVenta, idApertura];
    } else {
      sqlQuery = `
        SELECT 
            B.Cantidad, 
            P.Producto AS "Descripcion", 
            B.Precio AS "Precio", 
            COALESCE(B.Descuento, 0) AS Descuento, 
            (B.Cantidad * B.Precio - COALESCE(B.Descuento, 0)) AS Total
        FROM tblDetalleVentas B
        INNER JOIN tblProductos P ON B.IdProducto = P.IdProducto
        WHERE B.IdVenta = ?
        ORDER BY P.Producto
      `;
      params = [idVenta];
    }

    const itemsData = await query(sqlQuery, params);

    return NextResponse.json({
      success: true,
      data: itemsData
    });

  } catch (error: any) {
    console.error('Error in API /ventas-items:', error);
    return NextResponse.json({
      error: error.message || 'Database error fetching ticket items'
    }, { status: 500 });
  }
}

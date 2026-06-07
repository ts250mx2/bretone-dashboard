import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const fechaInicio = searchParams.get('fechaInicio');
    const fechaFin = searchParams.get('fechaFin');
    const idApertura = searchParams.get('idApertura');

    let dateFilter = 'DATE(A.FechaVenta) >= ? AND DATE(A.FechaVenta) <= ?';
    let params: any[] = [];

    if (fechaInicio && fechaFin) {
      params.push(fechaInicio, fechaFin);
    } else {
      dateFilter = 'DATE(A.FechaVenta) >= DATE_SUB(CURDATE(), INTERVAL 7 DAY)';
    }

    if (idApertura) {
      params.push(idApertura);
    }

    const sql = `
      SELECT 
          CONCAT(CAST(A.IdComputadora AS CHAR), '-', CAST(A.IdApertura AS CHAR)) AS \`Z\`,
          CONCAT(A.IdApertura, '-', A.IdVenta) AS \`Folio Cancelacion\`, 
          A.FechaVenta AS FechaCancelacion, 
          B.Cantidad, 
          F.IdProducto AS \`Codigo Barras\`, 
          F.Producto AS Descripcion, 
          B.Precio AS \`Precio Venta\`, 
          (B.Cantidad * B.Precio) AS Total,
          D.Usuario AS Cajero,
          COALESCE(E.Usuario, 'No Especificado') AS Supervisor
      FROM tblVentas A
      INNER JOIN tblDetalleVentas B ON A.IdVenta = B.IdVenta AND A.IdApertura = B.IdApertura
      LEFT JOIN tblUsuarios D ON A.IdUsuarioPago = D.IdUsuario
      LEFT JOIN tblUsuarios E ON A.IdVendedor = E.IdUsuario
      INNER JOIN tblProductos F ON B.IdProducto = F.IdProducto
      WHERE A.Cancelada > 0
        AND ${dateFilter}
        ${idApertura ? `AND A.IdApertura = ?` : ''}
      ORDER BY A.FechaVenta DESC
    `;

    const results = await query(sql, params);
    return NextResponse.json(results);
  } catch (error: any) {
    console.error('Error fetching cancellation details:', error);
    return NextResponse.json({ error: error.message }, { status: 500 });
  }
}

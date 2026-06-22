import { NextRequest, NextResponse } from 'next/server';
import { query } from '@/lib/db';

export const dynamic = 'force-dynamic';

/**
 * Cuentas abiertas (mesas activas) — se consultan los dos buffers en vivo del POS:
 *   · tblBufferVentas        (orden que se está editando en la terminal)
 *   · tblBufferDetalleVentas (orden guardada / enviada, aún sin cobrar)
 * Ambas tablas son a nivel de renglón (un producto por fila), así que se unen y
 * se agrupan por IdMesa para obtener cada mesa abierta, su antigüedad y su monto.
 */

// Listado de mesas abiertas: una fila por mesa, con apertura, monto, mesero y personas.
// El mesero y las personas se obtienen de tblBufferMesasPersonas (IdMesero → tblUsuarios.IdUsuario).
const LIST_SQL = `
  SELECT
    a.IdMesa,
    a.Apertura,
    a.Total,
    a.CantidadProductos,
    mp.IdMesero,
    COALESCE(mp.Personas, 0)            AS Personas,
    COALESCE(u.Usuario, 'Sin asignar')  AS Mesero
  FROM (
    SELECT
      t.IdMesa,
      MIN(t.Fecha)                       AS Apertura,
      SUM(t.Cantidad * t.Precio)         AS Total,
      SUM(t.Cantidad)                    AS CantidadProductos
    FROM (
      SELECT IdMesa, Fecha, Cantidad, Precio FROM tblBufferVentas
      UNION ALL
      SELECT IdMesa, Fecha, Cantidad, Precio FROM tblBufferDetalleVentas
    ) t
    WHERE t.IdMesa IS NOT NULL AND t.IdMesa > 0
    GROUP BY t.IdMesa
  ) a
  LEFT JOIN (
    SELECT IdMesa, MAX(IdMesero) AS IdMesero, MAX(Personas) AS Personas
    FROM tblBufferMesasPersonas
    GROUP BY IdMesa
  ) mp ON mp.IdMesa = a.IdMesa
  LEFT JOIN tblUsuarios u ON u.IdUsuario = mp.IdMesero
  ORDER BY a.IdMesa ASC
`;

// Detalle de productos de una mesa (consolidado por producto + precio).
const DETAIL_SQL = `
  SELECT
    d.ProductoDescripcion              AS Descripcion,
    SUM(d.Cantidad)                    AS Cantidad,
    d.Precio,
    SUM(COALESCE(d.Descuento, 0))      AS Descuento,
    SUM(d.Cantidad * d.Precio)         AS Total
  FROM (
    SELECT IdMesa, ProductoDescripcion, Cantidad, Precio, Descuento FROM tblBufferVentas WHERE IdMesa = ?
    UNION ALL
    SELECT IdMesa, ProductoDescripcion, Cantidad, Precio, Descuento FROM tblBufferDetalleVentas WHERE IdMesa = ?
  ) d
  GROUP BY d.ProductoDescripcion, d.Precio
  ORDER BY Total DESC, Descripcion ASC
`;

// Mesero y personas de la mesa (desde tblBufferMesasPersonas; IdMesero → tblUsuarios.IdUsuario).
const MESERO_SQL = `
  SELECT
    COALESCE(u.Usuario, 'Sin asignar') AS Mesero,
    COALESCE(mp.Personas, 0)           AS Personas
  FROM (
    SELECT MAX(IdMesero) AS IdMesero, MAX(Personas) AS Personas
    FROM tblBufferMesasPersonas
    WHERE IdMesa = ?
  ) mp
  LEFT JOIN tblUsuarios u ON u.IdUsuario = mp.IdMesero
`;

export async function GET(request: NextRequest) {
  try {
    const mesaParam = request.nextUrl.searchParams.get('mesa');

    // ── Detalle de una mesa concreta ──────────────────────────────────────────
    if (mesaParam !== null) {
      const idMesa = Number(mesaParam);
      if (!Number.isFinite(idMesa)) {
        return NextResponse.json({ success: false, error: 'Mesa inválida' }, { status: 400 });
      }

      const [items, meseroRows] = await Promise.all([
        query(DETAIL_SQL, [idMesa, idMesa]),
        query(MESERO_SQL, [idMesa]),
      ]);

      return NextResponse.json({
        success: true,
        data: items,
        mesero: meseroRows[0]?.Mesero || 'Sin asignar',
        personas: meseroRows[0]?.Personas ?? 0,
      });
    }

    // ── Listado de todas las mesas abiertas ───────────────────────────────────
    const openTables = await query(LIST_SQL);

    return NextResponse.json({ success: true, data: openTables });
  } catch (error: any) {
    console.error('Error in API /api/dashboard/reportes/cuentas-abiertas:', error);
    return NextResponse.json({
      success: false,
      error: error.message || 'Database error fetching open tables',
    }, { status: 500 });
  }
}

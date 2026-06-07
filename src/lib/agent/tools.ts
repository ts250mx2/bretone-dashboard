import Anthropic from '@anthropic-ai/sdk';
import { query } from '@/lib/db';

/**
 * Read-only sales-analytics tools for the AI agent.
 *
 * Every tool runs a fixed, parameterized SELECT against the sales database.
 * There is NO arbitrary-SQL tool — the agent can only invoke these vetted,
 * read-only queries, so it can never mutate data or run injected statements.
 */

const DATE_RE = /^\d{4}-\d{2}-\d{2}$/;

function safeDate(value: unknown, fallback: string): string {
  return typeof value === 'string' && DATE_RE.test(value) ? value : fallback;
}

function clampInt(value: unknown, def: number, min: number, max: number): number {
  const n = Number(value);
  if (!Number.isFinite(n)) return def;
  return Math.min(Math.max(Math.trunc(n), min), max);
}

function todayISO(): string {
  return new Date().toISOString().slice(0, 10);
}

// Whitelisted trend groupings → SQL fragments (never interpolate raw input).
const TREND_GROUPS: Record<string, { select: string; group: string }> = {
  dia: { select: 'DATE(v.FechaVenta)', group: 'DATE(v.FechaVenta)' },
  semana: {
    select: 'DATE_SUB(DATE(v.FechaVenta), INTERVAL WEEKDAY(v.FechaVenta) DAY)',
    group: 'DATE_SUB(DATE(v.FechaVenta), INTERVAL WEEKDAY(v.FechaVenta) DAY)',
  },
  mes: { select: `DATE_FORMAT(v.FechaVenta, '%Y-%m-01')`, group: `DATE_FORMAT(v.FechaVenta, '%Y-%m-01')` },
};

const DATE_PROPS = {
  dateFrom: { type: 'string' as const, description: 'Fecha inicial inclusiva en formato YYYY-MM-DD.' },
  dateTo: { type: 'string' as const, description: 'Fecha final inclusiva en formato YYYY-MM-DD.' },
};

export const tools: Anthropic.Tool[] = [
  {
    name: 'get_sales_summary',
    description:
      'Resumen de KPIs de ventas para un rango de fechas: ventas totales, número de transacciones, ticket promedio, ventas en efectivo, ventas con tarjeta y número de ventas canceladas. Úsalo para responder "cuánto se vendió", totales, promedios y desglose de pagos.',
    input_schema: {
      type: 'object',
      properties: { ...DATE_PROPS },
      required: ['dateFrom', 'dateTo'],
    },
  },
  {
    name: 'get_sales_trend',
    description:
      'Serie de tiempo de ventas (total e #transacciones) agrupada por día, semana o mes dentro de un rango de fechas. Úsalo para tendencias, evolución y comparaciones a lo largo del tiempo.',
    input_schema: {
      type: 'object',
      properties: {
        ...DATE_PROPS,
        groupBy: { type: 'string', enum: ['dia', 'semana', 'mes'], description: 'Granularidad de la agrupación. Por defecto "dia".' },
      },
      required: ['dateFrom', 'dateTo'],
    },
  },
  {
    name: 'get_top_categories',
    description:
      'Categorías de producto con mayores ventas (monto y unidades) en un rango de fechas, ordenadas de mayor a menor. Úsalo para "qué categorías venden más".',
    input_schema: {
      type: 'object',
      properties: {
        ...DATE_PROPS,
        limit: { type: 'integer', description: 'Cuántas categorías devolver (1-50). Por defecto 10.' },
      },
      required: ['dateFrom', 'dateTo'],
    },
  },
  {
    name: 'get_top_products',
    description:
      'Productos más vendidos (monto y unidades) en un rango de fechas, opcionalmente filtrado por categoría. Úsalo para "qué productos venden más" o el detalle de una categoría.',
    input_schema: {
      type: 'object',
      properties: {
        ...DATE_PROPS,
        limit: { type: 'integer', description: 'Cuántos productos devolver (1-50). Por defecto 10.' },
        categoryId: { type: 'integer', description: 'Opcional. ID de categoría para filtrar (usa list_categories para obtenerlo).' },
      },
      required: ['dateFrom', 'dateTo'],
    },
  },
  {
    name: 'get_sales_by_hour',
    description:
      'Distribución de ventas por hora del día (0-23) en un rango de fechas. Úsalo para identificar horas pico y franjas de mayor/menor actividad.',
    input_schema: {
      type: 'object',
      properties: { ...DATE_PROPS },
      required: ['dateFrom', 'dateTo'],
    },
  },
  {
    name: 'list_categories',
    description:
      'Lista todas las categorías de producto disponibles con su ID y nombre. Úsalo cuando necesites el ID de una categoría para filtrar productos.',
    input_schema: { type: 'object', properties: {} },
  },
];

type ToolInput = Record<string, unknown>;

async function getSalesSummary(input: ToolInput) {
  const dateFrom = safeDate(input.dateFrom, todayISO());
  const dateTo = safeDate(input.dateTo, dateFrom);
  const kpi = await query(
    `SELECT
       COALESCE(SUM(v.Total), 0)  AS totalVentas,
       COUNT(v.IdVenta)           AS numTransacciones,
       COALESCE(AVG(v.Total), 0)  AS ticketPromedio,
       COALESCE(SUM(CASE WHEN v.Tarjeta = 0 THEN v.Total ELSE 0 END), 0) AS efectivo,
       COALESCE(SUM(CASE WHEN v.Tarjeta > 0 THEN v.Total ELSE 0 END), 0) AS tarjeta
     FROM tblVentas v
     WHERE DATE(v.FechaVenta) BETWEEN ? AND ? AND v.Cancelada = 0`,
    [dateFrom, dateTo],
  );
  const cancel = await query(
    `SELECT COUNT(*) AS canceladas FROM tblVentas v
     WHERE DATE(v.FechaVenta) BETWEEN ? AND ? AND v.Cancelada > 0`,
    [dateFrom, dateTo],
  );
  return { dateFrom, dateTo, ...(kpi[0] ?? {}), canceladas: cancel[0]?.canceladas ?? 0 };
}

async function getSalesTrend(input: ToolInput) {
  const dateFrom = safeDate(input.dateFrom, todayISO());
  const dateTo = safeDate(input.dateTo, dateFrom);
  const groupKey = typeof input.groupBy === 'string' && input.groupBy in TREND_GROUPS ? input.groupBy : 'dia';
  const g = TREND_GROUPS[groupKey];
  const rows = await query(
    `SELECT ${g.select} AS fecha,
            COALESCE(SUM(v.Total), 0) AS total,
            COUNT(v.IdVenta)          AS transacciones
     FROM tblVentas v
     WHERE DATE(v.FechaVenta) BETWEEN ? AND ? AND v.Cancelada = 0
     GROUP BY ${g.group}
     ORDER BY fecha ASC`,
    [dateFrom, dateTo],
  );
  return { dateFrom, dateTo, groupBy: groupKey, points: rows };
}

async function getTopCategories(input: ToolInput) {
  const dateFrom = safeDate(input.dateFrom, todayISO());
  const dateTo = safeDate(input.dateTo, dateFrom);
  const limit = clampInt(input.limit, 10, 1, 50);
  const rows = await query(
    `SELECT c.IdCategoria AS id,
            COALESCE(c.Categoria, 'Sin Categoría') AS nombre,
            COALESCE(SUM(d.Cantidad * d.Precio), 0) AS total,
            COALESCE(SUM(d.Cantidad), 0)            AS unidades
     FROM tblDetalleVentas d
     JOIN tblVentas v ON d.IdVenta = v.IdVenta AND d.IdApertura = v.IdApertura
     LEFT JOIN tblProductos p ON d.IdProducto = p.IdProducto
     LEFT JOIN tblCategorias c ON p.IdCategoria = c.IdCategoria
     WHERE DATE(v.FechaVenta) BETWEEN ? AND ? AND v.Cancelada = 0
     GROUP BY c.IdCategoria, c.Categoria
     ORDER BY total DESC
     LIMIT ${limit}`,
    [dateFrom, dateTo],
  );
  return { dateFrom, dateTo, categorias: rows };
}

async function getTopProducts(input: ToolInput) {
  const dateFrom = safeDate(input.dateFrom, todayISO());
  const dateTo = safeDate(input.dateTo, dateFrom);
  const limit = clampInt(input.limit, 10, 1, 50);
  const params: (string | number)[] = [dateFrom, dateTo];
  let catFilter = '';
  if (input.categoryId !== undefined && input.categoryId !== null && input.categoryId !== '') {
    catFilter = ' AND p.IdCategoria = ?';
    params.push(clampInt(input.categoryId, 0, 0, 2_000_000_000));
  }
  const rows = await query(
    `SELECT p.IdProducto AS id,
            COALESCE(p.Producto, 'Sin Producto') AS nombre,
            COALESCE(SUM(d.Cantidad * d.Precio), 0) AS total,
            COALESCE(SUM(d.Cantidad), 0)            AS unidades
     FROM tblDetalleVentas d
     JOIN tblVentas v ON d.IdVenta = v.IdVenta AND d.IdApertura = v.IdApertura
     LEFT JOIN tblProductos p ON d.IdProducto = p.IdProducto
     WHERE DATE(v.FechaVenta) BETWEEN ? AND ? AND v.Cancelada = 0${catFilter}
     GROUP BY d.IdProducto, p.Producto
     ORDER BY total DESC
     LIMIT ${limit}`,
    params,
  );
  return { dateFrom, dateTo, productos: rows };
}

async function getSalesByHour(input: ToolInput) {
  const dateFrom = safeDate(input.dateFrom, todayISO());
  const dateTo = safeDate(input.dateTo, dateFrom);
  const rows = await query(
    `SELECT HOUR(v.FechaVenta)        AS hora,
            COALESCE(SUM(v.Total), 0) AS total,
            COUNT(v.IdVenta)          AS transacciones
     FROM tblVentas v
     WHERE DATE(v.FechaVenta) BETWEEN ? AND ? AND v.Cancelada = 0
     GROUP BY HOUR(v.FechaVenta)
     ORDER BY hora ASC`,
    [dateFrom, dateTo],
  );
  return { dateFrom, dateTo, porHora: rows };
}

async function listCategories() {
  const rows = await query(
    `SELECT IdCategoria AS id, Categoria AS nombre FROM tblCategorias ORDER BY Categoria ASC`,
    [],
  );
  return { categorias: rows };
}

const HANDLERS: Record<string, (input: ToolInput) => Promise<unknown>> = {
  get_sales_summary: getSalesSummary,
  get_sales_trend: getSalesTrend,
  get_top_categories: getTopCategories,
  get_top_products: getTopProducts,
  get_sales_by_hour: getSalesByHour,
  list_categories: listCategories,
};

/** Execute a tool by name and return its result serialized as JSON for the model. */
export async function runTool(name: string, input: ToolInput): Promise<string> {
  const handler = HANDLERS[name];
  if (!handler) return JSON.stringify({ error: `Herramienta desconocida: ${name}` });
  try {
    const result = await handler(input ?? {});
    return JSON.stringify(result);
  } catch (err) {
    const message = err instanceof Error ? err.message : String(err);
    return JSON.stringify({ error: `Error al consultar la base de datos: ${message}` });
  }
}

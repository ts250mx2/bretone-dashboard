'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  LayoutGrid,
  Calendar,
  DollarSign,
  ReceiptText,
  TrendingUp,
  Download,
  Layers,
  ChevronRight,
  Package,
  Clock,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import styles from './categorias.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────
type Period = 'today' | 'yesterday' | 'week' | 'month';
interface CategoryItem {
  id: number | null;
  nombre: string;
  total: number;
  cantidad: number;
}
interface ProductItem {
  id: number;
  nombre: string;
  total: number;
  cantidad: number;
}

// Helper to format currency
const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n || 0);

// Helper to format short numbers (e.g. $4.5k)
const fmtShort = (n: number) => {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
};

// Category sales trend chart component
function CategoryLineChart({ data, group }: { data: any[]; group: 'dia' | 'semana' | 'mes' }) {
  if (!data || data.length === 0) {
    return <div className={styles.chartEmpty}>Sin datos de tendencia para esta categoría</div>;
  }

  const W = 740;
  const H = 240;
  const PAD = { t: 20, r: 25, b: 45, l: 65 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;

  const maxVal = Math.max(...data.map(d => Number(d.total)), 1);
  const toX = (i: number) => PAD.l + (i / Math.max(data.length - 1, 1)) * innerW;
  const toY = (v: number) => PAD.t + innerH - (v / maxVal) * innerH;

  const points = data.map((d, i) => `${toX(i)},${toY(d.total)}`).join(' ');
  const areaPoints = [
    `${PAD.l},${PAD.t + innerH}`,
    ...data.map((d, i) => `${toX(i)},${toY(d.total)}`),
    `${toX(data.length - 1)},${PAD.t + innerH}`,
  ].join(' ');

  const yTicks = [0, 0.25, 0.5, 0.75, 1].map(r => ({ v: maxVal * r, y: toY(maxVal * r) }));

  const formatLabel = (dateStr: string) => {
    const d = new Date(dateStr + 'T12:00:00');
    if (isNaN(d.getTime())) return dateStr;
    if (group === 'mes') {
      return d.toLocaleDateString('es-MX', { month: 'short', year: '2-digit' }).toUpperCase();
    }
    if (group === 'semana') {
      return 'Sem ' + d.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
    }
    return d.toLocaleDateString('es-MX', { month: 'short', day: 'numeric' });
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} className={styles.svg} preserveAspectRatio="none">
      <defs>
        <linearGradient id="catAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#E3A21C" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#E3A21C" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {/* Gridlines */}
      {yTicks.map(({ v, y }) => (
        <g key={v}>
          <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="rgba(61, 28, 2, 0.08)" strokeWidth="1" />
          <text x={PAD.l - 10} y={y + 4} textAnchor="end" fontSize="10" fontWeight="600" fill="var(--text-muted)">
            {fmtShort(v)}
          </text>
        </g>
      ))}

      {/* Area */}
      <polygon points={areaPoints} fill="url(#catAreaGrad)" />

      {/* Polyline */}
      <polyline points={points} fill="none" stroke="#E3A21C" strokeWidth="2.8" strokeLinejoin="round" strokeLinecap="round" />

      {/* Dots */}
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={toX(i)} cy={toY(d.total)} r="4" fill="#E3A21C" stroke="#ffffff" strokeWidth="2">
            <title>{`${formatLabel(d.fecha)} — Ventas: ${fmt(d.total)}`}</title>
          </circle>
          <text
            x={toX(i)} y={PAD.t + innerH + 18}
            textAnchor="middle" fontSize="9" fontWeight="600" fill="var(--text-muted)"
          >
            {formatLabel(d.fecha)}
          </text>
        </g>
      ))}
    </svg>
  );
}

// Treemap (rectangles) of category sales mix — slice & dice layout
const TREEMAP_COLORS = ['#E3A21C', '#149D92', '#D17A4E', '#3D1C02', '#C2410C', '#7A8B4F', '#5B7A99', '#9C5B6B', '#B4690E', '#0F7F76'];

function CategoryTreemap({
  data,
  selected,
  onSelect,
}: {
  data: CategoryItem[];
  selected: CategoryItem | null;
  onSelect: (c: CategoryItem) => void;
}) {
  const items = [...data].filter(d => Number(d.total) > 0).sort((a, b) => Number(b.total) - Number(a.total));
  const total = items.reduce((s, x) => s + Number(x.total), 0);

  if (items.length === 0 || total === 0) {
    return <div className={styles.chartEmpty}>Sin ventas mayores a $0 en este período</div>;
  }

  const W = 1000;
  const H = 420;
  let x = 0, y = 0, w = W, h = H, remaining = total;
  const rects: { x: number; y: number; w: number; h: number; item: CategoryItem }[] = [];

  for (const item of items) {
    const ratio = Number(item.total) / remaining;
    if (w >= h) {
      const rw = w * ratio;
      rects.push({ x, y, w: rw, h, item });
      x += rw; w -= rw;
    } else {
      const rh = h * ratio;
      rects.push({ x, y, w, h: rh, item });
      y += rh; h -= rh;
    }
    remaining -= Number(item.total);
  }

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" className={styles.treemapSvg}>
      {rects.map((r, i) => {
        const isActive = selected?.nombre === r.item.nombre && selected?.id === r.item.id;
        const share = (Number(r.item.total) / total) * 100;
        const showLabel = r.w > 70 && r.h > 40;
        const maxChars = Math.max(3, Math.floor(r.w / 9));
        const label = r.item.nombre.length > maxChars ? r.item.nombre.slice(0, maxChars) + '…' : r.item.nombre;
        return (
          <g key={r.item.id ?? i} onClick={() => onSelect(r.item)} style={{ cursor: 'pointer' }}>
            <rect
              x={r.x} y={r.y} width={r.w} height={r.h}
              fill={TREEMAP_COLORS[i % TREEMAP_COLORS.length]}
              stroke={isActive ? '#3D1C02' : '#ffffff'}
              strokeWidth={isActive ? 3.5 : 2}
              opacity={isActive ? 1 : 0.92}
            />
            {showLabel && (
              <>
                <text x={r.x + 10} y={r.y + 23} fill="#ffffff" fontSize="14" fontWeight="800" style={{ pointerEvents: 'none' }}>
                  {label}
                </text>
                <text x={r.x + 10} y={r.y + 41} fill="rgba(255,255,255,0.88)" fontSize="12" fontWeight="600" style={{ pointerEvents: 'none' }}>
                  {fmt(Number(r.item.total))}
                </text>
                {r.h > 62 && (
                  <text x={r.x + 10} y={r.y + 58} fill="rgba(255,255,255,0.72)" fontSize="11" style={{ pointerEvents: 'none' }}>
                    {share.toFixed(1)}% del total
                  </text>
                )}
              </>
            )}
            <title>{`${r.item.nombre}\nVentas: ${fmt(Number(r.item.total))}\nUnidades: ${r.item.cantidad}\nParticipación: ${share.toFixed(1)}%`}</title>
          </g>
        );
      })}
    </svg>
  );
}

// Helper to format date strings for inputs
function toISO(d: Date) {
  return d.toISOString().split('T')[0];
}

// Compute date ranges for presets
function datesForPeriod(p: Period): [string, string] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  switch (p) {
    case 'today':
      return [toISO(today), toISO(today)];
    case 'yesterday': {
      const y = new Date(today);
      y.setDate(y.getDate() - 1);
      return [toISO(y), toISO(y)];
    }
    case 'week': {
      const w = new Date(today);
      w.setDate(w.getDate() - 6);
      return [toISO(w), toISO(today)];
    }
    case 'month': {
      const m = new Date(today);
      m.setDate(1); // Start from the 1st of the current month
      return [toISO(m), toISO(today)];
    }
  }
}

export default function GlobalCategoriesReport() {
  const [dateFrom, setDateFrom] = useState(() => datesForPeriod('week')[0]); // Default to last 7 days
  const [dateTo, setDateTo] = useState(() => datesForPeriod('week')[1]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  // Details pane state
  const [selectedCat, setSelectedCat] = useState<CategoryItem | null>(null);
  const [products, setProducts] = useState<ProductItem[]>([]);
  const [hours, setHours] = useState<any[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'productos' | 'horas'>('productos');

  // Modal states for category sales trends
  const [isTrendModalOpen, setIsTrendModalOpen] = useState(false);
  const [trendDateFrom, setTrendDateFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [trendDateTo, setTrendDateTo] = useState(() => toISO(new Date()));
  const [trendGroup, setTrendGroup] = useState<'dia' | 'semana' | 'mes'>('dia');
  const [trendList, setTrendList] = useState<any[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState('');

  // Fetch category sales trend points
  const fetchCategoryTrend = useCallback(async (catId: number | null, catName: string, from: string, to: string, tg: 'dia' | 'semana' | 'mes') => {
    if (!from || !to) return;
    setTrendLoading(true);
    setTrendError('');
    try {
      const params = new URLSearchParams({
        id: catId !== null ? String(catId) : '',
        name: catName,
        dateFrom: from,
        dateTo: to,
        trendGroup: tg,
        getTrend: 'true'
      });
      const res = await fetch(`/api/dashboard/sales/category-details?${params}`);
      if (!res.ok) throw new Error('Error al cargar tendencias de la categoría');
      const json = await res.json();
      setTrendList(json.trend || []);
    } catch (e: any) {
      setTrendError(e.message || 'Error de conexión');
      setTrendList([]);
    } finally {
      setTrendLoading(false);
    }
  }, []);

  useEffect(() => {
    if (isTrendModalOpen && selectedCat) {
      fetchCategoryTrend(selectedCat.id, selectedCat.nombre, trendDateFrom, trendDateTo, trendGroup);
    }
  }, [isTrendModalOpen, selectedCat, trendDateFrom, trendDateTo, trendGroup, fetchCategoryTrend]);

  useEffect(() => {
    if (typeof window !== 'undefined') {
      const savedFrom = localStorage.getItem('bretone_date_from');
      const savedTo = localStorage.getItem('bretone_date_to');
      if (savedFrom && savedTo) {
        setDateFrom(savedFrom);
        setDateTo(savedTo);
      }
    }
    setMounted(true);
  }, []);

  // Persist the selected period to shared localStorage
  useEffect(() => {
    if (mounted) {
      localStorage.setItem('bretone_date_from', dateFrom);
      localStorage.setItem('bretone_date_to', dateTo);
    }
  }, [dateFrom, dateTo, mounted]);

  // Fetch global categories list
  const fetchCategories = useCallback(async (from: string, to: string) => {
    if (!from || !to) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        groupBy: 'categoria',
        dateFrom: from,
        dateTo: to,
        trendGroup: 'dia',
      });
      const res = await fetch(`/api/dashboard/sales?${params}`);
      if (!res.ok) throw new Error('Error al cargar reporte de categorías');
      const json = await res.json();
      setData(json);

      // Auto-select first category if available and nothing is selected
      const categoriesList = json.breakdown || [];
      if (categoriesList.length > 0) {
        setSelectedCat(categoriesList[0]);
      } else {
        setSelectedCat(null);
      }
    } catch (e: any) {
      setError(e.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) fetchCategories(dateFrom, dateTo);
  }, [dateFrom, dateTo, mounted, fetchCategories]);

  // Fetch product breakdown inside selected category
  const fetchCategoryDetails = useCallback(async (catId: number | null, catName: string) => {
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({
        id: catId !== null ? String(catId) : '',
        name: catName,
        dateFrom,
        dateTo,
      });
      const res = await fetch(`/api/dashboard/sales/category-details?${params}`);
      if (!res.ok) throw new Error('Error al cargar productos de la categoría');
      const json = await res.json();
      setProducts(json.products || []);
      setHours(json.hours || []);
    } catch (e) {
      console.error(e);
      setProducts([]);
      setHours([]);
    } finally {
      setDetailLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (selectedCat) {
      fetchCategoryDetails(selectedCat.id, selectedCat.nombre);
    } else {
      setProducts([]);
      setHours([]);
    }
  }, [selectedCat, fetchCategoryDetails]);

  const handlePeriod = (p: Period) => {
    const [from, to] = datesForPeriod(p);
    setDateFrom(from);
    setDateTo(to);
  };

  // Detect active preset
  const activePeriod: Period | null = useMemo(() => {
    return (['today', 'yesterday', 'week', 'month'] as Period[]).find(p => {
      const [f, t] = datesForPeriod(p);
      return f === dateFrom && t === dateTo;
    }) ?? null;
  }, [dateFrom, dateTo]);

  // Client-side computations
  const categoriesList = useMemo(() => {
    return (data?.breakdown ?? []) as CategoryItem[];
  }, [data]);

  const totalSalesFromCategories = useMemo(() => {
    return categoriesList.reduce((acc, cat) => acc + Number(cat.total), 0);
  }, [categoriesList]);

  const totalItemsFromCategories = useMemo(() => {
    return categoriesList.reduce((acc, cat) => acc + Number(cat.cantidad), 0);
  }, [categoriesList]);

  const bestCategory = useMemo(() => {
    if (categoriesList.length === 0) return null;
    return categoriesList[0]; // Already sorted by total desc in backend
  }, [categoriesList]);

  const maxProductVal = useMemo(() => {
    if (products.length === 0) return 1;
    return Math.max(...products.map(p => Number(p.total)), 1);
  }, [products]);

  const maxHourVal = useMemo(() => {
    if (hours.length === 0) return 1;
    return Math.max(...hours.map(h => Number(h.total)), 1);
  }, [hours]);

  // Export all categories to Excel
  const exportAllCategories = () => {
    if (categoriesList.length === 0) return;

    const formatted = categoriesList.map((cat, idx) => {
      const share = totalSalesFromCategories > 0 ? (cat.total / totalSalesFromCategories) * 100 : 0;
      return {
        'Ranking': idx + 1,
        'Categoría': cat.nombre,
        'Ventas Totales ($)': cat.total,
        'Unidades Vendidas': cat.cantidad,
        'Participación (%)': share.toFixed(2) + '%',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(formatted);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Resumen Categorías');
    XLSX.writeFile(workbook, `Reporte_Categorias_Globales_${dateFrom}_a_${dateTo}.xlsx`);
  };

  // Export products or hours in active category to Excel
  const exportCategoryProducts = () => {
    if (!selectedCat) return;

    if (activeTab === 'productos') {
      if (products.length === 0) return;
      const formatted = products.map((prod, idx) => {
        const share = selectedCat.total > 0 ? (prod.total / selectedCat.total) * 100 : 0;
        return {
          'Ranking': idx + 1,
          'Producto': prod.nombre,
          'Ventas Totales ($)': prod.total,
          'Unidades Vendidas': prod.cantidad,
          'Participación en Categoría (%)': share.toFixed(2) + '%',
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(formatted);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `Detalle ${selectedCat.nombre}`);
      XLSX.writeFile(workbook, `Detalle_Productos_Categoria_${selectedCat.nombre.replace(/\s+/g, '_')}_${dateFrom}_a_${dateTo}.xlsx`);
    } else {
      if (hours.length === 0) return;
      const sortedHours = [...hours].sort((a, b) => Number(a.hora) - Number(b.hora));
      const formatted = sortedHours.map((h) => {
        return {
          'Hora': `${h.hora}:00 - ${Number(h.hora) + 1}:00`,
          'Ventas Totales ($)': h.total,
          'Unidades Vendidas': h.cantidad,
        };
      });

      const worksheet = XLSX.utils.json_to_sheet(formatted);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `Horas ${selectedCat.nombre}`);
      XLSX.writeFile(workbook, `Horas_Ventas_Categoria_${selectedCat.nombre.replace(/\s+/g, '_')}_${dateFrom}_a_${dateTo}.xlsx`);
    }
  };

  if (!mounted) {
    return <div className={styles.container} style={{ opacity: 0 }}>Cargando categorías...</div>;
  }

  const activeLabel = activePeriod
    ? activePeriod === 'today'
      ? 'Hoy'
      : activePeriod === 'yesterday'
      ? 'Ayer'
      : activePeriod === 'week'
      ? 'Últimos 7 días'
      : 'Últimos 30 días'
    : `Personalizado (${dateFrom} a ${dateTo})`;

  return (
    <div className={styles.container}>
      {/* ====== HEADER ====== */}
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <LayoutGrid size={34} style={{ color: '#E3A21C' }} />
          <div>
            <h1>Categorías Global</h1>
            <p className={styles.subtitle}>Desglose comercial por grupos de menú y mezcla de productos</p>
          </div>
        </div>

        <div className={styles.actionsGroup}>
          <button
            onClick={exportAllCategories}
            className={styles.exportBtn}
            disabled={categoriesList.length === 0}
            style={{ opacity: categoriesList.length === 0 ? 0.6 : 1 }}
          >
            <Download size={15} /> Exportar Resumen
          </button>
        </div>
      </header>

      {/* ====== FILTERS ====== */}
      <div className={styles.filterCard}>
        <div className={styles.presets}>
          {(['today', 'yesterday', 'week', 'month'] as Period[]).map(p => (
            <button
              key={p}
              className={`${styles.presetBtn} ${activePeriod === p ? styles.presetActive : ''}`}
              onClick={() => handlePeriod(p)}
            >
              <Calendar size={14} />
              {p === 'today' && 'Hoy'}
              {p === 'yesterday' && 'Ayer'}
              {p === 'week' && 'Semana'}
              {p === 'month' && 'Mes'}
            </button>
          ))}
        </div>

        <div className={styles.dateRangePicker}>
          <input
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className={styles.dateInput}
          />
          <span className={styles.dateSep}>→</span>
          <input
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className={styles.dateInput}
          />
        </div>
      </div>

      {error && <div className={styles.errorMsg}>{error}</div>}

      {/* ====== KPIs ROW ====== */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(61, 28, 2, 0.08)', color: '#3D1C02' }}>
            <DollarSign size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Facturado por Categorías</span>
            <span className={styles.kpiValue}>{loading ? '—' : fmt(totalSalesFromCategories)}</span>
            <span className={styles.kpiSub}>{activeLabel}</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(20, 157, 146, 0.08)', color: '#149D92' }}>
            <Package size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Platillos Vendidos</span>
            <span className={styles.kpiValue}>{loading ? '—' : totalItemsFromCategories}</span>
            <span className={styles.kpiSub}>unidades preparadas</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(227, 162, 28, 0.08)', color: '#E3A21C' }}>
            <TrendingUp size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Categoría Estrella</span>
            <span className={styles.kpiValue}>
              {loading ? '—' : bestCategory ? bestCategory.nombre : 'Sin registros'}
            </span>
            <span className={styles.kpiSub}>
              {bestCategory ? `Venta: ${fmt(bestCategory.total)}` : 'En el período'}
            </span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(209, 122, 78, 0.08)', color: '#D17A4E' }}>
            <ReceiptText size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Grupos Registrados</span>
            <span className={styles.kpiValue}>{loading ? '—' : categoriesList.length}</span>
            <span className={styles.kpiSub}>categorías activas</span>
          </div>
        </div>
      </div>

      {/* ====== TREEMAP (mapa de rectángulos) ====== */}
      <div className={styles.treemapCard}>
        <div className={styles.treemapHeader}>
          <div>
            <h3 className={styles.treemapTitle}>Mapa de Categorías</h3>
            <p className={styles.treemapSub}>
              El tamaño de cada rectángulo es proporcional a sus ventas. Haz clic en uno para ver su detalle.
            </p>
          </div>
        </div>
        <div className={styles.treemapBody}>
          {loading ? (
            <div className={styles.chartLoading}>
              <div className={styles.spinner} />
              <span>Construyendo mapa de categorías...</span>
            </div>
          ) : (
            <CategoryTreemap data={categoriesList} selected={selectedCat} onSelect={setSelectedCat} />
          )}
        </div>
      </div>

      {/* ====== SPLIT GRID ====== */}
      <div className={styles.splitLayout}>
        {/* Left Side: Category Summary Cards */}
        <div className={styles.listCard}>
          <h3 className={styles.listTitle}>Resumen de Ventas por Categoría</h3>

          {loading ? (
            <div className={styles.chartLoading}>
              <div className={styles.spinner} />
              <span>Analizando mezcla de ventas...</span>
            </div>
          ) : categoriesList.length === 0 ? (
            <div className={styles.chartEmpty}>No se registraron ventas en este período</div>
          ) : (
            <div className={styles.gridList}>
              {categoriesList.map((cat, idx) => {
                const isActive = selectedCat?.id === cat.id && selectedCat?.nombre === cat.nombre;
                const share = totalSalesFromCategories > 0 ? (cat.total / totalSalesFromCategories) * 100 : 0;

                return (
                  <div
                    key={cat.id || idx}
                    className={`${styles.categoryItem} ${isActive ? styles.categoryActive : ''}`}
                    onClick={() => setSelectedCat(cat)}
                  >
                    <div className={styles.categoryMeta}>
                      <span className={styles.categoryName}>{cat.nombre}</span>
                      <span className={styles.categoryTotal}>{fmt(cat.total)}</span>
                    </div>

                    <div className={styles.progressBarTrack}>
                      <div className={styles.progressBarFill} style={{ width: `${share}%` }} />
                    </div>

                    <div className={styles.categoryFooter}>
                      <span>{cat.cantidad} unidades vendidas</span>
                      <span className={styles.shareTag}>{share.toFixed(1)}% Mix</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side: Product Breakdown Drawer (Sticky) */}
        <div className={styles.detailCard}>
          {selectedCat ? (
            <>
              <div className={styles.detailHeader}>
                <div className={styles.detailTitleBlock}>
                  <h3>Detalle de {selectedCat.nombre}</h3>
                  <p>Análisis y estadísticas de ventas del grupo</p>
                </div>
                <div style={{ display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
                  <button
                    onClick={() => {
                      setTrendDateFrom(`${new Date().getFullYear()}-01-01`);
                      setTrendDateTo(toISO(new Date()));
                      setIsTrendModalOpen(true);
                    }}
                    style={{
                      display: 'inline-flex',
                      alignItems: 'center',
                      gap: '0.35rem',
                      padding: '0.45rem 0.75rem',
                      borderRadius: 'var(--r-md)',
                      background: 'rgba(237, 166, 10, 0.1)',
                      border: '1px solid rgba(237, 166, 10, 0.2)',
                      color: '#7A4520',
                      fontSize: '0.72rem',
                      fontWeight: 700,
                      cursor: 'pointer',
                      transition: 'var(--ease)'
                    }}
                  >
                    <TrendingUp size={12} /> Ver Tendencias
                  </button>
                  <button
                    onClick={exportCategoryProducts}
                    className={styles.detailExportBtn}
                    disabled={activeTab === 'productos' ? products.length === 0 : hours.length === 0}
                    style={{
                      opacity:
                        activeTab === 'productos'
                          ? products.length === 0
                            ? 0.6
                            : 1
                          : hours.length === 0
                          ? 0.6
                          : 1,
                    }}
                  >
                    <Download size={12} /> Excel
                  </button>
                </div>
              </div>

              {/* Category Mini KPIs */}
              <div className={styles.detailKpis}>
                <div className={styles.detailKpiCard}>
                  <span className={styles.detailKpiLabel}>Venta del Grupo</span>
                  <span className={styles.detailKpiVal} style={{ color: '#E3A21C' }}>
                    {fmt(selectedCat.total)}
                  </span>
                </div>
                <div className={styles.detailKpiCard}>
                  <span className={styles.detailKpiLabel}>Unidades</span>
                  <span className={styles.detailKpiVal} style={{ color: '#149D92' }}>
                    {selectedCat.cantidad} uds
                  </span>
                </div>
              </div>

              {/* Tabs */}
              <div className={styles.tabs}>
                <button
                  className={`${styles.tabBtn} ${activeTab === 'productos' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('productos')}
                >
                  <Package size={14} /> Artículos
                </button>
                <button
                  className={`${styles.tabBtn} ${activeTab === 'horas' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('horas')}
                >
                  <Clock size={14} /> Horas de Venta
                </button>
              </div>

              {/* Product or Hours Listing */}
              <div className={styles.productList}>
                {detailLoading ? (
                  <div className={styles.chartLoading}>
                    <div className={styles.spinner} />
                    <span>Cargando datos...</span>
                  </div>
                ) : activeTab === 'productos' ? (
                  products.length === 0 ? (
                    <div className={styles.chartEmpty}>Sin ventas de productos</div>
                  ) : (
                    products.map((prod, idx) => {
                      const prodShare = (prod.total / maxProductVal) * 100;
                      return (
                        <div key={prod.id || idx} className={styles.productRow}>
                          <div className={styles.productRank}>{idx + 1}</div>
                          <div className={styles.productContent}>
                            <span className={styles.productName} title={prod.nombre}>
                              {prod.nombre}
                            </span>
                            <div className={styles.productTrack}>
                              <div className={styles.productFill} style={{ width: `${prodShare}%` }} />
                            </div>
                          </div>
                          <div className={styles.productValBlock}>
                            <span className={styles.productTotal}>{fmt(prod.total)}</span>
                            <span className={styles.productQty}>{prod.cantidad} uds</span>
                          </div>
                        </div>
                      );
                    })
                  )
                ) : (
                  hours.length === 0 ? (
                    <div className={styles.chartEmpty}>Sin registros de horas para este grupo</div>
                  ) : (
                    [...hours]
                      .sort((a, b) => Number(a.hora) - Number(b.hora))
                      .map((h, idx) => {
                        const hourShare = (h.total / maxHourVal) * 100;
                        return (
                          <div key={h.hora || idx} className={styles.productRow}>
                            <div
                              className={styles.productRank}
                              style={{
                                background: 'rgba(209, 122, 78, 0.1)',
                                border: '1px solid rgba(209, 122, 78, 0.2)',
                              }}
                            >
                              <Clock size={11} style={{ color: '#D17A4E' }} />
                            </div>
                            <div className={styles.productContent}>
                              <span className={styles.productName}>
                                {h.hora}:00 - {Number(h.hora) + 1}:00
                              </span>
                              <div className={styles.productTrack}>
                                <div
                                  className={styles.productFill}
                                  style={{
                                    width: `${hourShare}%`,
                                    background: 'linear-gradient(90deg, #D17A4E 0%, #B4690E 100%)',
                                  }}
                                />
                              </div>
                            </div>
                            <div className={styles.productValBlock}>
                              <span className={styles.productTotal}>{fmt(h.total)}</span>
                              <span className={styles.productQty}>{h.cantidad} uds</span>
                            </div>
                          </div>
                        );
                      })
                  )
                )}
              </div>
            </>
          ) : (
            <div className={styles.detailPlaceholder}>
              <Layers size={40} style={{ opacity: 0.35, color: '#3D1C02' }} />
              <p>Selecciona una categoría a la izquierda para ver el desglose de productos individuales.</p>
            </div>
          )}
        </div>
      </div>

      {/* ====== SALES TREND MODAL ====== */}
      {isTrendModalOpen && selectedCat && (
        <div className={styles.modalOverlay} onClick={() => setIsTrendModalOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <h3>Tendencias de Venta — {selectedCat.nombre}</h3>
                <p>Evolución temporal del facturado y volumen en el rango seleccionado</p>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setIsTrendModalOpen(false)}>
                <X size={16} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {/* Modal Filters */}
              <div className={styles.modalFilters}>
                <div className={styles.dateRangePicker}>
                  <input
                    type="date"
                    value={trendDateFrom}
                    onChange={e => setTrendDateFrom(e.target.value)}
                    className={styles.dateInput}
                  />
                  <span className={styles.dateSep}>→</span>
                  <input
                    type="date"
                    value={trendDateTo}
                    onChange={e => setTrendDateTo(e.target.value)}
                    className={styles.dateInput}
                  />
                </div>

                <div className={styles.modalGranularity}>
                  {(['dia', 'semana', 'mes'] as const).map(tg => (
                    <button
                      key={tg}
                      className={`${styles.modalGranularityBtn} ${trendGroup === tg ? styles.modalGranularityActive : ''}`}
                      onClick={() => setTrendGroup(tg)}
                    >
                      {tg === 'dia' && 'Diario'}
                      {tg === 'semana' && 'Semanal'}
                      {tg === 'mes' && 'Mensual'}
                    </button>
                  ))}
                </div>
              </div>

              {trendError && <div className={styles.errorMsg}>{trendError}</div>}

              {/* Chart Panel */}
              <div className={styles.chartContainer}>
                {trendLoading ? (
                  <div className={styles.chartLoading}>
                    <div className={styles.spinner} />
                    <span>Cargando histórico de la categoría...</span>
                  </div>
                ) : trendList.length === 0 ? (
                  <div className={styles.chartEmpty}>
                    No hay registros de ventas para esta categoría en este rango de fechas.
                  </div>
                ) : (
                  <CategoryLineChart
                    data={trendList.map(r => ({ ...r, fecha: r.fecha?.split('T')[0] ?? r.fecha }))}
                    group={trendGroup}
                  />
                )}
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

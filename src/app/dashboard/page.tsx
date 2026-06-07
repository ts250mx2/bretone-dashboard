'use client';

import React, { useState, useEffect, useCallback } from 'react';
import {
  TrendingUp, ShoppingBag, ReceiptText, Banknote,
  CreditCard, Smartphone, XCircle, BarChart2,
  Calendar, Layers, Package, ChevronDown, X,
  LayoutGrid, List
} from 'lucide-react';
import styles from './dashboard.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────
type Period   = 'today' | 'yesterday' | 'week' | 'month';
type GroupBy  = 'categoria' | 'producto';

interface KPI {
  totalVentas: number;
  numTransacciones: number;
  ticketPromedio: number;
  efectivo: number;
  tarjeta: number;
  transferencia: number;
  canceladas: number;
}

interface TrendPoint { fecha: string; total: number; transacciones: number; }
interface BreakItem  { id?: number | null; nombre: string; total: number; cantidad: number; }
interface HeatCell   { diaSemana: number; hora: number; total: number; transacciones: number; }

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n || 0);

const fmtShort = (n: number) => {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
};

const DAYS_ES  = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const HOURS    = Array.from({ length: 24 }, (_, i) => i);

// ─── Mini SVG Line Chart ──────────────────────────────────────────────────────
function LineChart({ data, group }: { data: TrendPoint[]; group: 'dia' | 'semana' | 'mes' }) {
  if (data.length === 0) return <div className={styles.chartEmpty}>Sin datos para el período</div>;

  const W = 780, H = 200, PAD = { t: 16, r: 20, b: 40, l: 60 };
  const innerW = W - PAD.l - PAD.r;
  const innerH = H - PAD.t - PAD.b;
  const maxVal = Math.max(...data.map(d => d.total), 1);
  const toX    = (i: number) => PAD.l + (i / Math.max(data.length - 1, 1)) * innerW;
  const toY    = (v: number) => PAD.t + innerH - (v / maxVal) * innerH;

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
        <linearGradient id="lineGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%"   stopColor="var(--pink)"     stopOpacity="0.35" />
          <stop offset="100%" stopColor="var(--pink)"     stopOpacity="0.02" />
        </linearGradient>
      </defs>

      {/* Y-grid */}
      {yTicks.map(({ v, y }) => (
        <g key={v}>
          <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="var(--border)" strokeWidth="1" />
          <text x={PAD.l - 8} y={y + 4} textAnchor="end" fontSize="11" fill="var(--text-muted)">{fmtShort(v)}</text>
        </g>
      ))}

      {/* Area fill */}
      <polygon points={areaPoints} fill="url(#lineGrad)" />

      {/* Line */}
      <polyline points={points} fill="none" stroke="var(--pink)" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />

      {/* Dots + labels */}
      {data.map((d, i) => (
        <g key={i}>
          <circle cx={toX(i)} cy={toY(d.total)} r="4" fill="var(--pink)" stroke="var(--surface)" strokeWidth="2">
            <title>{`${formatLabel(d.fecha)} — Ventas: ${fmt(d.total)} (${d.transacciones} ticket${d.transacciones !== 1 ? 's' : ''})`}</title>
          </circle>
          <text
            x={toX(i)} y={PAD.t + innerH + 18}
            textAnchor="middle" fontSize="10" fill="var(--text-muted)"
          >
            {formatLabel(d.fecha)}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ─── Loading spinner ─────────────────────────────────────────────────────────
function Loader({ label }: { label: string }) {
  return (
    <div className={styles.chartLoading}>
      <div className={styles.spinner} />
      <span>{label}</span>
    </div>
  );
}

// ─── Mini Horizontal Bar Chart ───────────────────────────────────────────────
function BarChart({ data, onItemClick }: { data: BreakItem[]; onItemClick?: (item: BreakItem) => void }) {
  if (data.length === 0) return <div className={styles.chartEmpty}>Sin datos para el período</div>;
  const max = Math.max(...data.map(d => d.total), 1);
  const COLORS = ['#E3A21C', '#149D92', '#D17A4E', '#3D1C02', '#C2410C', '#7A8B4F', '#5B7A99', '#9C5B6B'];
  return (
    <div className={styles.barList}>
      {data.map((item, i) => (
        <div
          key={i}
          className={`${styles.barRow} ${onItemClick ? styles.clickableRow : ''}`}
          onClick={() => onItemClick?.(item)}
        >
          <div className={styles.barLabel} title={item.nombre}>{item.nombre}</div>
          <div className={styles.barTrack}>
            <div
              className={styles.barFill}
              style={{ width: `${(item.total / max) * 100}%`, background: COLORS[i % COLORS.length] }}
            />
          </div>
          <div className={styles.barValue}>{fmt(item.total)}</div>
          <div className={styles.barCount}>{item.cantidad} uds</div>
        </div>
      ))}
    </div>
  );
}

// ─── Treemap (Slice & Dice) ───────────────────────────────────────────────────
function SimpleTreemap({ data, onItemClick }: { data: BreakItem[]; onItemClick?: (item: BreakItem) => void }) {
  if (!data || data.length === 0) return <div className={styles.chartEmpty}>Sin datos para el período</div>;
  const W = 800;
  const H = 300;
  
  const items = [...data].sort((a,b) => b.total - a.total);
  const total = items.reduce((s, x) => s + x.total, 0);
  if (total === 0) return <div className={styles.chartEmpty}>Sin montos {'>'} 0</div>;

  let x = 0;
  let y = 0;
  let w = W;
  let h = H;

  const rects = [];
  let remainingTotal = total;

  for (let i = 0; i < items.length; i++) {
    const item = items[i];
    const ratio = item.total / remainingTotal;
    let rw, rh;
    if (w > h) {
      rw = w * ratio;
      rh = h;
      rects.push({ x, y, w: rw, h: rh, item });
      x += rw;
      w -= rw;
    } else {
      rw = w;
      rh = h * ratio;
      rects.push({ x, y, w: rw, h: rh, item });
      y += rh;
      h -= rh;
    }
    remainingTotal -= item.total;
  }

  const COLORS = ['#E3A21C', '#149D92', '#D17A4E', '#3D1C02', '#C2410C', '#7A8B4F', '#5B7A99', '#9C5B6B'];

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '300px' }}>
      {rects.map((r, i) => (
        <g 
          key={i} 
          onClick={() => onItemClick?.(r.item)} 
          style={{ cursor: onItemClick ? 'pointer' : 'default', transition: 'opacity 0.2s' }}
        >
          <rect 
            x={r.x} y={r.y} width={r.w} height={r.h} 
            fill={COLORS[i % COLORS.length]} 
            stroke="#fff" strokeWidth="2" 
          />
          {r.w > 60 && r.h > 40 && (
            <>
              <text x={r.x + 8} y={r.y + 20} fill="#fff" fontSize="12" fontWeight="bold" style={{ pointerEvents: 'none' }}>
                {r.item.nombre.length > (r.w / 8) ? r.item.nombre.substring(0, Math.floor(r.w / 8)) + '...' : r.item.nombre}
              </text>
              <text x={r.x + 8} y={r.y + 36} fill="rgba(255,255,255,0.8)" fontSize="11" style={{ pointerEvents: 'none' }}>
                {fmt(r.item.total)}
              </text>
            </>
          )}
          <title>{`${r.item.nombre}\nVentas: ${fmt(r.item.total)}\nCantidad: ${r.item.cantidad}`}</title>
        </g>
      ))}
    </svg>
  );
}

// ─── Heatmap ─────────────────────────────────────────────────────────────────
function Heatmap({ data }: { data: HeatCell[] }) {
  // Build a lookup: [day][hour] => { total, transacciones }
  const map: Record<string, { total: number; transacciones: number }> = {};
  let maxVal = 0;
  data.forEach(c => {
    const key = `${c.diaSemana}-${c.hora}`;
    map[key] = { total: c.total, transacciones: c.transacciones };
    if (c.total > maxVal) maxVal = c.total;
  });

  if (maxVal === 0) return <div className={styles.chartEmpty}>Sin datos para el período</div>;

  return (
    <div className={styles.heatmapWrap}>
      <div className={styles.heatmapGrid}>
        {/* Header row */}
        <div className={styles.heatCorner} />
        {HOURS.map(h => (
          <div key={h} className={styles.heatHour}>{h}h</div>
        ))}

        {/* Rows per day */}
        {DAYS_ES.map((day, d) => (
          <React.Fragment key={`frag-${d}`}>
            <div key={`day-${d}`} className={styles.heatDay}>{day}</div>
            {HOURS.map(h => {
              const cell = map[`${d}-${h}`] || { total: 0, transacciones: 0 };
              const val = cell.total;
              const txs = cell.transacciones;
              const intensity = maxVal > 0 ? val / maxVal : 0;
              return (
                <div
                  key={`${d}-${h}`}
                  className={styles.heatCell}
                  title={`${day} ${h}:00 — ${fmt(val)} (${txs} ticket${txs !== 1 ? 's' : ''})`}
                  style={{
                    background: intensity === 0
                      ? 'var(--surface-2)'
                      : `rgba(61, 28, 2, ${0.12 + intensity * 0.88})`,
                  }}
                />
              );
            })}
          </React.Fragment>
        ))}
      </div>
      {/* Legend */}
      <div className={styles.heatLegend}>
        <span>Menos ventas</span>
        <div className={styles.heatLegendBar} style={{ background: 'linear-gradient(to right, rgba(61, 28, 2, 0.12), rgba(61, 28, 2, 1))' }} />
        <span>Más ventas</span>
      </div>
    </div>
  );
}

// ─── Helpers: compute date strings for each preset ────────────────────────
function toISO(d: Date) {
  return d.toISOString().split('T')[0];
}
function datesForPeriod(p: Period): [string, string] {
  const today = new Date();
  today.setHours(0, 0, 0, 0);
  switch (p) {
    case 'today':     return [toISO(today), toISO(today)];
    case 'yesterday': {
      const y = new Date(today); y.setDate(y.getDate() - 1);
      return [toISO(y), toISO(y)];
    }
    case 'week': {
      const w = new Date(today); w.setDate(w.getDate() - 6);
      return [toISO(w), toISO(today)];
    }
    case 'month': {
      const m = new Date(today);
      m.setDate(1); // Start from the 1st day of the current month
      return [toISO(m), toISO(today)];
    }
  }
}

// ─── Main Page ────────────────────────────────────────────────────────────────
export default function DashboardPage() {
  const [groupBy,  setGroupBy]  = useState<GroupBy>('categoria');
  const [viewType, setViewType] = useState<'list' | 'treemap'>('list');
  const [trendGroup, setTrendGroup] = useState<'dia' | 'semana' | 'mes'>('dia');
  const [dateFrom, setDateFrom] = useState(() => datesForPeriod('today')[0]);
  const [dateTo,   setDateTo]   = useState(() => datesForPeriod('today')[1]);
  const [data,     setData]     = useState<any>(null);
  const [loading,  setLoading]  = useState(true);
  const [error,    setError]    = useState('');
  const [mounted,  setMounted]  = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Persist trendGroup grouping
  useEffect(() => {
    const saved = localStorage.getItem('bretone_dashboard_trend_group');
    if (saved === 'dia' || saved === 'semana' || saved === 'mes') {
      setTrendGroup(saved);
    }
    const savedView = localStorage.getItem('bretone_dashboard_view_type');
    if (savedView === 'list' || savedView === 'treemap') {
      setViewType(savedView);
    }
  }, []);

  const handleTrendGroup = (tg: 'dia' | 'semana' | 'mes') => {
    setTrendGroup(tg);
    localStorage.setItem('bretone_dashboard_trend_group', tg);
  };

  const handleViewType = (vt: 'list' | 'treemap') => {
    setViewType(vt);
    localStorage.setItem('bretone_dashboard_view_type', vt);
  };

  // ─── Modal States ──────────────────────────────────────────────────────────
  const [selectedCat, setSelectedCat] = useState<{ id: number | null | undefined; nombre: string } | null>(null);
  const [modalProducts, setModalProducts] = useState<any[]>([]);
  const [modalLoading, setModalLoading]   = useState(false);
  const [modalTab, setModalTab]           = useState<'monto' | 'cantidad'>('monto');

  const fetchCategoryDetails = useCallback(async (catId: any, catName: string) => {
    setModalLoading(true);
    try {
      const params = new URLSearchParams({
        id: catId !== undefined && catId !== null ? String(catId) : '',
        name: catName,
        dateFrom,
        dateTo,
      });
      const res = await fetch(`/api/dashboard/sales/category-details?${params}`);
      if (!res.ok) throw new Error('Error al cargar detalle');
      const json = await res.json();
      setModalProducts(json.products || []);
    } catch (e) {
      console.error(e);
    } finally {
      setModalLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (selectedCat) {
      fetchCategoryDetails(selectedCat.id, selectedCat.nombre);
    } else {
      setModalProducts([]);
    }
  }, [selectedCat, fetchCategoryDetails]);

  const handleCategoryClick = (item: BreakItem) => {
    setSelectedCat({ id: item.id, nombre: item.nombre });
    setModalTab('monto');
  };

  const modalTotalMonto = modalProducts.reduce((acc, p) => acc + Number(p.total), 0);
  const modalTotalCant  = modalProducts.reduce((acc, p) => acc + Number(p.cantidad), 0);

  const fetchData = useCallback(async (g: GroupBy, from: string, to: string, tg: 'dia' | 'semana' | 'mes') => {
    if (!from || !to) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ groupBy: g, dateFrom: from, dateTo: to, trendGroup: tg });
      const res = await fetch(`/api/dashboard/sales?${params}`, {
        cache: 'no-store'
      });
      if (!res.ok) throw new Error('Error al cargar datos');
      setData(await res.json());
    } catch (e: any) {
      setError(e.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(groupBy, dateFrom, dateTo, trendGroup);
  }, [groupBy, dateFrom, dateTo, trendGroup, fetchData]);

  // Period button clicked — sets the date pickers to the preset range
  const handlePeriod = (p: Period) => {
    const [from, to] = datesForPeriod(p);
    setDateFrom(from);
    setDateTo(to);
  };

  // Detect which preset the current dates match (for active highlight)
  const activePeriod: Period | null = (['today','yesterday','week','month'] as Period[]).find(p => {
    const [f, t] = datesForPeriod(p);
    return f === dateFrom && t === dateTo;
  }) ?? null;

  const periodLabel: Record<Period, string> = {
    today:     'Hoy',
    yesterday: 'Ayer',
    week:      'Últimos 7 días',
    month:     'Últimos 30 días',
  };

  const activeLabel = activePeriod
    ? periodLabel[activePeriod]
    : `${dateFrom} → ${dateTo}`;

  const kpi: KPI = data?.kpi ?? {
    totalVentas: 0, numTransacciones: 0, ticketPromedio: 0,
    efectivo: 0, tarjeta: 0, transferencia: 0, canceladas: 0,
  };

  if (!mounted) {
    return <div className={styles.container} style={{ opacity: 0 }}>Cargando...</div>;
  }

  return (
    <div className={styles.container}>
      {/* ── Header ── */}
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <BarChart2 size={32} style={{ color: 'var(--primary)' }} />
          <div>
            <h1 style={{ color: 'var(--text)' }}>Dashboard de Ventas</h1>
            <p className={styles.subtitle}>Análisis de rendimiento y KPIs — {activeLabel}</p>
          </div>
        </div>

        {/* Single filter row: preset buttons + date pickers */}
        <div className={styles.filterRow}>
          {(['today','yesterday','week','month'] as Period[]).map(p => (
            <button
              key={p}
              id={`period-${p}`}
              className={`${styles.periodBtn} ${activePeriod === p ? styles.periodActive : ''}`}
              onClick={() => handlePeriod(p)}
            >
              {p === 'today'     && <><Calendar size={14} /> Hoy</>}
              {p === 'yesterday' && <><Calendar size={14} /> Ayer</>}
              {p === 'week'      && <><Calendar size={14} /> Semana</>}
              {p === 'month'     && <><Calendar size={14} /> Mes</>}
            </button>
          ))}

          <div className={styles.dateDivider} />

          <input
            id="date-from"
            type="date"
            value={dateFrom}
            onChange={e => setDateFrom(e.target.value)}
            className={styles.dateInput}
          />
          <span className={styles.dateSep}>→</span>
          <input
            id="date-to"
            type="date"
            value={dateTo}
            onChange={e => setDateTo(e.target.value)}
            className={styles.dateInput}
          />
        </div>
      </header>

      {error && <div className={styles.errorMsg}>{error}</div>}

      {/* ── KPI Cards ── */}
      <div className={styles.kpiGrid}>
        <div className={`${styles.kpiCard} ${styles.kpiMain}`} style={{ background: '#fff', border: '1px solid rgba(61, 28, 2, 0.08)' }}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(227, 162, 28, 0.14)', color: '#E3A21C' }}>
            <TrendingUp size={22} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Ventas Totales</span>
            <span className={styles.kpiValue} style={{ color: 'var(--text)' }}>{loading ? <span className={`${styles.skeleton} ${styles.skeletonValue}`} /> : fmt(kpi.totalVentas)}</span>
            <span className={styles.kpiSub}>{activeLabel}</span>
          </div>
        </div>

        <div className={styles.kpiCard} style={{ background: '#fff', border: '1px solid rgba(61, 28, 2, 0.08)' }}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(20, 157, 146, 0.12)', color: 'var(--cyan)' }}>
            <ReceiptText size={22} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Transacciones</span>
            <span className={styles.kpiValue} style={{ color: 'var(--cyan)' }}>{loading ? <span className={`${styles.skeleton} ${styles.skeletonValue}`} /> : kpi.numTransacciones}</span>
            <span className={styles.kpiSub}>tickets procesados</span>
          </div>
        </div>

        <div className={styles.kpiCard} style={{ background: '#fff', border: '1px solid rgba(61, 28, 2, 0.08)' }}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(209, 122, 78, 0.16)', color: 'var(--yellow-deep)' }}>
            <ShoppingBag size={22} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Ticket Promedio</span>
            <span className={styles.kpiValue} style={{ color: 'var(--yellow-deep)' }}>{loading ? <span className={`${styles.skeleton} ${styles.skeletonValue}`} /> : fmt(kpi.ticketPromedio)}</span>
            <span className={styles.kpiSub}>por venta</span>
          </div>
        </div>

        <div className={styles.kpiCard} style={{ background: '#fff', border: '1px solid rgba(61, 28, 2, 0.08)' }}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(217, 76, 61, 0.10)', color: 'var(--danger)' }}>
            <XCircle size={22} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Cancelaciones</span>
            <span className={styles.kpiValue} style={{ color: 'var(--danger)' }}>{loading ? <span className={`${styles.skeleton} ${styles.skeletonValue}`} /> : kpi.canceladas}</span>
            <span className={styles.kpiSub}>en el período</span>
          </div>
        </div>
      </div>

      {/* ── Payment breakdown mini cards ── */}
      <div className={styles.payGrid}>
        <div className={styles.payCard} style={{ background: '#fff', border: '1px solid rgba(61, 28, 2, 0.06)' }}>
          <Banknote size={18} style={{ color: 'var(--yellow-deep)' }} />
          <span className={styles.payLabel}>Efectivo</span>
          <span className={styles.payVal} style={{ color: 'var(--text)' }}>{loading ? <span className={`${styles.skeleton} ${styles.skeletonSm}`} /> : fmt(kpi.efectivo)}</span>
        </div>
        <div className={styles.payCard} style={{ background: '#fff', border: '1px solid rgba(61, 28, 2, 0.06)' }}>
          <CreditCard size={18} style={{ color: 'var(--pink)' }} />
          <span className={styles.payLabel}>Tarjeta</span>
          <span className={styles.payVal} style={{ color: 'var(--text)' }}>{loading ? <span className={`${styles.skeleton} ${styles.skeletonSm}`} /> : fmt(kpi.tarjeta)}</span>
        </div>
      </div>

      {/* ── Trend Chart ── */}
      <div className={styles.chartCard} style={{ background: '#fff', border: '1px solid rgba(61, 28, 2, 0.08)' }}>
        <div className={styles.chartHeader}>
          <div>
            <h3 className={styles.chartTitle} style={{ color: 'var(--text)' }}>Tendencia de Ventas</h3>
            <p className={styles.chartSub}>
              Ventas por {trendGroup === 'dia' ? 'día' : trendGroup === 'semana' ? 'semana' : 'mes'} en el período seleccionado
            </p>
          </div>
          <div className={styles.groupBtns}>
            <button
              className={`${styles.groupBtn} ${trendGroup === 'dia' ? styles.groupActive : ''}`}
              onClick={() => handleTrendGroup('dia')}
            >
              Día
            </button>
            <button
              className={`${styles.groupBtn} ${trendGroup === 'semana' ? styles.groupActive : ''}`}
              onClick={() => handleTrendGroup('semana')}
            >
              Semana
            </button>
            <button
              className={`${styles.groupBtn} ${trendGroup === 'mes' ? styles.groupActive : ''}`}
              onClick={() => handleTrendGroup('mes')}
            >
              Mes
            </button>
          </div>
        </div>
        <div className={styles.chartBody}>
          {loading
            ? <Loader label="Cargando tendencia…" />
            : <LineChart
                data={(data?.trend ?? []).map((r: any) => ({ ...r, fecha: r.fecha?.split('T')[0] ?? r.fecha }))}
                group={trendGroup}
              />
          }
        </div>
      </div>

      {/* ── Breakdown Chart ── */}
      <div className={styles.chartCard} style={{ background: '#fff', border: '1px solid rgba(61, 28, 2, 0.08)' }}>
        <div className={styles.chartHeader}>
          <div>
            <h3 className={styles.chartTitle} style={{ color: 'var(--text)' }}>Ventas por {groupBy === 'categoria' ? 'Categoría' : 'Producto'}</h3>
            <p className={styles.chartSub}>Desglose del período seleccionado</p>
          </div>
          <div style={{ display: 'flex', gap: '1rem', alignItems: 'center' }}>
            <div className={styles.groupBtns}>
              <button
                className={`${styles.groupBtn} ${viewType === 'list' ? styles.groupActive : ''}`}
                onClick={() => handleViewType('list')}
                title="Vista de Lista"
              >
                <List size={14} />
              </button>
              <button
                className={`${styles.groupBtn} ${viewType === 'treemap' ? styles.groupActive : ''}`}
                onClick={() => handleViewType('treemap')}
                title="Vista de Gráfica (Treemap)"
              >
                <LayoutGrid size={14} />
              </button>
            </div>
            <div className={styles.dateDivider} style={{ height: '24px' }} />
            <div className={styles.groupBtns}>
              <button
                id="group-categoria"
                className={`${styles.groupBtn} ${groupBy === 'categoria' ? styles.groupActive : ''}`}
                onClick={() => setGroupBy('categoria')}
              >
                <Layers size={14} /> Categoría
              </button>
              <button
                id="group-producto"
                className={`${styles.groupBtn} ${groupBy === 'producto' ? styles.groupActive : ''}`}
                onClick={() => setGroupBy('producto')}
              >
                <Package size={14} /> Producto
              </button>
            </div>
          </div>
        </div>
        <div className={styles.chartBody}>
          {loading
            ? <Loader label="Cargando desglose…" />
            : viewType === 'list' 
              ? <BarChart
                  data={data?.breakdown ?? []}
                  onItemClick={groupBy === 'categoria' ? handleCategoryClick : undefined}
                />
              : <SimpleTreemap
                  data={data?.breakdown ?? []}
                  onItemClick={groupBy === 'categoria' ? handleCategoryClick : undefined}
                />
          }
        </div>
      </div>

      {/* ── Heatmap ── */}
      <div className={styles.chartCard} style={{ background: '#fff', border: '1px solid rgba(61, 28, 2, 0.08)' }}>
        <div className={styles.chartHeader}>
          <div>
            <h3 className={styles.chartTitle} style={{ color: 'var(--text)' }}>Mapa de Calor por Hora</h3>
            <p className={styles.chartSub}>Concentración de ventas por día de la semana y hora del día</p>
          </div>
        </div>
        <div className={styles.chartBody}>
          {loading
            ? <Loader label="Cargando mapa de calor…" />
            : <Heatmap data={data?.heatmap ?? []} />
          }
        </div>
      </div>

      {/* ─── Category Details Modal ─── */}
      {selectedCat && (
        <div className={styles.modalOverlay} onClick={() => setSelectedCat(null)}>
          <div className={styles.modalContent} style={{ background: '#FFF8E7', border: '1px solid rgba(245, 194, 0, 0.35)', boxShadow: '0 20px 50px rgba(61, 28, 2, 0.15)' }} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <div className={styles.modalTitleGroup}>
                <h3 style={{ color: 'var(--text)' }}>{selectedCat.nombre}</h3>
                <p>Detalle de productos en el período seleccionado</p>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setSelectedCat(null)}>
                <X size={18} />
              </button>
            </div>

            {/* KPIs */}
            <div className={styles.modalKpis}>
              <div className={styles.modalKpiCard} style={{ background: '#fff', border: '1px solid rgba(61, 28, 2, 0.08)' }}>
                <span className={styles.modalKpiLabel}>Ventas Totales</span>
                <span className={styles.modalKpiValue} style={{ color: 'var(--pink)' }}>
                  {modalLoading ? '—' : fmt(modalTotalMonto)}
                </span>
              </div>
              <div className={styles.modalKpiCard} style={{ background: '#fff', border: '1px solid rgba(61, 28, 2, 0.08)' }}>
                <span className={styles.modalKpiLabel}>Unidades Vendidas</span>
                <span className={styles.modalKpiValue} style={{ color: 'var(--primary)' }}>
                  {modalLoading ? '—' : `${modalTotalCant} uds`}
                </span>
              </div>
            </div>

            {/* Tabs */}
            <div className={styles.modalTabs} style={{ background: 'rgba(61, 28, 2, 0.05)', border: '1px solid rgba(61, 28, 2, 0.08)' }}>
              <button
                className={`${styles.modalTabBtn} ${modalTab === 'monto' ? styles.modalTabActivePink : ''}`}
                onClick={() => setModalTab('monto')}
                style={{ color: modalTab === 'monto' ? '#FFF8E7' : 'rgba(61, 28, 2, 0.6)' }}
              >
                <Banknote size={15} /> Monto ($)
              </button>
              <button
                className={`${styles.modalTabBtn} ${modalTab === 'cantidad' ? styles.modalTabActiveCyan : ''}`}
                onClick={() => setModalTab('cantidad')}
                style={{ color: modalTab === 'cantidad' ? '#ffffff' : 'rgba(61, 28, 2, 0.6)' }}
              >
                <Package size={15} /> Cantidad (Uds)
              </button>
            </div>

            {/* Content List */}
            <div className={styles.modalChartBody}>
              {modalLoading ? (
                <Loader label="Cargando desglose…" />
              ) : modalProducts.length === 0 ? (
                <div className={styles.chartEmpty}>Sin ventas registradas en este período</div>
              ) : (
                (() => {
                  const maxVal = Math.max(
                    ...modalProducts.map(p => (modalTab === 'monto' ? Number(p.total) : Number(p.cantidad))),
                    1
                  );
                  return modalProducts.map((p, i) => {
                    const currentVal = modalTab === 'monto' ? Number(p.total) : Number(p.cantidad);
                    const pct = (currentVal / maxVal) * 100;
                    return (
                      <div key={p.id || i} className={styles.modalBarRow}>
                        <div className={styles.modalBarRank}>{i + 1}</div>
                        <div className={styles.modalBarContent}>
                          <div className={styles.modalBarLabel} title={p.nombre}>{p.nombre}</div>
                          <div className={styles.modalBarTrack} style={{ background: 'rgba(61, 28, 2, 0.06)' }}>
                            <div
                              className={modalTab === 'monto' ? styles.modalBarFillPink : styles.modalBarFillCyan}
                              style={{ width: `${pct}%` }}
                            />
                          </div>
                        </div>
                        <div className={styles.modalBarValue} style={{ color: 'var(--text)' }}>
                          {modalTab === 'monto' ? fmt(p.total) : `${p.cantidad} uds`}
                        </div>
                      </div>
                    );
                  });
                })()
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

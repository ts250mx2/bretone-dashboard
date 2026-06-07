'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  UtensilsCrossed,
  Calendar,
  DollarSign,
  ReceiptText,
  ShoppingBag,
  List,
  LayoutGrid,
  X,
  Package,
  Banknote
} from 'lucide-react';
import styles from './tipo.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────
type Period = 'today' | 'yesterday' | 'week' | 'month';

interface BreakItem {
  nombre: string;
  total: number;
  cantidad: number;
}

// Helper to format currency
const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n || 0);

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

// ─── Treemap Component ────────────────────────────────────────────────────────
function SimpleTreemap({ data, onItemClick }: { data: BreakItem[]; onItemClick?: (item: BreakItem) => void }) {
  if (!data || data.length === 0) return <div className={styles.chartEmpty}>Sin datos para el período</div>;
  const W = 800;
  const H = 400;
  
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

  // Consistent coloring for types
  const getColor = (nombre: string) => {
    switch(nombre) {
      case 'Mesa': return '#149D92'; // Cyan
      case 'Para Llevar': return '#E3A21C'; // Amber
      case 'Domicilio': return '#D17A4E'; // Muted Amber/Orange
      default: return '#3D1C02'; // Chocolate
    }
  };

  return (
    <svg viewBox={`0 0 ${W} ${H}`} preserveAspectRatio="none" style={{ width: '100%', height: '400px', display: 'block' }}>
      {rects.map((r, i) => (
        <g 
          key={i} 
          onClick={() => onItemClick?.(r.item)}
          style={{ cursor: onItemClick ? 'pointer' : 'default', transition: 'opacity 0.2s' }}
        >
          <rect 
            x={r.x} y={r.y} width={r.w} height={r.h} 
            fill={getColor(r.item.nombre)} 
            stroke="#fff" strokeWidth="3" 
          />
          {r.w > 60 && r.h > 50 && (
            <>
              <text x={r.x + 12} y={r.y + 24} fill="#fff" fontSize="16" fontWeight="bold" style={{ pointerEvents: 'none' }}>
                {r.item.nombre.length > (r.w / 8) ? r.item.nombre.substring(0, Math.floor(r.w / 8)) + '...' : r.item.nombre}
              </text>
              <text x={r.x + 12} y={r.y + 44} fill="rgba(255,255,255,0.9)" fontSize="14" style={{ pointerEvents: 'none' }}>
                {fmt(r.item.total)}
              </text>
              <text x={r.x + 12} y={r.y + 60} fill="rgba(255,255,255,0.7)" fontSize="12" style={{ pointerEvents: 'none' }}>
                {r.item.cantidad} tickets
              </text>
            </>
          )}
          <title>{`${r.item.nombre}\nVentas: ${fmt(r.item.total)}\nTransacciones: ${r.item.cantidad}`}</title>
        </g>
      ))}
    </svg>
  );
}

// ─── Bar Chart Component ──────────────────────────────────────────────────────
function BarChart({ data, onItemClick }: { data: BreakItem[]; onItemClick?: (item: BreakItem) => void }) {
  if (data.length === 0) return <div className={styles.chartEmpty}>Sin datos para el período</div>;
  const max = Math.max(...data.map(d => d.total), 1);
  const getColor = (nombre: string) => {
    switch(nombre) {
      case 'Mesa': return '#149D92'; // Cyan
      case 'Para Llevar': return '#E3A21C'; // Amber
      case 'Domicilio': return '#D17A4E'; // Muted Amber/Orange
      default: return '#3D1C02'; // Chocolate
    }
  };
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
              style={{ width: `${(item.total / max) * 100}%`, background: getColor(item.nombre) }}
            />
          </div>
          <div className={styles.barValue}>{fmt(item.total)}</div>
          <div className={styles.barCount}>{item.cantidad} tickets</div>
        </div>
      ))}
    </div>
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

// ─── Main Component ──────────────────────────────────────────────────────────
export default function TipoVentaReport() {
  const [dateFrom, setDateFrom] = useState(() => datesForPeriod('month')[0]);
  const [dateTo, setDateTo] = useState(() => datesForPeriod('month')[1]);
  const [viewType, setViewType] = useState<'treemap' | 'list'>('treemap');
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);
  
  // Modal states
  const [selectedTipo, setSelectedTipo] = useState<string | null>(null);
  const [modalProducts, setModalProducts] = useState<any[]>([]);
  const [modalLoading, setModalLoading] = useState(false);
  const [modalTab, setModalTab] = useState<'monto' | 'cantidad'>('monto');

  useEffect(() => {
    setMounted(true);
  }, []);

  const fetchData = useCallback(async (from: string, to: string) => {
    if (!from || !to) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ dateFrom: from, dateTo: to });
      const res = await fetch(`/api/dashboard/sales-by-type?${params}`, { cache: 'no-store' });
      if (!res.ok) throw new Error('Error al cargar datos');
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData(dateFrom, dateTo);
  }, [dateFrom, dateTo, fetchData]);

  const handlePeriod = (p: Period) => {
    const [from, to] = datesForPeriod(p);
    setDateFrom(from);
    setDateTo(to);
  };

  const activePeriod: Period | null = useMemo(() => {
    return (['today', 'yesterday', 'week', 'month'] as Period[]).find(p => {
      const [f, t] = datesForPeriod(p);
      return f === dateFrom && t === dateTo;
    }) ?? null;
  }, [dateFrom, dateTo]);

  const fetchTipoDetails = useCallback(async (tipo: string) => {
    setModalLoading(true);
    try {
      const params = new URLSearchParams({
        tipo,
        dateFrom,
        dateTo,
      });
      const res = await fetch(`/api/dashboard/sales-by-type/details?${params}`, { cache: 'no-store' });
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
    if (selectedTipo) {
      fetchTipoDetails(selectedTipo);
    } else {
      setModalProducts([]);
    }
  }, [selectedTipo, fetchTipoDetails]);

  const handleTipoClick = (item: BreakItem) => {
    setSelectedTipo(item.nombre);
    setModalTab('monto');
  };

  const modalTotalMonto = modalProducts.reduce((acc, p) => acc + Number(p.total), 0);
  const modalTotalCant  = modalProducts.reduce((acc, p) => acc + Number(p.cantidad), 0);

  if (!mounted) {
    return <div className={styles.container} style={{ opacity: 0 }}>Cargando...</div>;
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

  const kpis = data?.kpis || { totalVentas: 0, numTransacciones: 0, ticketPromedio: 0 };
  const chartData = data?.data || [];

  return (
    <div className={styles.container}>
      {/* ====== HEADER ====== */}
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <UtensilsCrossed size={34} style={{ color: 'var(--primary)' }} />
          <div>
            <h1>Desglose por Tipo de Venta</h1>
            <p className={styles.subtitle}>Análisis de ventas en Mesa, Para Llevar y Domicilio</p>
          </div>
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
          <div className={styles.kpiIcon} style={{ background: 'rgba(227, 162, 28, 0.12)', color: '#E3A21C' }}>
            <DollarSign size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Total Ventas</span>
            <span className={styles.kpiValue}>{loading ? '—' : fmt(kpis.totalVentas)}</span>
            <span className={styles.kpiSub}>{activeLabel}</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(20, 157, 146, 0.12)', color: '#149D92' }}>
            <ReceiptText size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Transacciones Totales</span>
            <span className={styles.kpiValue}>{loading ? '—' : kpis.numTransacciones}</span>
            <span className={styles.kpiSub}>Tickets generados</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(61, 28, 2, 0.12)', color: '#3D1C02' }}>
            <ShoppingBag size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Ticket Promedio Global</span>
            <span className={styles.kpiValue}>{loading ? '—' : fmt(kpis.ticketPromedio)}</span>
            <span className={styles.kpiSub}>Por transacción</span>
          </div>
        </div>
      </div>

      {/* ====== CHART SECTION ====== */}
      <div className={styles.chartCard}>
        <div className={styles.chartTitleBlock} style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center' }}>
          <div>
            <h3>Proporción por Modalidad</h3>
            <p>Selecciona una opción para ver el detalle de productos vendidos.</p>
          </div>
          <div className={styles.groupBtns} style={{ display: 'flex', gap: '0.5rem' }}>
            <button
              className={`${styles.presetBtn} ${viewType === 'list' ? styles.presetActive : ''}`}
              onClick={() => setViewType('list')}
              title="Vista de Barras"
              style={{ padding: '0.4rem 0.6rem' }}
            >
              <List size={16} />
            </button>
            <button
              className={`${styles.presetBtn} ${viewType === 'treemap' ? styles.presetActive : ''}`}
              onClick={() => setViewType('treemap')}
              title="Vista de Rectángulos"
              style={{ padding: '0.4rem 0.6rem' }}
            >
              <LayoutGrid size={16} />
            </button>
          </div>
        </div>

        <div className={styles.chartWrapper} style={{ background: viewType === 'list' ? 'transparent' : 'var(--surface-2)' }}>
          {loading ? (
            <Loader label="Calculando gráfica..." />
          ) : viewType === 'list' ? (
            <BarChart data={chartData} onItemClick={handleTipoClick} />
          ) : (
            <SimpleTreemap data={chartData} onItemClick={handleTipoClick} />
          )}
        </div>
      </div>

      {/* ─── Category Details Modal ─── */}
      {selectedTipo && (
        <div className={styles.modalOverlay} onClick={() => setSelectedTipo(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHead}>
              <div className={styles.modalTitleGroup}>
                <h3 style={{ color: 'var(--text)' }}>Ventas: {selectedTipo}</h3>
                <p>Top 50 productos en esta modalidad</p>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setSelectedTipo(null)}>
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
                <Loader label="Cargando productos..." />
              ) : modalProducts.length === 0 ? (
                <div className={styles.chartEmpty}>Sin ventas registradas en esta modalidad</div>
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

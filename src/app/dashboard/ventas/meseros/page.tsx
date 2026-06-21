'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock,
  Calendar,
  DollarSign,
  Users,
  TrendingUp,
  Download,
  Layers,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import styles from './meseros.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────
type Period = 'today' | 'yesterday' | 'week' | 'month';

interface SaleRow {
  Total: number;
  Mesero: string;
  Hora: number;
}

// Format currency in MXN
const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n || 0);

// Helper to format short numbers for charts (e.g. $4.5k)
const fmtShort = (n: number) => {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
};

// Format ISO string date to local YYYY-MM-DD
function toISO(d: Date) {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
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

// Brand/Harmonious palette for Waiters
const WAITER_COLORS = [
  '#E3A21C', // Honey Gold
  '#149D92', // Teal
  '#D17A4E', // Terracotta
  '#D94C3D', // Coral Red
  '#829A86', // Sage Green
  '#7A4520', // Cocoa Brown
  '#F29C38', // Amber
  '#3D1C02', // Espresso
  '#5E4028', // Dark Wood
  '#0E9488', // Dark Teal
  '#C2662F', // Rust
  '#B4690E', // Dark Gold
];

const getColorForWaiter = (waiterName: string) => {
  let hash = 0;
  for (let i = 0; i < waiterName.length; i++) {
    hash = waiterName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % WAITER_COLORS.length;
  return WAITER_COLORS[idx];
};

export default function SalesByWaiterReport() {
  const [dateFrom, setDateFrom] = useState(() => datesForPeriod('week')[0]); // Default to last 7 days
  const [dateTo, setDateTo] = useState(() => datesForPeriod('week')[1]);
  const [data, setData] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);
  
  // Navigation Tabs for Chart Selection
  const [activeChartTab, setActiveChartTab] = useState<'hora' | 'rectangulos'>('rectangulos');

  // Tooltip tracking states
  const [tooltip, setTooltip] = useState<{
    hour: number;
    x: number;
    y: number;
  } | null>(null);

  const [waiterTooltip, setWaiterTooltip] = useState<{
    waiter: string;
    total: number;
    share: number;
    avgHourly: number;
    x: number;
    y: number;
  } | null>(null);

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

  // Fetch report data for the date range
  const fetchReport = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ dateFrom: from, dateTo: to });
      const res = await fetch(`/api/dashboard/sales/meseros?${params}`);
      if (!res.ok) throw new Error('Error al cargar datos del reporte');
      const json = await res.json();
      
      setData(json.data || []);
    } catch (e: any) {
      setError(e.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on range changes
  useEffect(() => {
    if (mounted) {
      fetchReport(dateFrom, dateTo);
    }
  }, [dateFrom, dateTo, mounted, fetchReport]);

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

  // Computations
  const uniqueWaiters = useMemo(() => {
    const waiters = new Set<string>();
    data.forEach(row => {
      if (row.Mesero) waiters.add(row.Mesero);
    });
    return Array.from(waiters).sort();
  }, [data]);

  const totalSales = useMemo(() => {
    return data.reduce((acc, row) => acc + Number(row.Total), 0);
  }, [data]);

  const waiterTotalsMap = useMemo(() => {
    const map: Record<string, number> = {};
    data.forEach(row => {
      map[row.Mesero] = (map[row.Mesero] || 0) + Number(row.Total);
    });
    return map;
  }, [data]);

  const bestWaiter = useMemo(() => {
    let best = '';
    let maxVal = 0;
    Object.entries(waiterTotalsMap).forEach(([waiter, val]) => {
      if (val > maxVal) {
        maxVal = val;
        best = waiter;
      }
    });
    return { name: best, total: maxVal };
  }, [waiterTotalsMap]);

  // Grouped hourly data for chart & table
  const hourlyDataMap = useMemo(() => {
    const map: Record<number, Record<string, number>> = {};
    data.forEach(row => {
      const h = Number(row.Hora);
      if (!map[h]) {
        map[h] = {};
      }
      map[h][row.Mesero] = Number(row.Total);
    });
    return map;
  }, [data]);

  const hoursList = useMemo(() => {
    const hours = Object.keys(hourlyDataMap).map(Number);
    if (hours.length === 0) return [];
    
    // Continuous range from min to max hour with sale data
    const minH = Math.min(...hours);
    const maxH = Math.max(...hours);
    
    // Ensure at least hours 9 to 21 are rendered or adapt to data range
    const startHour = Math.max(0, Math.min(9, minH - 1));
    const endHour = Math.min(23, Math.max(21, maxH + 1));
    
    const range = [];
    for (let h = startHour; h <= endHour; h++) {
      range.push(h);
    }
    return range;
  }, [hourlyDataMap]);

  const peakHour = useMemo(() => {
    let peakH = -1;
    let maxVal = 0;
    
    Object.entries(hourlyDataMap).forEach(([hourStr, waiterAmounts]) => {
      const hrTotal = Object.values(waiterAmounts).reduce((a, b) => a + b, 0);
      if (hrTotal > maxVal) {
        maxVal = hrTotal;
        peakH = Number(hourStr);
      }
    });
    return { hour: peakH, total: maxVal };
  }, [hourlyDataMap]);

  const maxHourlyTotal = useMemo(() => {
    let max = 0;
    hoursList.forEach(h => {
      const hrMap = hourlyDataMap[h] || {};
      const sum = Object.values(hrMap).reduce((a, b) => a + b, 0);
      if (sum > max) max = sum;
    });
    return max > 0 ? max : 1;
  }, [hoursList, hourlyDataMap]);

  // Waiter-specific computations for sorted rankings & rect chart
  const sortedWaitersBySales = useMemo(() => {
    return uniqueWaiters
      .map(waiter => {
        const total = waiterTotalsMap[waiter] || 0;
        const share = totalSales > 0 ? (total / totalSales) * 100 : 0;
        
        // Count active hours
        const activeHours = Object.values(hourlyDataMap).filter(hrMap => (hrMap[waiter] || 0) > 0).length;
        const avgHourly = activeHours > 0 ? total / activeHours : 0;
        
        return { name: waiter, total, share, avgHourly };
      })
      .sort((a, b) => b.total - a.total);
  }, [uniqueWaiters, waiterTotalsMap, totalSales, hourlyDataMap]);

  const maxWaiterSales = useMemo(() => {
    const totals = Object.values(waiterTotalsMap);
    return totals.length > 0 ? Math.max(...totals) : 1;
  }, [waiterTotalsMap]);

  // Render SVG Stacked Bar dimensions
  const SVG_W = 800;
  const SVG_H = 320;
  const PAD_T = 20;
  const PAD_R = 25;
  const PAD_B = 40;
  const PAD_L = 65;
  const innerW = SVG_W - PAD_L - PAD_R;
  const innerH = SVG_H - PAD_T - PAD_B;

  // Waiter horizontal bar chart dimensions
  const RECT_PAD_L = 120;
  const RECT_PAD_R = 120;
  const rectChartH = useMemo(() => {
    return Math.max(320, sortedWaitersBySales.length * 40 + 40);
  }, [sortedWaitersBySales]);

  // Grid ticks
  const yTicks = useMemo(() => {
    return [0, 0.25, 0.5, 0.75, 1].map(r => ({
      val: maxHourlyTotal * r,
      y: PAD_T + innerH - r * innerH
    }));
  }, [maxHourlyTotal, innerH]);

  const xTicks = useMemo(() => {
    return [0, 0.25, 0.5, 0.75, 1].map(r => ({
      val: maxWaiterSales * r,
      x: RECT_PAD_L + r * (SVG_W - RECT_PAD_L - RECT_PAD_R),
    }));
  }, [maxWaiterSales]);

  // Dynamic Tooltip Position Helpers (hourly)
  const handleMouseMove = (h: number, e: React.MouseEvent<SVGElement>) => {
    const container = e.currentTarget.ownerSVGElement?.parentElement?.parentElement;
    const rect = container?.getBoundingClientRect();
    if (rect) {
      setTooltip({
        hour: h,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 15,
      });
    }
  };

  const handleMouseLeave = () => {
    setTooltip(null);
  };

  // Dynamic Tooltip Position Helpers (waiters totals)
  const handleWaiterMouseMove = (waiterItem: typeof sortedWaitersBySales[0], e: React.MouseEvent<SVGElement>) => {
    const container = e.currentTarget.ownerSVGElement?.parentElement?.parentElement;
    const rect = container?.getBoundingClientRect();
    if (rect) {
      setWaiterTooltip({
        waiter: waiterItem.name,
        total: waiterItem.total,
        share: waiterItem.share,
        avgHourly: waiterItem.avgHourly,
        x: e.clientX - rect.left,
        y: e.clientY - rect.top - 15,
      });
    }
  };

  const handleWaiterMouseLeave = () => {
    setWaiterTooltip(null);
  };

  // Excel Export
  const handleExportExcel = () => {
    if (data.length === 0) return;

    // Create a pivoted dataset for excel sheet
    const rows = hoursList
      .map(h => {
        const hrMap = hourlyDataMap[h] || {};
        const hourTotal = Object.values(hrMap).reduce((a, b) => a + b, 0);
        
        const excelRow: Record<string, any> = {
          'Hora': `${String(h).padStart(2, '0')}:00`,
        };
        
        uniqueWaiters.forEach(waiter => {
          excelRow[waiter] = hrMap[waiter] || 0;
        });
        
        excelRow['Total Hora ($)'] = hourTotal;
        return excelRow;
      })
      .filter(row => row['Total Hora ($)'] > 0);

    // Append a totals row
    const totalsRow: Record<string, any> = {
      'Hora': 'TOTALES',
    };
    uniqueWaiters.forEach(waiter => {
      totalsRow[waiter] = waiterTotalsMap[waiter] || 0;
    });
    totalsRow['Total Hora ($)'] = totalSales;
    rows.push(totalsRow);

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventas por Mesero');
    XLSX.writeFile(workbook, `Ventas_Mesero_${dateFrom}_a_${dateTo}.xlsx`);
  };

  if (!mounted) {
    return <div className={styles.container} style={{ opacity: 0 }}>Cargando página...</div>;
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
          <Users size={34} style={{ color: 'var(--bretone-gold)' }} />
          <div>
            <h1>Ventas por Mesero</h1>
            <p className={styles.subtitle}>Análisis del facturado acumulado por mesero y bloque horario</p>
          </div>
        </div>

        <div className={styles.actionsGroup}>
          <button
            onClick={handleExportExcel}
            className={styles.exportBtn}
            disabled={data.length === 0}
            style={{ opacity: data.length === 0 ? 0.6 : 1 }}
          >
            <Download size={15} /> Exportar Excel
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
        <div className={`${styles.kpiCard} kpi-glow-brown`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(61, 28, 2, 0.08)', color: '#3D1C02' }}>
            <DollarSign size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Total Facturado</span>
            <span className={styles.kpiValue}>{loading ? '—' : fmt(totalSales)}</span>
            <span className={styles.kpiSub}>{activeLabel}</span>
          </div>
        </div>

        <div className={`${styles.kpiCard} kpi-glow-yellow`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(227, 162, 28, 0.08)', color: '#E3A21C' }}>
            <TrendingUp size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Mesero Estrella</span>
            <span className={styles.kpiValue} title={bestWaiter.name}>
              {loading ? '—' : bestWaiter.name || 'Ninguno'}
            </span>
            <span className={styles.kpiSub}>
              {bestWaiter.total > 0 ? `Venta: ${fmt(bestWaiter.total)}` : 'Sin ventas'}
            </span>
          </div>
        </div>

        <div className={`${styles.kpiCard} kpi-glow-red`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(214, 64, 44, 0.08)', color: '#D6402C' }}>
            <Clock size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Hora Pico Comercial</span>
            <span className={styles.kpiValue}>
              {loading ? '—' : peakHour.hour !== -1 ? `${String(peakHour.hour).padStart(2, '0')}:00` : '—'}
            </span>
            <span className={styles.kpiSub}>
              {peakHour.total > 0 ? `Ingresos: ${fmt(peakHour.total)}` : 'Sin transacciones'}
            </span>
          </div>
        </div>

        <div className={`${styles.kpiCard} kpi-glow-green`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(20, 157, 146, 0.08)', color: '#149D92' }}>
            <Layers size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Meseros Activos</span>
            <span className={styles.kpiValue}>{loading ? '—' : uniqueWaiters.length}</span>
            <span className={styles.kpiSub}>Meseros con facturación</span>
          </div>
        </div>
      </div>

      {/* ====== CHART SECTION ====== */}
      <div className={styles.chartCard} style={{ position: 'relative' }}>
        <div className={styles.chartHeader}>
          <div>
            <h3>Análisis Gráfico de Ventas</h3>
            <p>Visualiza el facturado acumulado y la distribución por mesero</p>
          </div>
          
          {/* Segmented Control for Chart Selection */}
          <div className={styles.segmentedControl}>
            <button
              className={`${styles.segmentBtn} ${activeChartTab === 'rectangulos' ? styles.segmentActive : ''}`}
              onClick={() => {
                setActiveChartTab('rectangulos');
                setTooltip(null);
              }}
            >
              <Layers size={13} /> Ventas Totales
            </button>
            <button
              className={`${styles.segmentBtn} ${activeChartTab === 'hora' ? styles.segmentActive : ''}`}
              onClick={() => {
                setActiveChartTab('hora');
                setWaiterTooltip(null);
              }}
            >
              <Clock size={13} /> Distribución Horaria
            </button>
          </div>
        </div>

        <div className={styles.chartWrapper}>
          {loading ? (
            <div className={styles.chartLoading}>
              <div className={styles.spinner} />
              <span>Analizando distribución por mesero...</span>
            </div>
          ) : data.length === 0 ? (
            <div className={styles.chartEmpty}>No se registraron ventas en este período</div>
          ) : activeChartTab === 'hora' ? (
            // TAB 1: Stacked Hourly Bar Chart
            <>
              <svg viewBox={`0 0 ${SVG_W} ${SVG_H}`} className={styles.chartSvg} preserveAspectRatio="none">
                {/* Gridlines */}
                {yTicks.map((tick, i) => (
                  <g key={i}>
                    <line x1={PAD_L} y1={tick.y} x2={SVG_W - PAD_R} y2={tick.y} stroke="rgba(61, 28, 2, 0.08)" strokeWidth="1" />
                    <text x={PAD_L - 10} y={tick.y + 4} textAnchor="end" fontSize="10" fontWeight="600" fill="var(--text-muted)">
                      {fmtShort(tick.val)}
                    </text>
                  </g>
                ))}

                {/* Hover guide background column */}
                {tooltip && (
                  (() => {
                    const barIdx = hoursList.indexOf(tooltip.hour);
                    if (barIdx === -1) return null;
                    const totalBarWidth = (innerW / hoursList.length);
                    const xPos = PAD_L + barIdx * totalBarWidth;
                    return (
                      <rect
                        x={xPos}
                        y={PAD_T}
                        width={totalBarWidth}
                        height={innerH}
                        fill="rgba(61, 28, 2, 0.05)"
                        rx={4}
                        pointerEvents="none"
                      />
                    );
                  })()
                )}

                {/* Bars Rendering */}
                {hoursList.map((h, barIdx) => {
                  const hrMap = hourlyDataMap[h] || {};
                  const xPos = PAD_L + (barIdx / hoursList.length) * innerW;
                  const totalBarWidth = (innerW / hoursList.length);
                  const barWidth = totalBarWidth * 0.65;
                  const barOffset = (totalBarWidth - barWidth) / 2;

                  let currentHeightSum = 0;
                  
                  return (
                    <g key={h} className="hover-bretone">
                      {uniqueWaiters.map(waiter => {
                        const amount = hrMap[waiter] || 0;
                        if (amount === 0) return null;

                        const rectHeight = (amount / maxHourlyTotal) * innerH;
                        const yPos = PAD_T + innerH - currentHeightSum - rectHeight;
                        currentHeightSum += rectHeight;

                        return (
                          <rect
                            key={waiter}
                            x={xPos + barOffset}
                            y={yPos}
                            width={barWidth}
                            height={rectHeight}
                            fill={getColorForWaiter(waiter)}
                            rx={2}
                            style={{ transition: 'all 0.3s ease' }}
                          />
                        );
                      })}
                      
                      {/* X-axis labels */}
                      <text
                        x={xPos + totalBarWidth / 2}
                        y={PAD_T + innerH + 18}
                        textAnchor="middle"
                        fontSize="9"
                        fontWeight="700"
                        fill="var(--text-muted)"
                      >
                        {String(h).padStart(2, '0')}h
                      </text>
                    </g>
                  );
                })}

                {/* Transparent tracker columns overlay for mouse interactions */}
                {hoursList.map((h, barIdx) => {
                  const xPos = PAD_L + (barIdx / hoursList.length) * innerW;
                  const totalBarWidth = (innerW / hoursList.length);
                  return (
                    <rect
                      key={`tracker-${h}`}
                      x={xPos}
                      y={PAD_T}
                      width={totalBarWidth}
                      height={innerH}
                      fill="transparent"
                      cursor="pointer"
                      onMouseMove={(e) => handleMouseMove(h, e)}
                      onMouseLeave={handleMouseLeave}
                    />
                  );
                })}
              </svg>

              {/* Legends */}
              <div className={styles.legendContainer}>
                {uniqueWaiters.map(waiter => (
                  <div key={waiter} className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ backgroundColor: getColorForWaiter(waiter) }} />
                    <span>{waiter}</span>
                  </div>
                ))}
              </div>
            </>
          ) : (
            // TAB 2: Horizontal Bar Chart representing Waiter Totals (Rectangles)
            <>
              <svg viewBox={`0 0 ${SVG_W} ${rectChartH}`} className={styles.chartSvg} style={{ minHeight: '320px', height: `${rectChartH}px` }}>
                {/* Vertical Gridlines */}
                {xTicks.map((tick, i) => (
                  <g key={i}>
                    <line x1={tick.x} y1={PAD_T} x2={tick.x} y2={rectChartH - PAD_B} stroke="rgba(61, 28, 2, 0.08)" strokeWidth="1" />
                    <text x={tick.x} y={rectChartH - PAD_B + 16} textAnchor="middle" fontSize="10" fontWeight="600" fill="var(--text-muted)">
                      {fmtShort(tick.val)}
                    </text>
                  </g>
                ))}

                {/* Rows Rendering */}
                {sortedWaitersBySales.map((waiterItem, idx) => {
                  const yPos = PAD_T + idx * 40;
                  const barWidth = (waiterItem.total / maxWaiterSales) * (SVG_W - RECT_PAD_L - RECT_PAD_R);
                  
                  return (
                    <g key={waiterItem.name} className="hover-bretone">
                      {/* Name Label */}
                      <text
                        x={RECT_PAD_L - 12}
                        y={yPos + 18}
                        textAnchor="end"
                        fontSize="11"
                        fontWeight="700"
                        fill="var(--text)"
                      >
                        {waiterItem.name}
                      </text>

                      {/* Bar (Rectangle) */}
                      <rect
                        x={RECT_PAD_L}
                        y={yPos + 4}
                        width={barWidth}
                        height={20}
                        fill={getColorForWaiter(waiterItem.name)}
                        rx={4}
                        cursor="pointer"
                        onMouseMove={(e) => handleWaiterMouseMove(waiterItem, e)}
                        onMouseLeave={handleWaiterMouseLeave}
                        style={{ transition: 'opacity 0.2s', ':hover': { opacity: 0.85 } } as any}
                      />

                      {/* Right Detail Label */}
                      <text
                        x={RECT_PAD_L + barWidth + 10}
                        y={yPos + 18}
                        textAnchor="start"
                        fontSize="10"
                        fontWeight="700"
                        fill="var(--text)"
                      >
                        {fmt(waiterItem.total)} ({waiterItem.share.toFixed(1)}%)
                      </text>
                    </g>
                  );
                })}
              </svg>

              {/* Legends */}
              <div className={styles.legendContainer}>
                {uniqueWaiters.map(waiter => (
                  <div key={waiter} className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ backgroundColor: getColorForWaiter(waiter) }} />
                    <span>{waiter}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Floating Tooltip Component - Hourly Stacked */}
        {activeChartTab === 'hora' && tooltip && (
          <div
            className={styles.tooltip}
            style={{
              left: `${tooltip.x}px`,
              top: `${tooltip.y}px`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className={styles.tooltipHeader}>
              <span>Hora: {String(tooltip.hour).padStart(2, '0')}:00</span>
            </div>
            {(() => {
              const hrMap = hourlyDataMap[tooltip.hour] || {};
              const items = uniqueWaiters
                .map(waiter => ({ waiter, amount: hrMap[waiter] || 0 }))
                .filter(item => item.amount > 0);
              const hrTotal = items.reduce((sum, item) => sum + item.amount, 0);

              return (
                <>
                  {items.length === 0 ? (
                     <div style={{ color: 'rgba(255,255,255,0.6)' }}>Sin ventas</div>
                  ) : (
                    items.map(item => (
                      <div key={item.waiter} className={styles.tooltipRow}>
                        <span style={{ display: 'flex', alignItems: 'center' }}>
                          <span
                            className={styles.tooltipColorChip}
                            style={{ backgroundColor: getColorForWaiter(item.waiter) }}
                          />
                          {item.waiter}
                        </span>
                        <span>{fmt(item.amount)}</span>
                      </div>
                    ))
                  )}
                  <div className={styles.tooltipTotal}>
                    <span>Total Hora</span>
                    <span>{fmt(hrTotal)}</span>
                  </div>
                </>
              );
            })()}
          </div>
        )}

        {/* Floating Tooltip Component - Waiters Totals */}
        {activeChartTab === 'rectangulos' && waiterTooltip && (
          <div
            className={styles.tooltip}
            style={{
              left: `${waiterTooltip.x}px`,
              top: `${waiterTooltip.y}px`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className={styles.tooltipHeader}>
              <span>Mesero: {waiterTooltip.waiter}</span>
            </div>
            <div className={styles.tooltipRow}>
              <span>Venta Total</span>
              <span>{fmt(waiterTooltip.total)}</span>
            </div>
            <div className={styles.tooltipRow}>
              <span>Participación</span>
              <span>{waiterTooltip.share.toFixed(1)}%</span>
            </div>
            <div className={styles.tooltipRow}>
              <span>Venta Prom. por Hora</span>
              <span>{fmt(waiterTooltip.avgHourly)}</span>
            </div>
          </div>
        )}
      </div>

      {/* ====== DATA TABLE CARD ====== */}
      <div className={styles.tableCard}>
        <div className={styles.tableTitleBlock}>
          <h3>Detalle de Ventas por Mesero</h3>
          <p>Tabla dinámica cruzando ventas de meseros por horas de facturación</p>
        </div>

        {loading ? (
          <div className={styles.chartLoading}>
            <div className={styles.spinner} />
            <span>Generando tabla pivote...</span>
          </div>
        ) : data.length === 0 ? (
          <div className={styles.chartEmpty}>Sin información en la tabla de datos</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ minWidth: '80px' }}>Hora</th>
                  {uniqueWaiters.map(waiter => (
                    <th key={waiter}>{waiter}</th>
                  ))}
                  <th>Total Hora</th>
                </tr>
              </thead>
              <tbody>
                {hoursList
                  .map(h => {
                    const hrMap = hourlyDataMap[h] || {};
                    const hourTotal = Object.values(hrMap).reduce((a, b) => a + b, 0);

                    // Skip empty rows in the table to keep it compact
                    if (hourTotal === 0) return null;

                    return (
                      <tr key={h}>
                        <td className={styles.hourCol}>{String(h).padStart(2, '0')}:00</td>
                        {uniqueWaiters.map(waiter => {
                          const val = hrMap[waiter] || 0;
                          return (
                            <td key={waiter} style={{ color: val > 0 ? 'var(--text)' : 'rgba(61, 28, 2, 0.25)' }}>
                              {val > 0 ? fmt(val) : '—'}
                            </td>
                          );
                        })}
                        <td style={{ fontWeight: 800, color: 'var(--text)' }}>{fmt(hourTotal)}</td>
                      </tr>
                    );
                  })
                  .filter(Boolean)}
                
                {/* Total Row */}
                <tr className={styles.totalRow}>
                  <td>TOTALES</td>
                  {uniqueWaiters.map(waiter => (
                    <td key={waiter}>{fmt(waiterTotalsMap[waiter] || 0)}</td>
                  ))}
                  <td>{fmt(totalSales)}</td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}


'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock,
  Calendar,
  DollarSign,
  ReceiptText,
  TrendingUp,
  Download,
  Layers,
  Filter,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import styles from './categoria-hora-real.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────
type Period = 'today' | 'yesterday' | 'week' | 'month';

interface SaleRow {
  Total: number;
  Categoria: string;
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

// Compute date ranges for presets (same as global categories)
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

// Brand Colors mapping for La Petite Bretonne
const CATEGORY_COLORS: Record<string, string> = {
  'Crepas Dulces': '#E3A21C',       // Honey Gold
  'Crepas Saladas': '#149D92',      // Teal
  'Bebidas Calientes': '#D17A4E',   // Terracotta
  'Bebidas Frías': '#D94C3D',       // Coral Red
  'Postres': '#3D1C02',             // Espresso
  'Ensaladas': '#2E6F40',           // Sage Green
  'Entradas': '#7A4520',            // Cocoa Brown
  'Paquetes': '#F29C38',            // Amber
};

const getColorForCategory = (catName: string) => {
  if (CATEGORY_COLORS[catName]) return CATEGORY_COLORS[catName];
  // Stable fallback color generation
  const fallbacks = ['#829A86', '#5E4028', '#F2C044', '#7A4520', '#C2662F', '#0E9488', '#B4690E', '#D6402C'];
  let hash = 0;
  for (let i = 0; i < catName.length; i++) {
    hash = catName.charCodeAt(i) + ((hash << 5) - hash);
  }
  const idx = Math.abs(hash) % fallbacks.length;
  return fallbacks[idx];
};

export default function SalesByCategoryHourRealReport() {
  const [dateFrom, setDateFrom] = useState(() => datesForPeriod('week')[0]); // Default to last 7 days like global categories
  const [dateTo, setDateTo] = useState(() => datesForPeriod('week')[1]);
  const [data, setData] = useState<SaleRow[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  // Tooltip tracking state
  const [tooltip, setTooltip] = useState<{
    hour: number;
    x: number;
    y: number;
  } | null>(null);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch report data for the date range
  const fetchReport = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ dateFrom: from, dateTo: to });
      // Fetching from hourly-real API endpoint
      const res = await fetch(`/api/dashboard/sales/categoria-hora-real?${params}`);
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
  const uniqueCategories = useMemo(() => {
    const cats = new Set<string>();
    data.forEach(row => {
      if (row.Categoria) cats.add(row.Categoria);
    });
    return Array.from(cats).sort();
  }, [data]);

  const totalSales = useMemo(() => {
    return data.reduce((acc, row) => acc + Number(row.Total), 0);
  }, [data]);

  const categoryTotalsMap = useMemo(() => {
    const map: Record<string, number> = {};
    data.forEach(row => {
      map[row.Categoria] = (map[row.Categoria] || 0) + Number(row.Total);
    });
    return map;
  }, [data]);

  const bestCategory = useMemo(() => {
    let best = '';
    let maxVal = 0;
    Object.entries(categoryTotalsMap).forEach(([cat, val]) => {
      if (val > maxVal) {
        maxVal = val;
        best = cat;
      }
    });
    return { name: best, total: maxVal };
  }, [categoryTotalsMap]);

  // Grouped hourly data for chart & table
  const hourlyDataMap = useMemo(() => {
    const map: Record<number, Record<string, number>> = {};
    data.forEach(row => {
      const h = Number(row.Hora);
      if (!map[h]) {
        map[h] = {};
      }
      map[h][row.Categoria] = Number(row.Total);
    });
    return map;
  }, [data]);

  const hoursList = useMemo(() => {
    const hours = Object.keys(hourlyDataMap).map(Number);
    if (hours.length === 0) return [];
    
    // Continuous range from min to max hour with sale data
    const minH = Math.min(...hours);
    const maxH = Math.max(...hours);
    const range = [];
    const startHour = Math.max(0, Math.min(9, minH - 1));
    const endHour = Math.min(23, Math.max(21, maxH + 1));
    
    for (let h = startHour; h <= endHour; h++) {
      range.push(h);
    }
    return range;
  }, [hourlyDataMap]);

  const peakHour = useMemo(() => {
    let peakH = -1;
    let maxVal = 0;
    
    Object.entries(hourlyDataMap).forEach(([hourStr, categoryAmounts]) => {
      const hrTotal = Object.values(categoryAmounts).reduce((a, b) => a + b, 0);
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

  // Render SVG Stacked Bar dimensions
  const SVG_W = 800;
  const SVG_H = 320;
  const PAD_T = 20;
  const PAD_R = 25;
  const PAD_B = 40;
  const PAD_L = 65;
  const innerW = SVG_W - PAD_L - PAD_R;
  const innerH = SVG_H - PAD_T - PAD_B;

  // Grid ticks
  const yTicks = useMemo(() => {
    return [0, 0.25, 0.5, 0.75, 1].map(r => ({
      val: maxHourlyTotal * r,
      y: PAD_T + innerH - r * innerH
    }));
  }, [maxHourlyTotal, innerH]);

  // Dynamic Tooltip Position Helpers
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
        
        uniqueCategories.forEach(cat => {
          excelRow[cat] = hrMap[cat] || 0;
        });
        
        excelRow['Total Hora ($)'] = hourTotal;
        return excelRow;
      })
      .filter(row => row['Total Hora ($)'] > 0);

    // Append totals row
    const totalsRow: Record<string, any> = {
      'Hora': 'TOTALES',
    };
    uniqueCategories.forEach(cat => {
      totalsRow[cat] = categoryTotalsMap[cat] || 0;
    });
    totalsRow['Total Hora ($)'] = totalSales;
    rows.push(totalsRow);

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventas Categoria-Hora Real');
    XLSX.writeFile(workbook, `Ventas_Categoria_Hora_Real_${dateFrom}_a_${dateTo}.xlsx`);
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
          <Clock size={34} style={{ color: 'var(--bretone-gold)' }} />
          <div>
            <h1>Ventas por Categoría y Hora Real</h1>
            <p className={styles.subtitle}>Análisis del facturado agrupado por la hora de creación real de la orden</p>
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
            <span className={styles.kpiLabel}>Total Facturado (Real)</span>
            <span className={styles.kpiValue}>{loading ? '—' : fmt(totalSales)}</span>
            <span className={styles.kpiSub}>{activeLabel}</span>
          </div>
        </div>

        <div className={`${styles.kpiCard} kpi-glow-yellow`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(227, 162, 28, 0.08)', color: '#E3A21C' }}>
            <TrendingUp size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Categoría Estrella</span>
            <span className={styles.kpiValue} title={bestCategory.name}>
              {loading ? '—' : bestCategory.name || 'Ninguna'}
            </span>
            <span className={styles.kpiSub}>
              {bestCategory.total > 0 ? `Venta: ${fmt(bestCategory.total)}` : 'Sin ventas'}
            </span>
          </div>
        </div>

        <div className={`${styles.kpiCard} kpi-glow-red`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(214, 64, 44, 0.08)', color: '#D6402C' }}>
            <Clock size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Hora Pico Real</span>
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
            <span className={styles.kpiLabel}>Categorías Activas</span>
            <span className={styles.kpiValue}>{loading ? '—' : uniqueCategories.length}</span>
            <span className={styles.kpiSub}>Grupos con facturación</span>
          </div>
        </div>
      </div>

      {/* ====== CHART SECTION ====== */}
      <div className={styles.chartCard} style={{ position: 'relative' }}>
        <div className={styles.chartHeader}>
          <div>
            <h3>Distribución por Hora Real</h3>
            <p>Ventas acumuladas basadas en la hora del registro del ticket (Fecha)</p>
          </div>
        </div>

        <div className={styles.chartWrapper}>
          {loading ? (
            <div className={styles.chartLoading}>
              <div className={styles.spinner} />
              <span>Analizando distribución horaria real...</span>
            </div>
          ) : data.length === 0 ? (
            <div className={styles.chartEmpty}>No se registraron ventas en este período</div>
          ) : (
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
                      {uniqueCategories.map(cat => {
                        const amount = hrMap[cat] || 0;
                        if (amount === 0) return null;

                        const rectHeight = (amount / maxHourlyTotal) * innerH;
                        const yPos = PAD_T + innerH - currentHeightSum - rectHeight;
                        currentHeightSum += rectHeight;

                        return (
                          <rect
                            key={cat}
                            x={xPos + barOffset}
                            y={yPos}
                            width={barWidth}
                            height={rectHeight}
                            fill={getColorForCategory(cat)}
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
                {uniqueCategories.map(cat => (
                  <div key={cat} className={styles.legendItem}>
                    <div className={styles.legendColor} style={{ backgroundColor: getColorForCategory(cat)} } />
                    <span>{cat}</span>
                  </div>
                ))}
              </div>
            </>
          )}
        </div>

        {/* Floating Tooltip Component */}
        {tooltip && (
          <div
            className={styles.tooltip}
            style={{
              left: `${tooltip.x}px`,
              top: `${tooltip.y}px`,
              transform: 'translate(-50%, -100%)',
            }}
          >
            <div className={styles.tooltipHeader}>
              <span>Hora Real: {String(tooltip.hour).padStart(2, '0')}:00</span>
            </div>
            {(() => {
              const hrMap = hourlyDataMap[tooltip.hour] || {};
              const items = uniqueCategories
                .map(cat => ({ cat, amount: hrMap[cat] || 0 }))
                .filter(item => item.amount > 0);
              const hrTotal = items.reduce((sum, item) => sum + item.amount, 0);

              return (
                <>
                  {items.length === 0 ? (
                    <div style={{ color: 'rgba(255,255,255,0.6)' }}>Sin ventas</div>
                  ) : (
                    items.map(item => (
                      <div key={item.cat} className={styles.tooltipRow}>
                        <span style={{ display: 'flex', alignItems: 'center' }}>
                          <span
                            className={styles.tooltipColorChip}
                            style={{ backgroundColor: getColorForCategory(item.cat) }}
                          />
                          {item.cat}
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
      </div>

      {/* ====== DATA TABLE CARD ====== */}
      <div className={styles.tableCard}>
        <div className={styles.tableTitleBlock}>
          <h3>Detalle Comercial de Ventas (Hora Real)</h3>
          <p>Tabla dinámica cruzando categorías y horas de facturación real</p>
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
                  {uniqueCategories.map(cat => (
                    <th key={cat}>{cat}</th>
                  ))}
                  <th>Total Hora</th>
                </tr>
              </thead>
              <tbody>
                {hoursList
                  .map(h => {
                    const hrMap = hourlyDataMap[h] || {};
                    const hourTotal = Object.values(hrMap).reduce((a, b) => a + b, 0);

                    if (hourTotal === 0) return null;

                    return (
                      <tr key={h}>
                        <td className={styles.hourCol}>{String(h).padStart(2, '0')}:00</td>
                        {uniqueCategories.map(cat => {
                          const val = hrMap[cat] || 0;
                          return (
                            <td key={cat} style={{ color: val > 0 ? 'var(--text)' : 'rgba(61, 28, 2, 0.25)' }}>
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
                  {uniqueCategories.map(cat => (
                    <td key={cat}>{fmt(categoryTotalsMap[cat] || 0)}</td>
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

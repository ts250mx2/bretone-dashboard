'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock,
  Calendar,
  DollarSign,
  ReceiptText,
  TrendingUp,
  Download,
  AlertTriangle,
  CheckCircle,
  Sparkles,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import styles from './comparativa.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────
type Period = 'today' | 'yesterday' | 'week' | 'month';

interface CombinedRow {
  hora: number;
  totalStandard: number;
  totalReal: number;
  diferencia: number;
  pctDiferencia: number;
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

export default function HourlyComparisonReport() {
  const [dateFrom, setDateFrom] = useState(() => datesForPeriod('week')[0]); // Default to last 7 days like global categories
  const [dateTo, setDateTo] = useState(() => datesForPeriod('week')[1]);
  const [data, setData] = useState<CombinedRow[]>([]);
  const [timeByCategory, setTimeByCategory] = useState<any[]>([]);
  const [timeByProduct, setTimeByProduct] = useState<any[]>([]);
  const [activeTimeTab, setActiveTimeTab] = useState<'category' | 'product'>('category');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  // AI summary states
  const [aiSummary, setAiSummary] = useState<string>('');
  const [aiLoading, setAiLoading] = useState<boolean>(false);
  const [aiError, setAiError] = useState<string>('');
  const [showAiModal, setShowAiModal] = useState<boolean>(false);

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
      const res = await fetch(`/api/dashboard/sales/comparativa-horas?${params}`);
      if (!res.ok) throw new Error('Error al cargar datos de la comparación');
      const json = await res.json();
      
      setData(json.data || []);
      setTimeByCategory(json.timeByCategory || []);
      setTimeByProduct(json.timeByProduct || []);
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

  // Map data by hour for rapid index access
  const hourlyDataMap = useMemo(() => {
    const map: Record<number, CombinedRow> = {};
    data.forEach(row => {
      map[row.hora] = row;
    });
    return map;
  }, [data]);

  // Continuous range of hours to show
  const hoursList = useMemo(() => {
    if (data.length === 0) return [];
    const hours = data.map(d => d.hora);
    const minH = Math.min(...hours);
    const maxH = Math.max(...hours);
    const range = [];
    const startHour = Math.max(0, Math.min(9, minH - 1));
    const endHour = Math.min(23, Math.max(21, maxH + 1));
    
    for (let h = startHour; h <= endHour; h++) {
      range.push(h);
    }
    return range;
  }, [data]);

  // Computations
  const totalStandard = useMemo(() => {
    return data.reduce((acc, row) => acc + Number(row.totalStandard), 0);
  }, [data]);

  const totalReal = useMemo(() => {
    return data.reduce((acc, row) => acc + Number(row.totalReal), 0);
  }, [data]);

  const peakDiscrepancyHour = useMemo(() => {
    let peakH = -1;
    let maxAbsDiff = 0;
    let rawDiff = 0;
    
    data.forEach(row => {
      const absDiff = Math.abs(row.diferencia);
      if (absDiff > maxAbsDiff) {
        maxAbsDiff = absDiff;
        rawDiff = row.diferencia;
        peakH = row.hora;
      }
    });
    return { hour: peakH, value: rawDiff, absValue: maxAbsDiff };
  }, [data]);

  // Operational Alignment Index (Sum of Absolute Deltas divided by Total Volume)
  const alignmentIndex = useMemo(() => {
    const sumAbsDelta = data.reduce((sum, row) => sum + Math.abs(row.diferencia), 0);
    const totalVolume = data.reduce((sum, row) => sum + row.totalReal, 0);
    if (totalVolume === 0) return 100;
    return Math.max(0, 100 - (sumAbsDelta / totalVolume) * 100);
  }, [data]);

  const maxHourValue = useMemo(() => {
    let max = 0;
    data.forEach(row => {
      const val = Math.max(row.totalStandard, row.totalReal);
      if (val > max) max = val;
    });
    return max > 0 ? max : 1;
  }, [data]);

  // SVG dimensions
  const SVG_W = 800;
  const SVG_H = 320;
  const PAD_T = 20;
  const PAD_R = 25;
  const PAD_B = 40;
  const PAD_L = 65;
  const innerW = SVG_W - PAD_L - PAD_R;
  const innerH = SVG_H - PAD_T - PAD_B;

  // Scaling helpers
  const getX = (index: number) => {
    if (hoursList.length <= 1) return PAD_L + innerW / 2;
    return PAD_L + (index / (hoursList.length - 1)) * innerW;
  };
  const getY = (val: number) => {
    return PAD_T + innerH - (val / maxHourValue) * innerH;
  };

  // Generate gridlines
  const yTicks = useMemo(() => {
    return [0, 0.25, 0.5, 0.75, 1].map(r => ({
      val: maxHourValue * r,
      y: PAD_T + innerH - r * innerH
    }));
  }, [maxHourValue, innerH]);

  // SVG lines points
  const pointsStandard = useMemo(() => {
    return hoursList.map((h, i) => {
      const val = hourlyDataMap[h]?.totalStandard || 0;
      return `${getX(i)},${getY(val)}`;
    }).join(' ');
  }, [hoursList, hourlyDataMap]);

  const pointsReal = useMemo(() => {
    return hoursList.map((h, i) => {
      const val = hourlyDataMap[h]?.totalReal || 0;
      return `${getX(i)},${getY(val)}`;
    }).join(' ');
  }, [hoursList, hourlyDataMap]);

  // Hover tracking
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

    const rows = hoursList.map(h => {
      const row = hourlyDataMap[h] || { totalStandard: 0, totalReal: 0, diferencia: 0, pctDiferencia: 0 };
      return {
        'Hora': `${String(h).padStart(2, '0')}:00`,
        'Venta Standard ($)': row.totalStandard,
        'Venta Real ($)': row.totalReal,
        'Diferencia ($)': row.diferencia,
        'Desviación (%)': row.pctDiferencia.toFixed(1) + '%',
      };
    });

    // Append totals row
    rows.push({
      'Hora': 'TOTALES',
      'Venta Standard ($)': totalStandard,
      'Venta Real ($)': totalReal,
      'Diferencia ($)': totalStandard - totalReal,
      'Desviación (%)': totalReal > 0 ? ((totalStandard - totalReal) / totalReal * 100).toFixed(1) + '%' : '0%',
    });

    const worksheet = XLSX.utils.json_to_sheet(rows);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Comparativa Horas');
    XLSX.writeFile(workbook, `Comparativa_Ventas_Horas_${dateFrom}_a_${dateTo}.xlsx`);
  };

  // Generate AI Summary analysis
  const handleAiSummary = async () => {
    setAiLoading(true);
    setAiError('');
    setShowAiModal(true);
    
    try {
      const res = await fetch('/api/dashboard/sales/comparativa-horas/summary', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          dateFrom,
          dateTo,
          totalStandard,
          totalReal,
          alignmentIndex,
          timeByCategory,
          timeByProduct
        })
      });

      if (!res.ok) {
        const errJson = await res.json();
        throw new Error(errJson.error || errJson.message || 'Error al generar el resumen');
      }

      const json = await res.json();
      setAiSummary(json.summary || 'No se recibió un resumen.');
    } catch (e: any) {
      console.error('Error invoking AI summary:', e);
      setAiError(e.message || 'Ocurrió un error inesperado al contactar a Brioche.');
    } finally {
      setAiLoading(false);
    }
  };

  // Helper to parse simple bold text formatting (**text**)
  const parseInlineStyles = (text: string) => {
    const parts = text.split(/(\*\*.*?\*\*)/g);
    return parts.map((part, i) => {
      if (part.startsWith('**') && part.endsWith('**')) {
        return <strong key={i} className={styles.markdownStrong}>{part.slice(2, -2)}</strong>;
      }
      return part;
    });
  };

  // Helper to parse simple Markdown blocks (headings, paragraphs, bullet lists)
  const parseMarkdown = (text: string) => {
    if (!text) return null;
    const lines = text.split('\n');
    return lines.map((line, idx) => {
      const trimmed = line.trim();
      if (!trimmed) return <div key={idx} className={styles.emptyLine} />;

      if (trimmed.startsWith('###')) {
        const content = trimmed.replace(/^###\s+/, '');
        return <h4 key={idx} className={styles.markdownH4}>{parseInlineStyles(content)}</h4>;
      }
      
      if (trimmed.startsWith('##')) {
        const content = trimmed.replace(/^##\s+/, '');
        return <h3 key={idx} className={styles.markdownH3}>{parseInlineStyles(content)}</h3>;
      }

      if (trimmed.startsWith('-')) {
        const content = trimmed.replace(/^-\s+/, '');
        return (
          <ul key={idx} className={styles.markdownList}>
            <li>{parseInlineStyles(content)}</li>
          </ul>
        );
      }

      return <p key={idx} className={styles.markdownP}>{parseInlineStyles(trimmed)}</p>;
    });
  };

  if (!mounted) {
    return <div className={styles.container} style={{ opacity: 0 }}>Cargando comparador...</div>;
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
          <Clock size={34} style={{ color: 'var(--bretone-teal)' }} />
          <div>
            <h1>Comparación de Horas</h1>
            <p className={styles.subtitle}>Auditoría de desfasamiento temporal entre la hora administrativa y la hora real de órdenes</p>
          </div>
        </div>

        <div className={styles.actionsGroup}>
          <button
            onClick={handleAiSummary}
            className={styles.aiBtn}
            disabled={loading || data.length === 0}
            style={{ marginRight: '0.5rem', opacity: (loading || data.length === 0) ? 0.6 : 1 }}
          >
            <Sparkles size={15} /> Resumen IA
          </button>
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
            <span className={styles.kpiLabel}>Total Standard (Cierre)</span>
            <span className={styles.kpiValue}>{loading ? '—' : fmt(totalStandard)}</span>
            <span className={styles.kpiSub}>{activeLabel}</span>
          </div>
        </div>

        <div className={`${styles.kpiCard} kpi-glow-yellow`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(227, 162, 28, 0.08)', color: '#E3A21C' }}>
            <DollarSign size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Total Real (Cocina)</span>
            <span className={styles.kpiValue}>{loading ? '—' : fmt(totalReal)}</span>
            <span className={styles.kpiSub}>Monto físico acumulado</span>
          </div>
        </div>

        <div className={`${styles.kpiCard} kpi-glow-red`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(214, 64, 44, 0.08)', color: '#D6402C' }}>
            <AlertTriangle size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Pico de Desfase</span>
            <span className={styles.kpiValue}>
              {loading ? '—' : peakDiscrepancyHour.hour !== -1 ? `${String(peakDiscrepancyHour.hour).padStart(2, '0')}:00` : '—'}
            </span>
            <span className={styles.kpiSub}>
              {peakDiscrepancyHour.absValue > 0 ? `Diferencia de ${fmt(peakDiscrepancyHour.value)}` : 'Sin variaciones'}
            </span>
          </div>
        </div>

        <div className={`${styles.kpiCard} kpi-glow-green`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(20, 157, 146, 0.08)', color: '#149D92' }}>
            <CheckCircle size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Coincidencia Operativa</span>
            <span className={styles.kpiValue}>
              {loading ? '—' : `${alignmentIndex.toFixed(1)}%`}
            </span>
            <span className={styles.kpiSub}>Nivel de desfase en curvas</span>
          </div>
        </div>
      </div>

      {/* ====== COMPARATIVE CHART SECTION ====== */}
      <div className={styles.chartCard} style={{ position: 'relative' }}>
        <div className={styles.chartHeader}>
          <div>
            <h3>Evolución de Curvas Administrativa vs Real</h3>
            <p>Monitoreo visual del volumen registrado en sistema (Standard) contra la hora real en cocina (Real)</p>
          </div>
        </div>

        <div className={styles.chartWrapper}>
          {loading ? (
            <div className={styles.chartLoading}>
              <div className={styles.spinner} />
              <span>Cruzando cronogramas comerciales...</span>
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

                {/* Vertical hover guide */}
                {tooltip && (
                  (() => {
                    const barIdx = hoursList.indexOf(tooltip.hour);
                    if (barIdx === -1) return null;
                    const xPos = getX(barIdx);
                    return (
                      <line
                        x1={xPos}
                        y1={PAD_T}
                        x2={xPos}
                        y2={PAD_T + innerH}
                        stroke="rgba(61, 28, 2, 0.18)"
                        strokeDasharray="4 3"
                        strokeWidth="1.5"
                        pointerEvents="none"
                      />
                    );
                  })()
                )}

                {/* Points & Lines rendering */}
                {hoursList.length > 1 && (
                  <>
                    {/* Line 1: Standard (Espresso) */}
                    <polyline
                      points={pointsStandard}
                      fill="none"
                      stroke="#3D1C02"
                      strokeWidth="2.8"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />

                    {/* Line 2: Real (Honey Gold) */}
                    <polyline
                      points={pointsReal}
                      fill="none"
                      stroke="#E3A21C"
                      strokeWidth="2.8"
                      strokeLinejoin="round"
                      strokeLinecap="round"
                    />
                  </>
                )}

                {/* Dots for Standard series */}
                {hoursList.map((h, i) => {
                  const val = hourlyDataMap[h]?.totalStandard || 0;
                  return (
                    <circle
                      key={`dot-std-${h}`}
                      cx={getX(i)}
                      cy={getY(val)}
                      r="4.5"
                      fill="#3D1C02"
                      stroke="#ffffff"
                      strokeWidth="1.8"
                      pointerEvents="none"
                    />
                  );
                })}

                {/* Dots for Real series */}
                {hoursList.map((h, i) => {
                  const val = hourlyDataMap[h]?.totalReal || 0;
                  return (
                    <circle
                      key={`dot-real-${h}`}
                      cx={getX(i)}
                      cy={getY(val)}
                      r="4.5"
                      fill="#E3A21C"
                      stroke="#ffffff"
                      strokeWidth="1.8"
                      pointerEvents="none"
                    />
                  );
                })}

                {/* X-Axis labels */}
                {hoursList.map((h, i) => (
                  <text
                    key={`lbl-x-${h}`}
                    x={getX(i)}
                    y={PAD_T + innerH + 18}
                    textAnchor="middle"
                    fontSize="9"
                    fontWeight="700"
                    fill="var(--text-muted)"
                  >
                    {String(h).padStart(2, '0')}h
                  </text>
                ))}

                {/* Invisible hover guides */}
                {hoursList.map((h, i) => {
                  const xPos = getX(i);
                  const step = innerW / Math.max(hoursList.length - 1, 1);
                  return (
                    <rect
                      key={`col-track-${h}`}
                      x={xPos - step / 2}
                      y={PAD_T}
                      width={step}
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
                <div className={styles.legendItem}>
                  <div className={styles.legendColor} style={{ backgroundColor: '#3D1C02' }} />
                  <span>Venta Cierre (Standard / FechaVenta)</span>
                </div>
                <div className={styles.legendItem}>
                  <div className={styles.legendColor} style={{ backgroundColor: '#E3A21C' }} />
                  <span>Venta Cocina (Real / Fecha)</span>
                </div>
              </div>
            </>
          )}
        </div>

        {/* Floating Tooltip */}
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
              <span>Hora: {String(tooltip.hour).padStart(2, '0')}:00</span>
            </div>
            {(() => {
              const row = hourlyDataMap[tooltip.hour] || { totalStandard: 0, totalReal: 0, diferencia: 0, pctDiferencia: 0 };
              return (
                <>
                  <div className={styles.tooltipRow}>
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                      <span className={styles.tooltipColorChip} style={{ backgroundColor: '#3D1C02' }} />
                      Standard:
                    </span>
                    <span style={{ fontWeight: 700 }}>{fmt(row.totalStandard)}</span>
                  </div>
                  <div className={styles.tooltipRow}>
                    <span style={{ display: 'flex', alignItems: 'center' }}>
                      <span className={styles.tooltipColorChip} style={{ backgroundColor: '#E3A21C' }} />
                      Real (Cocina):
                    </span>
                    <span style={{ fontWeight: 700 }}>{fmt(row.totalReal)}</span>
                  </div>
                  <div className={styles.tooltipTotal}>
                    <span>Diferencia</span>
                    <span style={{ color: row.diferencia > 0 ? 'var(--bretone-terracotta)' : row.diferencia < 0 ? '#149D92' : '#ffffff' }}>
                      {fmt(row.diferencia)} ({row.pctDiferencia > 0 ? '+' : ''}{row.pctDiferencia.toFixed(1)}%)
                    </span>
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
          <h3>Tabla de Desviaciones Horarias (Delta)</h3>
          <p>Comparativa numérica y porcentual para auditar el desfase de facturación</p>
        </div>

        {loading ? (
          <div className={styles.chartLoading}>
            <div className={styles.spinner} />
            <span>Calculando deltas operativos...</span>
          </div>
        ) : data.length === 0 ? (
          <div className={styles.chartEmpty}>Sin información en la tabla de datos</div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Hora</th>
                  <th>Monto Standard (Cierre)</th>
                  <th>Monto Real (Cocina)</th>
                  <th>Diferencia ($)</th>
                  <th>Variación (%)</th>
                </tr>
              </thead>
              <tbody>
                {hoursList.map(h => {
                  const row = hourlyDataMap[h];
                  if (!row) return null;

                  // Styling classification
                  let cellClass = styles.neutralDelta;
                  if (row.diferencia > 0) cellClass = styles.positiveDelta;
                  if (row.diferencia < 0) cellClass = styles.negativeDelta;

                  return (
                    <tr key={h}>
                      <td className={styles.hourCol}>{String(h).padStart(2, '0')}:00</td>
                      <td>{fmt(row.totalStandard)}</td>
                      <td>{fmt(row.totalReal)}</td>
                      <td className={cellClass} style={{ fontWeight: 800 }}>
                        {row.diferencia > 0 ? '+' : ''}{fmt(row.diferencia)}
                      </td>
                      <td className={cellClass} style={{ fontWeight: 800 }}>
                        {row.pctDiferencia > 0 ? '+' : ''}{row.pctDiferencia.toFixed(1)}%
                      </td>
                    </tr>
                  );
                })}

                {/* Total Row */}
                <tr className={styles.totalRow}>
                  <td>TOTALES</td>
                  <td>{fmt(totalStandard)}</td>
                  <td>{fmt(totalReal)}</td>
                  <td style={{ fontWeight: 800 }}>
                    {totalStandard - totalReal > 0 ? '+' : ''}{fmt(totalStandard - totalReal)}
                  </td>
                  <td style={{ fontWeight: 800 }}>
                    {totalReal > 0 ? ((totalStandard - totalReal) / totalReal * 100).toFixed(1) + '%' : '0%'}
                  </td>
                </tr>
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ====== AUDITORÍA DE TIEMPOS DE SERVICIO ====== */}
      <div className={styles.timeAuditCard}>
        <div className={styles.timeAuditHeader}>
          <div>
            <h3>Tiempos de Cierre por Categoría y Platillo (Orden → Cobro)</h3>
            <p>Monitoreo del tiempo promedio (en minutos) desde que se registra la comanda hasta que se realiza el cobro final en caja</p>
          </div>
          <div className={styles.tabGroup}>
            <button
              className={`${styles.tabBtn} ${activeTimeTab === 'category' ? styles.tabActive : ''}`}
              onClick={() => setActiveTimeTab('category')}
            >
              Por Categoría
            </button>
            <button
              className={`${styles.tabBtn} ${activeTimeTab === 'product' ? styles.tabActive : ''}`}
              onClick={() => setActiveTimeTab('product')}
            >
              Por Platillo
            </button>
          </div>
        </div>

        {loading ? (
          <div className={styles.chartLoading}>
            <div className={styles.spinner} />
            <span>Analizando tiempos de preparación y cierre...</span>
          </div>
        ) : activeTimeTab === 'category' ? (
          timeByCategory.length === 0 ? (
            <div className={styles.chartEmpty}>No hay registros de tiempo para las categorías en este período</div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>Rank</th>
                    <th>Categoría</th>
                    <th>Cantidad Vendida</th>
                    <th>Tiempo Promedio</th>
                    <th>Indicador Visual</th>
                  </tr>
                </thead>
                <tbody>
                  {timeByCategory.map((c, index) => {
                    const avgTime = Number(c.tiempoPromedio || 0);
                    const qty = Number(c.cantidad || 0);
                    const maxTime = Math.max(...timeByCategory.map(x => Number(x.tiempoPromedio || 0)), 1);
                    const pct = (avgTime / maxTime) * 100;
                    
                    // Delay categorization
                    let delayClass = styles.delayOk;
                    let delayLabel = 'Normal';
                    if (avgTime > 25) {
                      delayClass = styles.delayCritical;
                      delayLabel = 'Crítico';
                    } else if (avgTime > 15) {
                      delayClass = styles.delayWarning;
                      delayLabel = 'Aviso';
                    }

                    return (
                      <tr key={c.nombre}>
                        <td className={styles.rankCol}>#{index + 1}</td>
                        <td style={{ fontWeight: 700 }}>{c.nombre}</td>
                        <td>{qty} uds</td>
                        <td style={{ fontWeight: 800 }}>{avgTime.toFixed(1)} mins</td>
                        <td>
                          <div className={styles.progressContainer}>
                            <div
                              className={`${styles.progressBar} ${delayClass}`}
                              style={{ width: `${pct}%` }}
                            />
                            <span className={styles.progressLabel}>{delayLabel}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        ) : (
          timeByProduct.length === 0 ? (
            <div className={styles.chartEmpty}>No hay registros de tiempo para los platillos en este período</div>
          ) : (
            <div className={styles.tableWrapper}>
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th style={{ width: '60px' }}>Rank</th>
                    <th>Platillo</th>
                    <th>Categoría</th>
                    <th>Cantidad Vendida</th>
                    <th>Tiempo Promedio</th>
                    <th>Indicador Visual</th>
                  </tr>
                </thead>
                <tbody>
                  {timeByProduct.map((p, index) => {
                    const avgTime = Number(p.tiempoPromedio || 0);
                    const qty = Number(p.cantidad || 0);
                    const maxTime = Math.max(...timeByProduct.map(x => Number(x.tiempoPromedio || 0)), 1);
                    const pct = (avgTime / maxTime) * 100;

                    // Delay categorization
                    let delayClass = styles.delayOk;
                    let delayLabel = 'Normal';
                    if (avgTime > 25) {
                      delayClass = styles.delayCritical;
                      delayLabel = 'Crítico';
                    } else if (avgTime > 15) {
                      delayClass = styles.delayWarning;
                      delayLabel = 'Aviso';
                    }

                    return (
                      <tr key={`${p.nombre}-${index}`}>
                        <td className={styles.rankCol}>#{index + 1}</td>
                        <td style={{ fontWeight: 700 }}>{p.nombre}</td>
                        <td style={{ color: 'var(--text-muted)' }}>{p.categoria}</td>
                        <td>{qty} uds</td>
                        <td style={{ fontWeight: 800 }}>{avgTime.toFixed(1)} mins</td>
                        <td>
                          <div className={styles.progressContainer}>
                            <div
                              className={`${styles.progressBar} ${delayClass}`}
                              style={{ width: `${pct}%` }}
                            />
                            <span className={styles.progressLabel}>{delayLabel}</span>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )
        )}
      </div>

      {/* ====== AI SUMMARY MODAL ====== */}
      {showAiModal && (
        <div className={styles.modalOverlay} onClick={() => setShowAiModal(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <Sparkles className={styles.aiSparkleIcon} size={22} />
                <h3>Análisis Inteligente de Curvas de Tiempo (Brioche)</h3>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setShowAiModal(false)}>
                &times;
              </button>
            </div>
            <div className={styles.modalBody}>
              {aiLoading ? (
                <div className={styles.aiLoadingState}>
                  <div className={styles.aiSpinner} />
                  <p>Brioche está analizando las discrepancias de tiempos, cuellos de botella y patrones de servicio...</p>
                </div>
              ) : aiError ? (
                <div className={styles.aiErrorState}>
                  <AlertTriangle size={32} />
                  <p>{aiError}</p>
                  <button onClick={handleAiSummary} className={styles.retryBtn}>Reintentar</button>
                </div>
              ) : (
                <div className={styles.markdownBody}>
                  {parseMarkdown(aiSummary)}
                </div>
              )}
            </div>
            <div className={styles.modalFooter}>
              <button className={styles.closeModalBtn} onClick={() => setShowAiModal(false)}>
                Cerrar Análisis
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

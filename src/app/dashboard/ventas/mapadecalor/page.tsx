'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Flame,
  Calendar,
  DollarSign,
  ReceiptText,
  Clock,
  BarChart3,
  Activity,
  ChevronDown,
} from 'lucide-react';
import styles from './mapadecalor.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────
type Period = 'today' | 'yesterday' | 'week' | 'month';
type Metric = 'monto' | 'transacciones';

const DAYS_ES_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];
const DAYS_ES_SHORT = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
const HOURS = Array.from({ length: 24 }, (_, i) => i);

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

export default function SalesHeatmapReport() {
  const [metric, setMetric] = useState<Metric>('monto');
  const [dateFrom, setDateFrom] = useState(() => datesForPeriod('month')[0]); // Default to last 30 days for better heatmap density
  const [dateTo, setDateTo] = useState(() => datesForPeriod('month')[1]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch heatmap data
  const fetchData = useCallback(async (from: string, to: string) => {
    if (!from || !to) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        groupBy: 'categoria', // required parameter for backend router
        dateFrom: from,
        dateTo: to,
        trendGroup: 'dia',
      });
      const res = await fetch(`/api/dashboard/sales?${params}`);
      if (!res.ok) throw new Error('Error al cargar datos del mapa de calor');
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

  // Detect active preset
  const activePeriod: Period | null = useMemo(() => {
    return (['today', 'yesterday', 'week', 'month'] as Period[]).find(p => {
      const [f, t] = datesForPeriod(p);
      return f === dateFrom && t === dateTo;
    }) ?? null;
  }, [dateFrom, dateTo]);

  // Build a complete 7x24 grid, filling missing hours with zero
  const gridData = useMemo(() => {
    const grid: Record<string, { total: number; transacciones: number }> = {};
    
    // Pre-initialize
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        grid[`${d}-${h}`] = { total: 0, transacciones: 0 };
      }
    }

    // Populate from heatmap
    if (data && data.heatmap) {
      data.heatmap.forEach((cell: any) => {
        grid[`${cell.diaSemana}-${cell.hora}`] = {
          total: Number(cell.total || 0),
          transacciones: Number(cell.transacciones || 0),
        };
      });
    }

    return grid;
  }, [data]);

  // Aggregate totals
  const aggregates = useMemo(() => {
    let totalSales = 0;
    let totalTickets = 0;

    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const cell = gridData[`${d}-${h}`];
        totalSales += cell.total;
        totalTickets += cell.transacciones;
      }
    }

    return { totalSales, totalTickets };
  }, [gridData]);

  // Find max value in grid for color scaling
  const maxVal = useMemo(() => {
    let max = 0;
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const cell = gridData[`${d}-${h}`];
        const val = metric === 'monto' ? cell.total : cell.transacciones;
        if (val > max) max = val;
      }
    }
    return max > 0 ? max : 1;
  }, [gridData, metric]);

  // Peak Hour Info
  const peakHourInfo = useMemo(() => {
    const hourTotals = Array(24).fill(0);
    for (let h = 0; h < 24; h++) {
      for (let d = 0; d < 7; d++) {
        const cell = gridData[`${d}-${h}`];
        hourTotals[h] += metric === 'monto' ? cell.total : cell.transacciones;
      }
    }
    let maxHour = 0;
    let maxVal = 0;
    hourTotals.forEach((val, h) => {
      if (val > maxVal) {
        maxVal = val;
        maxHour = h;
      }
    });
    return { hour: maxHour, value: maxVal };
  }, [gridData, metric]);

  // Peak Day Info
  const peakDayInfo = useMemo(() => {
    const dayTotals = Array(7).fill(0);
    for (let d = 0; d < 7; d++) {
      for (let h = 0; h < 24; h++) {
        const cell = gridData[`${d}-${h}`];
        dayTotals[d] += metric === 'monto' ? cell.total : cell.transacciones;
      }
    }
    let maxDay = 0;
    let maxVal = 0;
    dayTotals.forEach((val, d) => {
      if (val > maxVal) {
        maxVal = val;
        maxDay = d;
      }
    });
    return { day: maxDay, value: maxVal };
  }, [gridData, metric]);

  // Top 5 hours ranked
  const topHoursList = useMemo(() => {
    const list = [];
    for (let h = 0; h < 24; h++) {
      let sum = 0;
      for (let d = 0; d < 7; d++) {
        const cell = gridData[`${d}-${h}`];
        sum += metric === 'monto' ? cell.total : cell.transacciones;
      }
      list.push({ hour: h, value: sum });
    }
    return list.sort((a, b) => b.value - a.value).slice(0, 5);
  }, [gridData, metric]);

  // Top days of the week ranked
  const topDaysList = useMemo(() => {
    const list = [];
    for (let d = 0; d < 7; d++) {
      let sum = 0;
      for (let h = 0; h < 24; h++) {
        const cell = gridData[`${d}-${h}`];
        sum += metric === 'monto' ? cell.total : cell.transacciones;
      }
      list.push({ day: d, name: DAYS_ES_FULL[d], value: sum });
    }
    return list.sort((a, b) => b.value - a.value);
  }, [gridData, metric]);

  if (!mounted) {
    return <div className={styles.container} style={{ opacity: 0 }}>Cargando mapa de calor...</div>;
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
          <Flame size={34} style={{ color: '#D6402C' }} />
          <div>
            <h1>Mapa de Calor de Ventas</h1>
            <p className={styles.subtitle}>Análisis horario y diario de concentración de ventas</p>
          </div>
        </div>

        <div className={styles.actionsGroup}>
          <div className={styles.metricBtns}>
            <button
              className={`${styles.metricBtn} ${metric === 'monto' ? styles.metricActiveEspresso : ''}`}
              onClick={() => setMetric('monto')}
            >
              <DollarSign size={14} /> Monto ($)
            </button>
            <button
              className={`${styles.metricBtn} ${metric === 'transacciones' ? styles.metricActiveTeal : ''}`}
              onClick={() => setMetric('transacciones')}
            >
              <Activity size={14} /> Transacciones
            </button>
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
          <div className={styles.kpiIcon} style={{ background: 'rgba(61, 28, 2, 0.08)', color: '#3D1C02' }}>
            <DollarSign size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Facturación Total</span>
            <span className={styles.kpiValue}>{loading ? '—' : fmt(aggregates.totalSales)}</span>
            <span className={styles.kpiSub}>{activeLabel}</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(20, 157, 146, 0.08)', color: '#149D92' }}>
            <ReceiptText size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Tickets Totales</span>
            <span className={styles.kpiValue}>{loading ? '—' : aggregates.totalTickets}</span>
            <span className={styles.kpiSub}>transacciones registradas</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(214, 64, 44, 0.08)', color: '#D6402C' }}>
            <Clock size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Hora Pico Comercial</span>
            <span className={styles.kpiValue}>
              {loading ? '—' : `${peakHourInfo.hour}:00 - ${peakHourInfo.hour + 1}:00`}
            </span>
            <span className={styles.kpiSub}>
              {metric === 'monto' ? `Con ${fmt(peakHourInfo.value)} acumulado` : `Con ${peakHourInfo.value} tickets`}
            </span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(227, 162, 28, 0.08)', color: '#E3A21C' }}>
            <BarChart3 size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Día más Fuerte</span>
            <span className={styles.kpiValue}>{loading ? '—' : DAYS_ES_FULL[peakDayInfo.day]}</span>
            <span className={styles.kpiSub}>
              {metric === 'monto' ? `Venta: ${fmt(peakDayInfo.value)}` : `${peakDayInfo.value} tickets`}
            </span>
          </div>
        </div>
      </div>

      {/* ====== HEATMAP BOARD ====== */}
      <div className={styles.heatmapCard}>
        <div className={styles.heatmapTitleBlock}>
          <h3>Distribución Horaria y Diaria</h3>
          <p>
            Análisis de densidad comercial basándose en **{metric === 'monto' ? 'Ventas en ($)' : 'Número de Transacciones'}**
          </p>
        </div>

        <div className={styles.heatmapWrapper}>
          {loading ? (
            <div className={styles.chartLoading}>
              <div className={styles.spinner} />
              <span>Calculando densidad térmica...</span>
            </div>
          ) : (
            <div className={styles.heatmapGrid}>
              {/* Corner header */}
              <div className={styles.heatmapCorner} />
              {/* Hours Header (0h to 23h) */}
              {HOURS.map(h => (
                <div key={h} className={styles.heatmapHeaderHour}>
                  {h}h
                </div>
              ))}

              {/* Rows: Lunes -> Domingo (indexes [1,2,3,4,5,6,0]) */}
              {[1, 2, 3, 4, 5, 6, 0].map(d => (
                <React.Fragment key={`row-${d}`}>
                  {/* Row Day Name */}
                  <div className={styles.heatmapRowLabel}>{DAYS_ES_SHORT[d]}</div>
                  {/* Cells */}
                  {HOURS.map(h => {
                    const cell = gridData[`${d}-${h}`] || { total: 0, transacciones: 0 };
                    const cellVal = metric === 'monto' ? cell.total : cell.transacciones;
                    const intensity = maxVal > 0 ? cellVal / maxVal : 0;

                    // Title tooltip content
                    const tooltipText = `${DAYS_ES_FULL[d]} ${h}:00 - ${h + 1}:00\n• Monto: ${fmt(cell.total)}\n• Tickets: ${cell.transacciones}`;

                    // Set background color according to metric and intensity
                    // Espresso: rgba(61, 28, 2, intensity)
                    // Teal: rgba(20, 157, 146, intensity)
                    const baseColor = metric === 'monto' ? '61, 28, 2' : '20, 157, 146';
                    const bg = intensity === 0 
                      ? 'var(--surface-2)' 
                      : `rgba(${baseColor}, ${0.12 + intensity * 0.88})`;

                    return (
                      <div
                        key={`${d}-${h}`}
                        className={styles.heatmapCell}
                        title={tooltipText}
                        style={{ background: bg }}
                      />
                    );
                  })}
                </React.Fragment>
              ))}
            </div>
          )}
        </div>

        {/* Legend */}
        {!loading && (
          <div className={styles.heatmapLegend}>
            <span>Baja Densidad</span>
            <div
              className={styles.heatmapLegendBar}
              style={{
                background:
                  metric === 'monto'
                    ? 'linear-gradient(to right, rgba(61, 28, 2, 0.12), rgba(61, 28, 2, 1))'
                    : 'linear-gradient(to right, rgba(20, 157, 146, 0.12), rgba(20, 157, 146, 1))',
              }}
            />
            <span>Alta Concentración</span>
          </div>
        )}
      </div>

      {/* ====== ADDITIONAL RANKINGS ====== */}
      <div className={styles.analysisGrid}>
        {/* Top Hours Widget */}
        <div className={styles.analysisCard}>
          <h3 className={styles.analysisTitle}>Horas de Mayor Actividad</h3>
          {loading ? (
            <div className={styles.chartLoading}>
              <div className={styles.spinner} />
            </div>
          ) : topHoursList.length === 0 || maxVal === 0 ? (
            <div className={styles.chartEmpty}>Sin registros en este rango</div>
          ) : (
            <div className={styles.topHoursList}>
              {topHoursList.map((item, idx) => (
                <div key={item.hour} className={styles.topHourItem}>
                  <div className={styles.topHourRank}>{idx + 1}</div>
                  <span className={styles.topHourTime}>
                    {item.hour}:00 - {item.hour + 1}:00
                  </span>
                  <span className={styles.topHourValue}>
                    {metric === 'monto' ? fmt(item.value) : `${item.value} tickets`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>

        {/* Top Days Widget */}
        <div className={styles.analysisCard}>
          <h3 className={styles.analysisTitle}>Rendimiento por Día de la Semana</h3>
          {loading ? (
            <div className={styles.chartLoading}>
              <div className={styles.spinner} />
            </div>
          ) : topDaysList.length === 0 || maxVal === 0 ? (
            <div className={styles.chartEmpty}>Sin registros en este rango</div>
          ) : (
            <div className={styles.topHoursList}>
              {topDaysList.map((item, idx) => (
                <div key={item.day} className={styles.topHourItem}>
                  <div
                    className={styles.topHourRank}
                    style={{
                      background:
                        idx === 0
                          ? 'var(--primary)'
                          : idx === 1
                          ? 'var(--yellow-deep)'
                          : '#3D1C02',
                    }}
                  >
                    {idx + 1}
                  </div>
                  <span className={styles.topHourTime}>{item.name}</span>
                  <span className={styles.topHourValue}>
                    {metric === 'monto' ? fmt(item.value) : `${item.value} tickets`}
                  </span>
                </div>
              ))}
            </div>
          )}
        </div>
      </div>
    </div>
  );
}

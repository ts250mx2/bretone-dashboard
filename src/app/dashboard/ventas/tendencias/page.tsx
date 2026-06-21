'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  TrendingUp,
  Calendar,
  FileText,
  Download,
  DollarSign,
  ReceiptText,
  Clock,
  ArrowLeft,
  ArrowRight,
} from 'lucide-react';
import Link from 'next/link';
import * as XLSX from 'xlsx';
import styles from './tendencias.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────
type Period = 'today' | 'yesterday' | 'week' | 'month';
type TrendPoint = { fecha: string; total: number; transacciones: number };

const DAYS_ES_FULL = ['Domingo', 'Lunes', 'Martes', 'Miércoles', 'Jueves', 'Viernes', 'Sábado'];

// Helper to format currency
const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n || 0);

// Helper to format short numbers (e.g. $4.5k)
const fmtShort = (n: number) => {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
};

// Helper to format date strings for input
function toISO(d: Date) {
  return d.toISOString().split('T')[0];
}

// Compute date range for presets
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

// ─── Custom SVG Line Chart ───────────────────────────────────────────────────
function LineChart({ data, group }: { data: TrendPoint[]; group: 'dia' | 'semana' | 'mes' }) {
  if (!data || data.length === 0) {
    return <div className={styles.chartEmpty}>Sin datos para el período seleccionado</div>;
  }

  const W = 780;
  const H = 250;
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
        <linearGradient id="trendAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#3D1C02" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#3D1C02" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {/* Y-axis gridlines */}
      {yTicks.map(({ v, y }) => (
        <g key={v}>
          <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="rgba(61, 28, 2, 0.08)" strokeWidth="1.2" />
          <text x={PAD.l - 10} y={y + 4} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--text-muted)">
            {fmtShort(v)}
          </text>
        </g>
      ))}

      {/* Area fill */}
      <polygon points={areaPoints} fill="url(#trendAreaGrad)" />

      {/* Main trend line */}
      <polyline
        points={points}
        fill="none"
        stroke="#3D1C02"
        strokeWidth="3.2"
        strokeLinejoin="round"
        strokeLinecap="round"
      />

      {/* Dots and Tooltips */}
      {data.map((d, i) => (
        <g key={i}>
          <circle
            cx={toX(i)}
            cy={toY(d.total)}
            r="4.5"
            fill="#3D1C02"
            stroke="#ffffff"
            strokeWidth="2.5"
            style={{ filter: 'drop-shadow(0px 2px 4px rgba(61,28,2,0.15))' }}
          >
            <title>{`${formatLabel(d.fecha)} — Ventas: ${fmt(d.total)} (${d.transacciones} transacciones)`}</title>
          </circle>
          {/* Label under point */}
          <text
            x={toX(i)}
            y={PAD.t + innerH + 20}
            textAnchor="middle"
            fontSize="10"
            fontWeight="600"
            fill="var(--text-muted)"
          >
            {formatLabel(d.fecha)}
          </text>
        </g>
      ))}
    </svg>
  );
}

// ─── Main Component ──────────────────────────────────────────────────────────
export default function SalesTrendReport() {
  const [trendGroup, setTrendGroup] = useState<'dia' | 'semana' | 'mes'>('dia');
  const [dateFrom, setDateFrom] = useState(() => datesForPeriod('week')[0]); // Default to last 7 days to show data
  const [dateTo, setDateTo] = useState(() => datesForPeriod('week')[1]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

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

  // Fetch trend data
  const fetchData = useCallback(async (from: string, to: string, tg: 'dia' | 'semana' | 'mes') => {
    if (!from || !to) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        groupBy: 'categoria', // required parameter for backend router
        dateFrom: from,
        dateTo: to,
        trendGroup: tg,
      });
      const res = await fetch(`/api/dashboard/sales?${params}`);
      if (!res.ok) throw new Error('Error al cargar los datos de la base de datos');
      const json = await res.json();
      setData(json);
    } catch (e: any) {
      setError(e.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) fetchData(dateFrom, dateTo, trendGroup);
  }, [dateFrom, dateTo, trendGroup, mounted, fetchData]);

  const handlePeriod = (p: Period) => {
    const [from, to] = datesForPeriod(p);
    setDateFrom(from);
    setDateTo(to);
  };

  // Detect which preset the current dates match
  const activePeriod: Period | null = useMemo(() => {
    return (['today', 'yesterday', 'week', 'month'] as Period[]).find(p => {
      const [f, t] = datesForPeriod(p);
      return f === dateFrom && t === dateTo;
    }) ?? null;
  }, [dateFrom, dateTo]);

  // Client-side calculations
  const kpiData = useMemo(() => {
    const trend = data?.trend ?? [];
    const totalVentas = trend.reduce((acc: number, d: any) => acc + Number(d.total), 0);
    const numTransacciones = trend.reduce((acc: number, d: any) => acc + Number(d.transacciones), 0);
    const ticketPromedio = numTransacciones > 0 ? totalVentas / numTransacciones : 0;
    const maxVentaDia = trend.length > 0 ? Math.max(...trend.map((d: any) => Number(d.total))) : 0;
    const promedioVentaDia = trend.length > 0 ? totalVentas / trend.length : 0;

    return {
      totalVentas,
      numTransacciones,
      ticketPromedio,
      maxVentaDia,
      promedioVentaDia,
    };
  }, [data]);

  // Aggregate Day of Week Data from heatmap
  const dayOfWeekData = useMemo(() => {
    if (!data || !data.heatmap) return [];
    // Sort Lunes -> Domingo: [1, 2, 3, 4, 5, 6, 0]
    return [1, 2, 3, 4, 5, 6, 0].map(d => {
      const matchingCells = data.heatmap.filter((cell: any) => Number(cell.diaSemana) === d);
      const total = matchingCells.reduce((acc: number, cell: any) => acc + Number(cell.total), 0);
      const transacciones = matchingCells.reduce((acc: number, cell: any) => acc + Number(cell.transacciones), 0);
      return {
        dia: d,
        nombre: DAYS_ES_FULL[d],
        total,
        transacciones,
      };
    });
  }, [data]);

  const maxDayVal = useMemo(() => {
    if (dayOfWeekData.length === 0) return 1;
    return Math.max(...dayOfWeekData.map(d => d.total), 1);
  }, [dayOfWeekData]);

  // Export to Excel
  const exportToExcel = () => {
    if (!data || !data.trend || data.trend.length === 0) return;

    const formattedData = data.trend.map((point: any) => {
      const dateStr = point.fecha?.split('T')[0] ?? point.fecha;
      return {
        'Fecha / Período': dateStr,
        'Ventas Totales ($)': point.total,
        'Transacciones': point.transacciones,
        'Ticket Promedio ($)': point.transacciones > 0 ? point.total / point.transacciones : 0,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(formattedData);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Tendencia de Ventas');
    XLSX.writeFile(workbook, `Reporte_Tendencia_Ventas_${dateFrom}_a_${dateTo}.xlsx`);
  };

  if (!mounted) {
    return <div className={styles.container} style={{ opacity: 0 }}>Cargando reporte...</div>;
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
          <TrendingUp size={34} style={{ color: '#E3A21C' }} />
          <div>
            <h1>Reporte de Tendencia de Ventas</h1>
            <p className={styles.subtitle}>Evolución temporal, picos de facturación e histórico comercial</p>
          </div>
        </div>

        <div className={styles.actionsGroup}>
          <button
            onClick={exportToExcel}
            className={styles.exportBtn}
            disabled={!data?.trend || data.trend.length === 0}
            style={{ opacity: !data?.trend || data.trend.length === 0 ? 0.6 : 1 }}
          >
            <Download size={15} /> Exportar a Excel
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
            <span className={styles.kpiLabel}>Facturación Total</span>
            <span className={styles.kpiValue}>{loading ? '—' : fmt(kpiData.totalVentas)}</span>
            <span className={styles.kpiSub}>{activeLabel}</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(20, 157, 146, 0.08)', color: '#149D92' }}>
            <ReceiptText size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Transacciones</span>
            <span className={styles.kpiValue}>{loading ? '—' : kpiData.numTransacciones}</span>
            <span className={styles.kpiSub}>tickets generados</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(209, 122, 78, 0.08)', color: '#D17A4E' }}>
            <TrendingUp size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Venta Máxima</span>
            <span className={styles.kpiValue}>{loading ? '—' : fmt(kpiData.maxVentaDia)}</span>
            <span className={styles.kpiSub}>pico del período</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(227, 162, 28, 0.08)', color: '#E3A21C' }}>
            <Clock size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Promedio Diario</span>
            <span className={styles.kpiValue}>{loading ? '—' : fmt(kpiData.promedioVentaDia)}</span>
            <span className={styles.kpiSub}>por día activo</span>
          </div>
        </div>
      </div>

      {/* ====== VISUALIZATIONS ====== */}
      <div className={styles.mainGrid}>
        {/* Main Line Chart */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.chartTitle}>Evolución Temporal de Ventas</h3>
              <p className={styles.chartSub}>Monto acumulado por intervalo seleccionado</p>
            </div>
            <div className={styles.granularityBtns}>
              {(['dia', 'semana', 'mes'] as const).map(tg => (
                <button
                  key={tg}
                  className={`${styles.granularityBtn} ${trendGroup === tg ? styles.granularityActive : ''}`}
                  onClick={() => setTrendGroup(tg)}
                >
                  {tg === 'dia' && 'Diario'}
                  {tg === 'semana' && 'Semanal'}
                  {tg === 'mes' && 'Mensual'}
                </button>
              ))}
            </div>
          </div>

          <div className={styles.chartBody}>
            {loading ? (
              <div className={styles.chartLoading}>
                <div className={styles.spinner} />
                <span>Cargando gráfico...</span>
              </div>
            ) : (
              <LineChart
                data={(data?.trend ?? []).map((r: any) => ({ ...r, fecha: r.fecha?.split('T')[0] ?? r.fecha }))}
                group={trendGroup}
              />
            )}
          </div>
        </div>

        {/* Day of Week Breakdown */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.chartTitle}>Rendimiento por Día</h3>
              <p className={styles.chartSub}>Comparativa acumulada por día de la semana</p>
            </div>
          </div>

          <div className={styles.chartBody}>
            {loading ? (
              <div className={styles.chartLoading}>
                <div className={styles.spinner} />
                <span>Analizando días...</span>
              </div>
            ) : dayOfWeekData.length === 0 || maxDayVal === 1 ? (
              <div className={styles.chartEmpty}>Sin registros en este rango</div>
            ) : (
              <div className={styles.dayBarList}>
                {dayOfWeekData.map(d => {
                  const pct = (d.total / maxDayVal) * 100;
                  return (
                    <div key={d.dia} className={styles.dayBarRow}>
                      <span className={styles.dayLabel}>{d.nombre}</span>
                      <div className={styles.dayTrack}>
                        <div className={styles.dayFill} style={{ width: `${pct}%` }} />
                      </div>
                      <span className={styles.dayValue}>{fmt(d.total)}</span>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ====== DATA TABLE ====== */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h3 className={styles.tableTitle}>Detalle del Historial de Ventas</h3>
        </div>

        <div className={styles.tableWrapper}>
          {loading ? (
            <div className={styles.chartLoading}>
              <div className={styles.spinner} />
              <span>Cargando tabla...</span>
            </div>
          ) : !data?.trend || data.trend.length === 0 ? (
            <div className={styles.chartEmpty}>No se encontraron registros para este rango de fechas</div>
          ) : (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Fecha / Rango</th>
                  <th style={{ textAlign: 'right' }}>Ventas Totales</th>
                  <th style={{ textAlign: 'right' }}>Transacciones</th>
                  <th style={{ textAlign: 'right' }}>Ticket Promedio</th>
                </tr>
              </thead>
              <tbody>
                {data.trend.map((point: any, idx: number) => {
                  const dateStr = point.fecha?.split('T')[0] ?? point.fecha;
                  const ticketAvg = point.transacciones > 0 ? point.total / point.transacciones : 0;
                  return (
                    <tr key={idx}>
                      <td style={{ fontWeight: 700 }}>{dateStr}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800 }}>{fmt(point.total)}</td>
                      <td style={{ textAlign: 'right' }}>{point.transacciones}</td>
                      <td style={{ textAlign: 'right', color: 'rgba(61, 28, 2, 0.85)', fontWeight: 600 }}>{fmt(ticketAvg)}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      </div>
    </div>
  );
}

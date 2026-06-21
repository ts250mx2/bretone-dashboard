'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar,
  RefreshCw,
  TrendingUp,
  ReceiptText,
  DollarSign,
  Search,
  X,
  Eye,
  FileSpreadsheet,
  AlertTriangle,
  ChevronRight,
  TrendingDown,
  ShoppingBag,
  CreditCard,
  Banknote
} from 'lucide-react';
import * as XLSX from 'xlsx';
import styles from './ventas.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────
type Period = 'today' | 'yesterday' | 'week' | 'month';
type GroupBy = 'categoria' | 'producto';
type TrendPoint = { fecha: string; total: number; transacciones: number };
type BreakItem = { id?: number | null; nombre: string; total: number; cantidad: number };

// Helper to format currency
const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n || 0);

// Helper to format short numbers (e.g. $4.5k)
const fmtShort = (n: number) => {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
};

// Helper to format full date and time (e.g. DD/MM/YYYY HH:MM hrs)
const formatDateTime = (dateStr: any) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const hours = String(d.getHours()).padStart(2, '0');
  const minutes = String(d.getMinutes()).padStart(2, '0');
  return `${day}/${month}/${year} ${hours}:${minutes} hrs`;
};

// Helper to format date strings for input
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
      m.setDate(1); // 1st of current month
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
        <linearGradient id="salesReportAreaGrad" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#149D92" stopOpacity="0.25" />
          <stop offset="100%" stopColor="#149D92" stopOpacity="0.01" />
        </linearGradient>
      </defs>

      {/* Y-axis gridlines */}
      {yTicks.map(({ v, y }) => (
        <g key={v}>
          <line x1={PAD.l} y1={y} x2={W - PAD.r} y2={y} stroke="rgba(20, 157, 146, 0.08)" strokeWidth="1.2" />
          <text x={PAD.l - 10} y={y + 4} textAnchor="end" fontSize="11" fontWeight="600" fill="var(--text-muted)">
            {fmtShort(v)}
          </text>
        </g>
      ))}

      {/* Area fill */}
      <polygon points={areaPoints} fill="url(#salesReportAreaGrad)" />

      {/* Main trend line */}
      <polyline
        points={points}
        fill="none"
        stroke="#149D92"
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
            fill="#149D92"
            stroke="#ffffff"
            strokeWidth="2.5"
            style={{ filter: 'drop-shadow(0px 2px 4px rgba(20,157,146,0.15))' }}
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

// ─── Main Page Component ─────────────────────────────────────────────────────
export default function SalesReport() {
  const [dateFrom, setDateFrom] = useState(() => datesForPeriod('week')[0]);
  const [dateTo, setDateTo] = useState(() => datesForPeriod('week')[1]);
  const [groupBy, setGroupBy] = useState<GroupBy>('categoria');
  const [trendGroup, setTrendGroup] = useState<'dia' | 'semana' | 'mes'>('dia');
  const [searchQuery, setSearchQuery] = useState('');

  // Page level sales state
  const [kpiData, setKpiData] = useState<any>(null);
  const [trendData, setTrendData] = useState<TrendPoint[]>([]);
  const [breakdownData, setBreakdownData] = useState<BreakItem[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  // Detailed tickets list
  const [ticketsList, setTicketsList] = useState<any[]>([]);
  const [ticketsLoading, setTicketsLoading] = useState(false);

  // Nested ticket details modal
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [ticketItems, setTicketItems] = useState<any[]>([]);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketError, setTicketError] = useState('');

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

  // ─── Fetch analytics data ──────────────────────────────────────────────────
  const fetchReportData = useCallback(async (from: string, to: string, gb: GroupBy, tg: 'dia' | 'semana' | 'mes') => {
    if (!from || !to) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        groupBy: gb,
        dateFrom: from,
        dateTo: to,
        trendGroup: tg,
      });
      const res = await fetch(`/api/dashboard/sales?${params}`);
      if (!res.ok) throw new Error('Error al cargar datos consolidados de ventas');
      const json = await res.json();
      
      setKpiData(json.kpi || null);
      setTrendData(json.trend || []);
      setBreakdownData(json.breakdown || []);
    } catch (e: any) {
      setError(e.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  // ─── Fetch detailed transaction ledger ──────────────────────────────────────
  const fetchLedgerData = useCallback(async (from: string, to: string) => {
    if (!from || !to) return;
    setTicketsLoading(true);
    try {
      const params = new URLSearchParams({
        startDate: from,
        endDate: to,
      });
      const res = await fetch(`/api/ventas-detalle?${params}`);
      if (!res.ok) throw new Error('Error al cargar el libro de transacciones');
      const json = await res.json();
      if (json.success) {
        setTicketsList(json.data || []);
      }
    } catch (e) {
      console.error(e);
    } finally {
      setTicketsLoading(false);
    }
  }, []);

  const refreshAll = useCallback(() => {
    fetchReportData(dateFrom, dateTo, groupBy, trendGroup);
    fetchLedgerData(dateFrom, dateTo);
  }, [dateFrom, dateTo, groupBy, trendGroup, fetchReportData, fetchLedgerData]);

  useEffect(() => {
    if (mounted) {
      refreshAll();
    }
  }, [dateFrom, dateTo, groupBy, trendGroup, mounted]); // eslint-disable-line react-hooks/exhaustive-deps

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

  // ─── Open ticket detail modal ───────────────────────────────────────────────
  const handleOpenTicketItems = async (ticket: any) => {
    setSelectedTicket(ticket);
    setTicketLoading(true);
    setTicketError('');
    setTicketItems([]);
    try {
      const res = await fetch(`/api/ventas-items?idVenta=${ticket.IdVenta}&idApertura=${ticket.IdApertura}`);
      if (!res.ok) throw new Error('Error al consultar artículos del ticket');
      const result = await res.json();
      if (result.success) {
        setTicketItems(result.data || []);
      } else {
        throw new Error(result.error || 'Error de base de datos');
      }
    } catch (err: any) {
      setTicketError(err.message || 'Error de conexión');
    } finally {
      setTicketLoading(false);
    }
  };

  // ─── Filtered Ledger ────────────────────────────────────────────────────────
  const filteredLedger = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return ticketsList;
    return ticketsList.filter(
      t =>
        String(t['Folio Venta'] || '').toLowerCase().includes(q) ||
        String(t.Cliente || '').toLowerCase().includes(q) ||
        String(t.Cajero || '').toLowerCase().includes(q)
    );
  }, [ticketsList, searchQuery]);

  // ─── Excel Export ───────────────────────────────────────────────────────────
  const exportLedgerToExcel = () => {
    if (!ticketsList || ticketsList.length === 0) return;
    const formatted = ticketsList.map(item => ({
      'Folio Venta': item['Folio Venta'],
      'Fecha Venta': new Date(item.FechaVenta).toLocaleString('es-MX'),
      'Cliente': item.Cliente,
      'Productos Vendidos': item.Productos,
      'Pago Efectivo': item['Pago Efectivo'],
      'Pago Tarjeta': item['Pago Tarjeta'],
      'Total': item.Total,
      'Cajero': item.Cajero,
    }));
    const worksheet = XLSX.utils.json_to_sheet(formatted);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Historial Ventas');
    XLSX.writeFile(workbook, `Historial_Ventas_${dateFrom}_a_${dateTo}.xlsx`);
  };

  const activeLabel = activePeriod
    ? activePeriod === 'today'
      ? 'Hoy'
      : activePeriod === 'yesterday'
      ? 'Ayer'
      : activePeriod === 'week'
      ? 'Últimos 7 días'
      : 'Últimos 30 días'
    : `Personalizado (${dateFrom} a ${dateTo})`;

  const COLORS = ['#E3A21C', '#149D92', '#D17A4E', '#3D1C02', '#C2410C', '#7A8B4F', '#5B7A99', '#9C5B6B'];
  const maxBreakdown = useMemo(() => {
    if (breakdownData.length === 0) return 1;
    return Math.max(...breakdownData.map(d => d.total), 1);
  }, [breakdownData]);

  // Cash vs Card calculations
  const cashTotal = kpiData?.efectivo || 0;
  const cardTotal = kpiData?.tarjeta || 0;
  const combinedTotal = cashTotal + cardTotal;
  const cashPct = combinedTotal > 0 ? (cashTotal / combinedTotal) * 100 : 0;
  const cardPct = combinedTotal > 0 ? (cardTotal / combinedTotal) * 100 : 0;

  if (!mounted) {
    return <div className={styles.container} style={{ opacity: 0 }}>Cargando reporte de ventas...</div>;
  }

  return (
    <div className={styles.container}>
      {/* ====== HEADER ====== */}
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <TrendingUp size={34} style={{ color: '#149D92' }} />
          <div>
            <h1>Reporte General de Ventas</h1>
            <p className={styles.subtitle}>Análisis consolidado, comportamiento temporal y desglose de tickets</p>
          </div>
        </div>

        <div className={styles.actionsGroup}>
          <button
            onClick={exportLedgerToExcel}
            className={styles.exportBtn}
            disabled={ticketsList.length === 0}
            style={{ opacity: ticketsList.length === 0 ? 0.6 : 1 }}
          >
            <FileSpreadsheet size={15} /> Exportar Reporte
          </button>
        </div>
      </header>

      {/* ====== FILTER CARD ====== */}
      <div className={styles.filterCard}>
        <div className={styles.leftFilters}>
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

          <button className={styles.refreshBtn} onClick={refreshAll} title="Refrescar datos">
            <RefreshCw size={14} />
          </button>
        </div>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '12px', marginBottom: '1.5rem', fontWeight: 600, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      {/* ====== KPIS ROW ====== */}
      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(20, 157, 146, 0.08)', color: '#149D92' }}>
            <DollarSign size={20} />
          </div>
          <div className={styles.kpiInfo} style={{ width: '100%' }}>
            <span className={styles.kpiLabel}>Facturación total</span>
            <span className={styles.kpiValue}>{loading ? '—' : fmt(kpiData?.totalVentas)}</span>
            <span className={styles.kpiSub}>{activeLabel}</span>

            {/* Payment Split */}
            {!loading && combinedTotal > 0 && (
              <div className={styles.paymentSplit}>
                <div className={styles.splitLabels}>
                  <span>Efe: {cashPct.toFixed(0)}%</span>
                  <span>Tar: {cardPct.toFixed(0)}%</span>
                </div>
                <div className={styles.splitTrack}>
                  <div className={styles.splitCash} style={{ width: `${cashPct}%` }} title={`Efectivo: ${fmt(cashTotal)}`} />
                  <div className={styles.splitCard} style={{ width: `${cardPct}%` }} title={`Tarjeta: ${fmt(cardTotal)}`} />
                </div>
              </div>
            )}
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(61, 28, 2, 0.08)', color: '#3D1C02' }}>
            <ReceiptText size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Tickets Totales</span>
            <span className={styles.kpiValue}>{loading ? '—' : kpiData?.numTransacciones}</span>
            <span className={styles.kpiSub}>ventas sin cancelar</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(227, 162, 28, 0.08)', color: '#E3A21C' }}>
            <TrendingUp size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Ticket Promedio</span>
            <span className={styles.kpiValue}>{loading ? '—' : fmt(kpiData?.ticketPromedio)}</span>
            <span className={styles.kpiSub}>gasto por transacción</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(217, 76, 61, 0.08)', color: 'var(--danger)' }}>
            <TrendingDown size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Cancelaciones</span>
            <span className={styles.kpiValue} style={{ color: 'var(--danger)' }}>{loading ? '—' : kpiData?.canceladas}</span>
            <span className={styles.kpiSub}>ventas canceladas</span>
          </div>
        </div>
      </div>

      {/* ====== VISUALIZATIONS ====== */}
      <div className={styles.mainGrid}>
        {/* Sales trend line chart */}
        <div className={styles.chartCard}>
          <div className={styles.chartHeader}>
            <div>
              <h3 className={styles.chartTitle}>Tendencia de Facturación</h3>
              <p className={styles.chartSub}>Histórico temporal de ventas netas ($)</p>
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
                <span>Cargando análisis temporal...</span>
              </div>
            ) : (
              <LineChart
                data={trendData.map(r => ({ ...r, fecha: r.fecha?.split('T')[0] ?? r.fecha }))}
                group={trendGroup}
              />
            )}
          </div>
        </div>

        {/* Top-selling items bar list */}
        <div className={styles.chartCard}>
          <div className={styles.toggleHeader}>
            <div>
              <h3 className={styles.chartTitle}>Distribución de Ventas</h3>
              <p className={styles.chartSub}>Top 10 más vendidos por total facturado</p>
            </div>
            <div className={styles.toggleBtns}>
              <button
                className={`${styles.toggleBtn} ${groupBy === 'categoria' ? styles.toggleActive : ''}`}
                onClick={() => setGroupBy('categoria')}
              >
                Categoría
              </button>
              <button
                className={`${styles.toggleBtn} ${groupBy === 'producto' ? styles.toggleActive : ''}`}
                onClick={() => setGroupBy('producto')}
              >
                Producto
              </button>
            </div>
          </div>

          <div className={styles.chartBody} style={{ justifyContent: 'flex-start', alignItems: 'stretch' }}>
            {loading ? (
              <div className={styles.chartLoading}>
                <div className={styles.spinner} />
                <span>Calculando ranking...</span>
              </div>
            ) : breakdownData.length === 0 ? (
              <div className={styles.chartEmpty}>Sin registros en este rango</div>
            ) : (
              <div className={styles.barList}>
                {breakdownData.map((item, idx) => (
                  <div key={idx} className={styles.barRow}>
                    <span className={styles.barLabel} title={item.nombre}>{item.nombre}</span>
                    <div className={styles.barTrack}>
                      <div
                        className={styles.barFill}
                        style={{
                          width: `${(item.total / maxBreakdown) * 100}%`,
                          background: COLORS[idx % COLORS.length]
                        }}
                      />
                    </div>
                    <span className={styles.barValue}>{fmt(item.total)}</span>
                    <span className={styles.barCount}>{item.cantidad} uds</span>
                  </div>
                ))}
              </div>
            )}
          </div>
        </div>
      </div>

      {/* ====== DATA LEDGER TABLE ====== */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <h3 className={styles.tableTitle}>Historial de Transacciones</h3>
          <div className={styles.tableActions}>
            <div className={styles.tableSearchWrapper}>
              <Search size={14} className={styles.tableSearchIcon} />
              <input
                type="text"
                placeholder="Buscar por folio, cliente o cajero..."
                className={styles.tableSearchInput}
                value={searchQuery}
                onChange={e => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className={styles.tableClearSearchBtn} onClick={() => setSearchQuery('')}>
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        <div className={styles.tableWrapper} style={{ maxHeight: '800px', overflowY: 'auto', position: 'relative' }}>
          {ticketsLoading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem 0', gap: '0.75rem' }}>
              <div className={styles.spinner} />
              <span>Consultando libro de ventas...</span>
            </div>
          ) : filteredLedger.length === 0 ? (
            <div className={styles.chartEmpty}>No se encontraron transacciones registradas.</div>
          ) : (
            <table className={styles.table}>
              <thead style={{ position: 'sticky', top: 0, zIndex: 10, backgroundColor: '#fff', boxShadow: '0 2px 4px rgba(0,0,0,0.05)' }}>
                <tr>
                  <th>Folio</th>
                  <th>Fecha / Hora</th>
                  <th>Cliente</th>
                  <th style={{ textAlign: 'center' }}>Productos</th>
                  <th style={{ textAlign: 'right' }}>Pago Efectivo</th>
                  <th style={{ textAlign: 'right' }}>Pago Tarjeta</th>
                  <th style={{ textAlign: 'right' }}>Total Venta</th>
                  <th>Cajero</th>
                  <th style={{ textAlign: 'center' }}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filteredLedger.map(ticket => {
                  const isCanceled = ticket.Cancelada > 0;
                  return (
                    <tr key={ticket['Folio Venta'] || `${ticket.IdApertura || 1}-${ticket.IdVenta}`} style={{ opacity: isCanceled ? 0.6 : 1, background: isCanceled ? '#fff5f5' : 'inherit' }}>
                      <td style={{ fontWeight: 800 }}>
                        {ticket['Folio Venta'] || `${ticket.IdApertura || 1}-${ticket.IdVenta}`}
                        {isCanceled && (
                          <div style={{ fontSize: '0.65rem', color: '#b91c1c', fontWeight: 800, marginTop: '2px', background: '#fee2e2', padding: '2px 4px', borderRadius: '4px', display: 'inline-block' }}>
                            CANCELADA
                          </div>
                        )}
                      </td>
                      <td style={{ textDecoration: isCanceled ? 'line-through' : 'none' }}>{formatDateTime(ticket.FechaVenta)}</td>
                      <td style={{ textDecoration: isCanceled ? 'line-through' : 'none' }}>{ticket.Cliente}</td>
                      <td style={{ textAlign: 'center', textDecoration: isCanceled ? 'line-through' : 'none' }}>{ticket.Productos} uds</td>
                      <td style={{ textAlign: 'right', textDecoration: isCanceled ? 'line-through' : 'none' }}>{fmt(ticket['Pago Efectivo'])}</td>
                      <td style={{ textAlign: 'right', textDecoration: isCanceled ? 'line-through' : 'none' }}>{fmt(ticket['Pago Tarjeta'])}</td>
                      <td style={{ textAlign: 'right', fontWeight: 800, color: isCanceled ? '#b91c1c' : '#149D92', textDecoration: isCanceled ? 'line-through' : 'none' }}>{fmt(ticket.Total)}</td>
                      <td style={{ textDecoration: isCanceled ? 'line-through' : 'none' }}>{ticket.Cajero}</td>
                      <td style={{ textAlign: 'center' }}>
                        <button
                          onClick={() => handleOpenTicketItems(ticket)}
                          style={{
                            border: 'none',
                            background: isCanceled ? 'rgba(185, 28, 28, 0.1)' : 'rgba(20, 157, 146, 0.08)',
                            color: isCanceled ? '#b91c1c' : '#0F7F76',
                            padding: '0.3rem 0.75rem',
                            borderRadius: '99px',
                            fontSize: '0.72rem',
                            fontWeight: 700,
                            cursor: 'pointer',
                            display: 'inline-flex',
                            alignItems: 'center',
                            gap: '0.3rem'
                          }}
                        >
                          <Eye size={12} />
                          Ver Detalle
                        </button>
                      </td>
                    </tr>
                  );
                })}
                <tr className={styles.totalRow} style={{ position: 'sticky', bottom: 0, zIndex: 10, backgroundColor: '#fdfbfa', boxShadow: '0 -2px 8px rgba(0,0,0,0.05)' }}>
                  <td colSpan={3}>Totales (Excluyendo Canceladas)</td>
                  <td style={{ textAlign: 'center' }}>{filteredLedger.filter(t => !t.Cancelada).reduce((acc, curr) => acc + (curr.Productos || 0), 0)} uds</td>
                  <td style={{ textAlign: 'right' }}>{fmt(filteredLedger.filter(t => !t.Cancelada).reduce((acc, curr) => acc + (curr['Pago Efectivo'] || 0), 0))}</td>
                  <td style={{ textAlign: 'right' }}>{fmt(filteredLedger.filter(t => !t.Cancelada).reduce((acc, curr) => acc + (curr['Pago Tarjeta'] || 0), 0))}</td>
                  <td style={{ textAlign: 'right', color: '#149D92' }}>{fmt(filteredLedger.filter(t => !t.Cancelada).reduce((acc, curr) => acc + (curr.Total || 0), 0))}</td>
                  <td colSpan={2} />
                </tr>
              </tbody>
            </table>
          )}
        </div>
      </div>

      {/* =======================================================================
          MODAL: TICKET ITEMS DETAILS
          ======================================================================= */}
      {selectedTicket && (
        <div className={styles.modalOverlay} onClick={() => setSelectedTicket(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <h3>Artículos en Ticket {selectedTicket['Folio Venta']}</h3>
                <p>Cajero: {selectedTicket.Cajero} | Cliente: {selectedTicket.Cliente}</p>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setSelectedTicket(null)}>
                <X size={16} />
              </button>
            </div>

            <div className={styles.modalBody}>
              {ticketLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 0', gap: '0.5rem' }}>
                  <div className={styles.spinner} />
                  <span>Obteniendo productos...</span>
                </div>
              ) : ticketError ? (
                <div style={{ color: 'var(--danger)', textAlign: 'center' }}>{ticketError}</div>
              ) : (
                <table className={styles.table} style={{ fontSize: '0.78rem' }}>
                  <thead>
                    <tr>
                      <th>Descripción</th>
                      <th style={{ textAlign: 'center' }}>Cant</th>
                      <th style={{ textAlign: 'right' }}>Precio</th>
                      <th style={{ textAlign: 'right' }}>Desc</th>
                      <th style={{ textAlign: 'right' }}>Importe</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticketItems.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 600 }}>{item.Descripcion}</td>
                        <td style={{ textAlign: 'center' }}>{item.Cantidad}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(item.Precio)}</td>
                        <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{item.Descuento > 0 ? `-${fmt(item.Descuento)}` : '—'}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(item.Total)}</td>
                      </tr>
                    ))}
                    <tr className={styles.totalRow}>
                      <td>Total Ticket</td>
                      <td style={{ textAlign: 'center' }}>{ticketItems.reduce((acc, curr) => acc + curr.Cantidad, 0)}</td>
                      <td />
                      <td style={{ textAlign: 'right', color: 'var(--danger)' }}>
                        {ticketItems.reduce((acc, curr) => acc + curr.Descuento, 0) > 0 
                          ? `-${fmt(ticketItems.reduce((acc, curr) => acc + curr.Descuento, 0))}` 
                          : '—'}
                      </td>
                      <td style={{ textAlign: 'right', color: '#149D92' }}>{fmt(ticketItems.reduce((acc, curr) => acc + curr.Total, 0))}</td>
                    </tr>
                  </tbody>
                </table>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

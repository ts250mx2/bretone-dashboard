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
  Search,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import styles from './productos.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────
type Period = 'today' | 'yesterday' | 'week' | 'month';
interface ProductItem {
  id: number;
  nombre: string;
  categoria: string;
  total: number;
  cantidad: number;
}
interface TicketLogItem {
  IdVenta: number;
  IdApertura: number;
  folio: string;
  fecha: string;
  cliente: string;
  cantidad: number;
  precio: number;
  descuento: number;
  total: number;
}

// Helper to format currency
const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n || 0);

// Helper to format short numbers (e.g. $4.5k)
const fmtShort = (n: number) => {
  if (n >= 1000) return `$${(n / 1000).toFixed(1)}k`;
  return `$${Math.round(n)}`;
};

// Product sales trend chart component
function ProductLineChart({ data, group }: { data: any[]; group: 'dia' | 'semana' | 'mes' }) {
  if (!data || data.length === 0) {
    return <div className={styles.chartEmpty}>Sin datos de tendencia para este producto</div>;
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
        <linearGradient id="prodAreaGrad" x1="0" y1="0" x2="0" y2="1">
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
      <polygon points={areaPoints} fill="url(#prodAreaGrad)" />

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

export default function GlobalProductsReport() {
  const [dateFrom, setDateFrom] = useState(() => datesForPeriod('week')[0]); // Default to last 7 days
  const [dateTo, setDateTo] = useState(() => datesForPeriod('week')[1]);
  const [data, setData] = useState<any>(null);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);
  const [searchTerm, setSearchTerm] = useState('');

  // Details pane state
  const [selectedProd, setSelectedProd] = useState<ProductItem | null>(null);
  const [hours, setHours] = useState<any[]>([]);
  const [tickets, setTickets] = useState<TicketLogItem[]>([]);
  const [detailLoading, setDetailLoading] = useState(false);
  const [activeTab, setActiveTab] = useState<'horas' | 'transacciones'>('horas');

  // Modal states for product sales trends
  const [isTrendModalOpen, setIsTrendModalOpen] = useState(false);
  const [trendDateFrom, setTrendDateFrom] = useState(() => `${new Date().getFullYear()}-01-01`);
  const [trendDateTo, setTrendDateTo] = useState(() => toISO(new Date()));
  const [trendGroup, setTrendGroup] = useState<'dia' | 'semana' | 'mes'>('dia');
  const [trendList, setTrendList] = useState<any[]>([]);
  const [trendLoading, setTrendLoading] = useState(false);
  const [trendError, setTrendError] = useState('');

  // Fetch product sales trend points
  const fetchProductTrend = useCallback(async (prodId: number, from: string, to: string, tg: 'dia' | 'semana' | 'mes') => {
    if (!from || !to) return;
    setTrendLoading(true);
    setTrendError('');
    try {
      const params = new URLSearchParams({
        id: String(prodId),
        dateFrom: from,
        dateTo: to,
        trendGroup: tg,
        getTrend: 'true'
      });
      const res = await fetch(`/api/dashboard/sales/product-details?${params}`);
      if (!res.ok) throw new Error('Error al cargar tendencias del producto');
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
    if (isTrendModalOpen && selectedProd) {
      fetchProductTrend(selectedProd.id, trendDateFrom, trendDateTo, trendGroup);
    }
  }, [isTrendModalOpen, selectedProd, trendDateFrom, trendDateTo, trendGroup, fetchProductTrend]);

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

  // Fetch global products list
  const fetchProducts = useCallback(async (from: string, to: string) => {
    if (!from || !to) return;
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({
        dateFrom: from,
        dateTo: to,
      });
      const res = await fetch(`/api/dashboard/sales/products-global?${params}`);
      if (!res.ok) throw new Error('Error al cargar reporte de productos');
      const json = await res.json();
      setData(json);

      // Auto-select first product if available and nothing is selected
      const productsList = json.breakdown || [];
      if (productsList.length > 0) {
        setSelectedProd(productsList[0]);
      } else {
        setSelectedProd(null);
      }
    } catch (e: any) {
      setError(e.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) fetchProducts(dateFrom, dateTo);
  }, [dateFrom, dateTo, mounted, fetchProducts]);

  // Fetch product breakdown hourly and recent tickets
  const fetchProductDetails = useCallback(async (prodId: number) => {
    setDetailLoading(true);
    try {
      const params = new URLSearchParams({
        id: String(prodId),
        dateFrom,
        dateTo,
      });
      const res = await fetch(`/api/dashboard/sales/product-details?${params}`);
      if (!res.ok) throw new Error('Error al cargar detalles del producto');
      const json = await res.json();
      setHours(json.hours || []);
      setTickets(json.tickets || []);
    } catch (e) {
      console.error(e);
      setHours([]);
      setTickets([]);
    } finally {
      setDetailLoading(false);
    }
  }, [dateFrom, dateTo]);

  useEffect(() => {
    if (selectedProd) {
      fetchProductDetails(selectedProd.id);
    } else {
      setHours([]);
      setTickets([]);
    }
  }, [selectedProd, fetchProductDetails]);

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
  const rawProductsList = useMemo(() => {
    return (data?.breakdown ?? []) as ProductItem[];
  }, [data]);

  const totalSalesFromProducts = useMemo(() => {
    return rawProductsList.reduce((acc, p) => acc + Number(p.total), 0);
  }, [rawProductsList]);

  const totalItemsFromProducts = useMemo(() => {
    return rawProductsList.reduce((acc, p) => acc + Number(p.cantidad), 0);
  }, [rawProductsList]);

  const bestProduct = useMemo(() => {
    if (rawProductsList.length === 0) return null;
    return rawProductsList[0]; // Already sorted by total desc in backend
  }, [rawProductsList]);

  // Search filtered products
  const filteredProducts = useMemo(() => {
    if (!searchTerm) return rawProductsList;
    return rawProductsList.filter(p =>
      p.nombre.toLowerCase().includes(searchTerm.toLowerCase()) ||
      p.categoria.toLowerCase().includes(searchTerm.toLowerCase())
    );
  }, [rawProductsList, searchTerm]);

  const maxHourVal = useMemo(() => {
    if (hours.length === 0) return 1;
    return Math.max(...hours.map(h => Number(h.total)), 1);
  }, [hours]);

  // Export all products to Excel
  const exportAllProducts = () => {
    if (rawProductsList.length === 0) return;

    const formatted = rawProductsList.map((p, idx) => {
      const share = totalSalesFromProducts > 0 ? (p.total / totalSalesFromProducts) * 100 : 0;
      return {
        'Ranking': idx + 1,
        'Producto': p.nombre,
        'Categoría': p.categoria,
        'Ventas Totales ($)': p.total,
        'Unidades Vendidas': p.cantidad,
        'Participación (%)': share.toFixed(2) + '%',
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(formatted);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Resumen Productos');
    XLSX.writeFile(workbook, `Reporte_Productos_Globales_${dateFrom}_a_${dateTo}.xlsx`);
  };

  // Export hours or transactions of selected product to Excel
  const exportProductDetails = () => {
    if (!selectedProd) return;

    if (activeTab === 'horas') {
      if (hours.length === 0) return;
      const sortedHours = [...hours].sort((a, b) => Number(a.hora) - Number(b.hora));
      const formatted = sortedHours.map((h) => ({
        'Hora': `${h.hora}:00 - ${Number(h.hora) + 1}:00`,
        'Ventas Totales ($)': h.total,
        'Unidades Vendidas': h.cantidad,
      }));

      const worksheet = XLSX.utils.json_to_sheet(formatted);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `Horas ${selectedProd.nombre}`);
      XLSX.writeFile(workbook, `Horas_Ventas_Producto_${selectedProd.nombre.replace(/\s+/g, '_')}_${dateFrom}_a_${dateTo}.xlsx`);
    } else {
      if (tickets.length === 0) return;
      const formatted = tickets.map((t) => ({
        'Folio Venta': t.folio,
        'Fecha y Hora': new Date(t.fecha).toLocaleString('es-MX'),
        'Cliente': t.cliente,
        'Cantidad': t.cantidad,
        'Precio ($)': t.precio,
        'Descuento ($)': t.descuento,
        'Total Línea ($)': t.total,
      }));

      const worksheet = XLSX.utils.json_to_sheet(formatted);
      const workbook = XLSX.utils.book_new();
      XLSX.utils.book_append_sheet(workbook, worksheet, `Tickets ${selectedProd.nombre}`);
      XLSX.writeFile(workbook, `Tickets_Ventas_Producto_${selectedProd.nombre.replace(/\s+/g, '_')}_${dateFrom}_a_${dateTo}.xlsx`);
    }
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
          <Package size={34} style={{ color: '#E3A21C' }} />
          <div>
            <h1>Productos Global</h1>
            <p className={styles.subtitle}>Desglose comercial por artículos del menú y mezcla de ventas</p>
          </div>
        </div>

        <div className={styles.actionsGroup}>
          <button
            onClick={exportAllProducts}
            className={styles.exportBtn}
            disabled={rawProductsList.length === 0}
            style={{ opacity: rawProductsList.length === 0 ? 0.6 : 1 }}
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
            <span className={styles.kpiLabel}>Facturado por Productos</span>
            <span className={styles.kpiValue}>{loading ? '—' : fmt(totalSalesFromProducts)}</span>
            <span className={styles.kpiSub}>{activeLabel}</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(20, 157, 146, 0.08)', color: '#149D92' }}>
            <Package size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Unidades Vendidas</span>
            <span className={styles.kpiValue}>{loading ? '—' : totalItemsFromProducts}</span>
            <span className={styles.kpiSub}>platillos preparados</span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(227, 162, 28, 0.08)', color: '#E3A21C' }}>
            <TrendingUp size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Producto Estrella</span>
            <span className={styles.kpiValue}>
              {loading ? '—' : bestProduct ? bestProduct.nombre : 'Sin registros'}
            </span>
            <span className={styles.kpiSub}>
              {bestProduct ? `Venta: ${fmt(bestProduct.total)}` : 'En el período'}
            </span>
          </div>
        </div>

        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(209, 122, 78, 0.08)', color: '#D17A4E' }}>
            <ReceiptText size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Artículos Vendidos</span>
            <span className={styles.kpiValue}>{loading ? '—' : rawProductsList.length}</span>
            <span className={styles.kpiSub}>productos diferentes</span>
          </div>
        </div>
      </div>

      {/* ====== SPLIT GRID ====== */}
      <div className={styles.splitLayout}>
        {/* Left Side: Product Summary List */}
        <div className={styles.listCard}>
          <h3 className={styles.listTitle}>Resumen de Ventas por Producto</h3>

          {/* Client-side Search */}
          <div className={styles.searchBar}>
            <Search size={14} style={{ color: 'var(--text-muted)' }} />
            <input
              type="text"
              placeholder="Buscar por artículo o categoría..."
              value={searchTerm}
              onChange={e => setSearchTerm(e.target.value)}
            />
            {searchTerm && (
              <button
                onClick={() => setSearchTerm('')}
                style={{ background: 'none', border: 'none', cursor: 'pointer', color: 'var(--text-muted)' }}
              >
                <X size={13} />
              </button>
            )}
          </div>

          {loading ? (
            <div className={styles.chartLoading}>
              <div className={styles.spinner} />
              <span>Analizando mezcla de artículos...</span>
            </div>
          ) : filteredProducts.length === 0 ? (
            <div className={styles.chartEmpty}>No se encontraron productos en este período</div>
          ) : (
            <div className={styles.gridList}>
              {filteredProducts.map((p, idx) => {
                const isActive = selectedProd?.id === p.id;
                const share = totalSalesFromProducts > 0 ? (p.total / totalSalesFromProducts) * 100 : 0;

                return (
                  <div
                    key={p.id || idx}
                    className={`${styles.categoryItem} ${isActive ? styles.categoryActive : ''}`}
                    onClick={() => setSelectedProd(p)}
                  >
                    <div className={styles.categoryMeta}>
                      <div>
                        <span className={styles.categoryName}>{p.nombre}</span>
                        <div className={styles.categorySub}>{p.categoria}</div>
                      </div>
                      <span className={styles.categoryTotal}>{fmt(p.total)}</span>
                    </div>

                    <div className={styles.progressBarTrack}>
                      <div className={styles.progressBarFill} style={{ width: `${share}%` }} />
                    </div>

                    <div className={styles.categoryFooter}>
                      <span>{p.cantidad} unidades vendidas</span>
                      <span className={styles.shareTag}>{share.toFixed(1)}% Mix</span>
                    </div>
                  </div>
                );
              })}
            </div>
          )}
        </div>

        {/* Right Side: Product Details Panel */}
        <div className={styles.detailCard}>
          {selectedProd ? (
            <>
              <div className={styles.detailHeader}>
                <div className={styles.detailTitleBlock}>
                  <h3>Detalle de {selectedProd.nombre}</h3>
                  <p>Categoría: {selectedProd.categoria}</p>
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
                    onClick={exportProductDetails}
                    className={styles.detailExportBtn}
                    disabled={activeTab === 'horas' ? hours.length === 0 : tickets.length === 0}
                    style={{
                      opacity:
                        activeTab === 'horas'
                          ? hours.length === 0
                            ? 0.6
                            : 1
                          : tickets.length === 0
                          ? 0.6
                          : 1,
                    }}
                  >
                    <Download size={12} /> Excel
                  </button>
                </div>
              </div>

              {/* Product Mini KPIs */}
              <div className={styles.detailKpis}>
                <div className={styles.detailKpiCard}>
                  <span className={styles.detailKpiLabel}>Venta del Artículo</span>
                  <span className={styles.detailKpiVal} style={{ color: '#E3A21C' }}>
                    {fmt(selectedProd.total)}
                  </span>
                </div>
                <div className={styles.detailKpiCard}>
                  <span className={styles.detailKpiLabel}>Unidades</span>
                  <span className={styles.detailKpiVal} style={{ color: '#149D92' }}>
                    {selectedProd.cantidad} uds
                  </span>
                </div>
              </div>

              {/* Tabs */}
              <div className={styles.tabs}>
                <button
                  className={`${styles.tabBtn} ${activeTab === 'horas' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('horas')}
                >
                  <Clock size={14} /> Horas de Venta
                </button>
                <button
                  className={`${styles.tabBtn} ${activeTab === 'transacciones' ? styles.tabActive : ''}`}
                  onClick={() => setActiveTab('transacciones')}
                >
                  <ReceiptText size={14} /> Ventas Recientes
                </button>
              </div>

              {/* List */}
              <div className={styles.productList}>
                {detailLoading ? (
                  <div className={styles.chartLoading}>
                    <div className={styles.spinner} />
                    <span>Cargando datos del producto...</span>
                  </div>
                ) : activeTab === 'horas' ? (
                  hours.length === 0 ? (
                    <div className={styles.chartEmpty}>Sin ventas registradas por hora</div>
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
                ) : (
                  tickets.length === 0 ? (
                    <div className={styles.chartEmpty}>Sin registros de transacciones para este producto</div>
                  ) : (
                    <div style={{ overflowX: 'auto' }}>
                      <table className={styles.ticketTable}>
                        <thead>
                          <tr>
                            <th>Folio</th>
                            <th>Fecha</th>
                            <th>Cliente</th>
                            <th>Cant</th>
                            <th>Total</th>
                          </tr>
                        </thead>
                        <tbody>
                          {tickets.map((t, idx) => (
                            <tr key={t.IdVenta + '-' + idx}>
                              <td>{t.folio}</td>
                              <td>{new Date(t.fecha).toLocaleDateString('es-MX', { month: 'short', day: 'numeric', hour: '2-digit', minute: '2-digit' })}</td>
                              <td style={{ maxWidth: '80px', overflow: 'hidden', textOverflow: 'ellipsis', whiteSpace: 'nowrap' }} title={t.cliente}>
                                {t.cliente}
                              </td>
                              <td>{t.cantidad}</td>
                              <td>{fmt(t.total)}</td>
                            </tr>
                          ))}
                        </tbody>
                      </table>
                    </div>
                  )
                )}
              </div>
            </>
          ) : (
            <div className={styles.detailPlaceholder}>
              <Layers size={40} style={{ opacity: 0.35, color: '#3D1C02' }} />
              <p>Selecciona un producto a la izquierda para ver su comportamiento detallado.</p>
            </div>
          )}
        </div>
      </div>

      {/* ====== SALES TREND MODAL ====== */}
      {isTrendModalOpen && selectedProd && (
        <div className={styles.modalOverlay} onClick={() => setIsTrendModalOpen(false)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <h3>Tendencias de Venta — {selectedProd.nombre}</h3>
                <p>Evolución temporal del facturado del artículo en el rango seleccionado</p>
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
                    <span>Cargando histórico de ventas...</span>
                  </div>
                ) : trendList.length === 0 ? (
                  <div className={styles.chartEmpty}>
                    No hay registros de ventas para este producto en este rango de fechas.
                  </div>
                ) : (
                  <ProductLineChart
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

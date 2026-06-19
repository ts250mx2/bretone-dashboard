'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Calendar,
  DollarSign,
  ShoppingBag,
  Search,
  Eye,
  X,
  Download,
  Users,
  Tag,
  Clock
} from 'lucide-react';
import * as XLSX from 'xlsx';
import styles from './consumos.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────
type Period = 'today' | 'yesterday' | 'week' | 'month';

interface ConsumptionRow {
  IdConsumo: number;
  FechaConsumo: string;
  IdUsuario: number;
  Usuario: string;
  Subtotal: number;
  Descuento: number;
  Total: number;
  VentaEn: string | null;
}

interface ItemRow {
  IdProducto: number;
  Cantidad: number;
  Precio: number;
  Total: number;
  Iva: number;
  Descripcion: string;
}

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

// Currency formatter MXN
const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n || 0);

// Format date to local readable string
const formatDate = (isoString: string) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export default function EmployeeConsumptionsReport() {
  const [dateFrom, setDateFrom] = useState(() => datesForPeriod('week')[0]); // Default to last 7 days
  const [dateTo, setDateTo] = useState(() => datesForPeriod('week')[1]);
  const [data, setData] = useState<ConsumptionRow[]>([]);
  const [kpis, setKpis] = useState({
    totalMonto: 0,
    totalConsumos: 0,
    uniqueEmployees: 0,
    averageConsumo: 0,
    totalDescuento: 0
  });
  const [searchQuery, setSearchQuery] = useState('');
  const [selectedEmployee, setSelectedEmployee] = useState('all');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  // Detail Modal State
  const [selectedTicket, setSelectedTicket] = useState<ConsumptionRow | null>(null);
  const [ticketItems, setTicketItems] = useState<ItemRow[]>([]);
  const [ticketLoading, setTicketLoading] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch report data for the date range
  const fetchReport = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ dateFrom: from, dateTo: to });
      const res = await fetch(`/api/dashboard/reportes/consumos?${params}`);
      if (!res.ok) throw new Error('Error al cargar datos del reporte de consumos');
      const json = await res.json();
      
      setData(json.data || []);
      if (json.kpis) {
        setKpis(json.kpis);
      }
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

  // Extract unique employees list from data for filtering
  const employeesList = useMemo(() => {
    const map = new Map<number, string>();
    data.forEach(row => {
      if (row.IdUsuario && row.Usuario) {
        map.set(row.IdUsuario, row.Usuario);
      }
    });
    return Array.from(map.entries()).map(([id, name]) => ({ id, name })).sort((a, b) => a.name.localeCompare(b.name));
  }, [data]);

  // Client-side filtering by Employee Dropdown & Search Query
  const filteredData = useMemo(() => {
    let result = data;

    // Filter by dropdown selected employee
    if (selectedEmployee !== 'all') {
      const empId = Number(selectedEmployee);
      result = result.filter(row => row.IdUsuario === empId);
    }

    // Filter by Search Query (name or ticket ID)
    const q = searchQuery.toLowerCase().trim();
    if (q) {
      result = result.filter(row => 
        (row.Usuario || '').toLowerCase().includes(q) ||
        String(row.IdConsumo).includes(q) ||
        (row.VentaEn || '').toLowerCase().includes(q)
      );
    }

    return result;
  }, [data, selectedEmployee, searchQuery]);

  // Recalculated KPIs based on filtered data (so KPIs reflect filters)
  const filteredKpis = useMemo(() => {
    let totalMonto = 0;
    const totalConsumos = filteredData.length;
    const uniqueUsers = new Set();
    let totalDescuento = 0;

    filteredData.forEach(row => {
      totalMonto += Number(row.Total || 0);
      totalDescuento += Number(row.Descuento || 0);
      if (row.IdUsuario) {
        uniqueUsers.add(row.IdUsuario);
      }
    });

    const averageConsumo = totalConsumos > 0 ? totalMonto / totalConsumos : 0;

    return {
      totalMonto,
      totalConsumos,
      uniqueEmployees: uniqueUsers.size,
      averageConsumo,
      totalDescuento
    };
  }, [filteredData]);

  // Fetch ticket item details
  const handleOpenTicketDetails = async (ticket: ConsumptionRow) => {
    setSelectedTicket(ticket);
    setTicketLoading(true);
    try {
      const res = await fetch(`/api/dashboard/reportes/consumos/items?idConsumo=${ticket.IdConsumo}`);
      if (!res.ok) throw new Error('Error al cargar artículos de consumo');
      const json = await res.json();
      setTicketItems(json.data || []);
    } catch (e) {
      console.error(e);
    } finally {
      setTicketLoading(false);
    }
  };

  // Excel Export
  const handleExportExcel = () => {
    if (filteredData.length === 0) return;

    const formatted = filteredData.map((row) => ({
      'Folio Consumo': row.IdConsumo,
      'Fecha / Hora': formatDate(row.FechaConsumo),
      'Empleado / Colaborador': row.Usuario,
      'ID Usuario': row.IdUsuario,
      'Subtotal (MXN)': row.Subtotal,
      'Descuento (MXN)': row.Descuento,
      'Total (MXN)': row.Total,
      'Venta En / Origen': row.VentaEn || 'N/A'
    }));

    const worksheet = XLSX.utils.json_to_sheet(formatted);
    
    // Auto-fit column widths
    const maxLens = Object.keys(formatted[0]).map(key => {
      let maxLen = key.length;
      formatted.forEach(row => {
        const valStr = String((row as any)[key] || '');
        if (valStr.length > maxLen) maxLen = valStr.length;
      });
      return { wch: maxLen + 3 };
    });
    worksheet['!cols'] = maxLens;

    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Consumos Empleados');
    XLSX.writeFile(workbook, `Reporte_Consumos_Empleados_${dateFrom}_a_${dateTo}.xlsx`);
  };

  if (!mounted) {
    return <div className={styles.container} style={{ opacity: 0 }}>Cargando página de consumos...</div>;
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
          <ShoppingBag size={34} style={{ color: 'var(--bretone-gold)' }} />
          <div>
            <h1>Consumos de Empleados</h1>
            <p className={styles.subtitle}>Reporte detallado de consumos internos de colaboradores</p>
          </div>
        </div>

        <div className={styles.actionsGroup}>
          <button
            onClick={handleExportExcel}
            className={styles.exportBtn}
            disabled={filteredData.length === 0}
            style={{ opacity: filteredData.length === 0 ? 0.6 : 1 }}
          >
            <Download size={15} /> Exportar Excel
          </button>
        </div>
      </header>

      {/* ====== FILTERS ====== */}
      <div className={styles.filterCard}>
        <div className={styles.leftFilters}>
          {/* Presets */}
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

          {/* Date range picker */}
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

          {/* Employee dropdown selector */}
          <select
            value={selectedEmployee}
            onChange={e => setSelectedEmployee(e.target.value)}
            className={styles.employeeSelect}
          >
            <option value="all">Todos los Empleados ({employeesList.length})</option>
            {employeesList.map(emp => (
              <option key={emp.id} value={emp.id}>{emp.name}</option>
            ))}
          </select>
        </div>
      </div>

      {error && <div className={styles.errorMsg}>{error}</div>}

      {/* ====== KPIs ROW ====== */}
      <div className={styles.kpiGrid}>
        {/* KPI: Total consumado */}
        <div className={`${styles.kpiCard} kpi-glow-yellow`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(237, 166, 10, 0.08)', color: 'var(--bretone-gold)' }}>
            <DollarSign size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Total Consumido</span>
            <span className={styles.kpiValue} style={{ color: 'var(--bretone-gold)' }}>
              {loading ? '—' : fmt(filteredKpis.totalMonto)}
            </span>
            <span className={styles.kpiSub}>{activeLabel}</span>
          </div>
        </div>

        {/* KPI: Total transacciones */}
        <div className={`${styles.kpiCard} kpi-glow-brown`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(61, 28, 2, 0.08)', color: '#3D1C02' }}>
            <ShoppingBag size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Tickets Generados</span>
            <span className={styles.kpiValue}>{loading ? '—' : filteredKpis.totalConsumos}</span>
            <span className={styles.kpiSub}>Transacciones registradas</span>
          </div>
        </div>

        {/* KPI: Consumo Promedio */}
        <div className={`${styles.kpiCard} kpi-glow-green`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(20, 157, 146, 0.08)', color: '#149D92' }}>
            <Clock size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Consumo Promedio</span>
            <span className={styles.kpiValue} style={{ color: '#149D92' }}>
              {loading ? '—' : fmt(filteredKpis.averageConsumo)}
            </span>
            <span className={styles.kpiSub}>Valor medio de ticket</span>
          </div>
        </div>

        {/* KPI: Descuentos Totales */}
        <div className={`${styles.kpiCard} kpi-glow-red`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(217, 76, 61, 0.08)', color: 'var(--danger)' }}>
            <Tag size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Total Descuentos</span>
            <span className={styles.kpiValue} style={{ color: 'var(--danger)' }}>
              {loading ? '—' : fmt(filteredKpis.totalDescuento)}
            </span>
            <span className={styles.kpiSub}>Monto bonificado</span>
          </div>
        </div>
      </div>

      {/* ====== DATA TABLE CARD ====== */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div className={styles.tableTitleBlock}>
            <h3>Historial de Consumos Internos</h3>
            <p>Lista general de vales de consumo asignados a colaboradores</p>
          </div>
          <div className={styles.tableActions}>
            <div className={styles.tableSearchWrapper}>
              <Search size={14} className={styles.tableSearchIcon} />
              <input
                type="text"
                placeholder="Buscar por empleado o folio..."
                className={styles.tableSearchInput}
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
              {searchQuery && (
                <button className={styles.tableClearSearchBtn} onClick={() => setSearchQuery('')}>
                  <X size={12} />
                </button>
              )}
            </div>
          </div>
        </div>

        {loading ? (
          <div className={styles.chartLoading}>
            <div className={styles.spinner} />
            <span>Consultando historial de consumos de colaboradores...</span>
          </div>
        ) : filteredData.length === 0 ? (
          <div className={styles.chartEmpty}>
            {searchQuery || selectedEmployee !== 'all' 
              ? 'No se encontraron consumos que coincidan con los filtros de búsqueda' 
              : 'No se registraron consumos de empleados en este período'}
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: '100px' }}>Folio</th>
                  <th style={{ width: '220px' }}>Fecha / Hora</th>
                  <th style={{ width: '200px' }}>Colaborador / Empleado</th>
                  <th style={{ textAlign: 'right' }}>Subtotal</th>
                  <th style={{ textAlign: 'right' }}>Descuento</th>
                  <th style={{ textAlign: 'right' }}>Monto Total</th>
                  <th style={{ width: '150px', textAlign: 'center' }}>Origen</th>
                  <th style={{ width: '140px', textAlign: 'center' }}>Acción</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row) => (
                  <tr key={row.IdConsumo}>
                    <td style={{ fontWeight: 800 }}>#{row.IdConsumo}</td>
                    <td className={styles.dateCol}>{formatDate(row.FechaConsumo)}</td>
                    <td className={styles.userCol}>{row.Usuario}</td>
                    <td style={{ textAlign: 'right' }}>{fmt(row.Subtotal)}</td>
                    <td style={{ textAlign: 'right', color: 'var(--danger)' }}>{row.Descuento > 0 ? `-${fmt(row.Descuento)}` : fmt(0)}</td>
                    <td style={{ textAlign: 'right', fontWeight: 800 }}>{fmt(row.Total)}</td>
                    <td style={{ textAlign: 'center' }}>
                      <span className={styles.badgeOrigin}>
                        {row.VentaEn || 'General'}
                      </span>
                    </td>
                    <td style={{ textAlign: 'center' }}>
                      <button
                        onClick={() => handleOpenTicketDetails(row)}
                        className={styles.btnDetail}
                      >
                        <Eye size={12} /> Detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* ====== DETAIL MODAL ====== */}
      {selectedTicket && (
        <div className={styles.modalOverlay} onClick={() => setSelectedTicket(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            {/* Header */}
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <h3>Detalle de Consumo Interno</h3>
                <p className={styles.modalSubtitle}>
                  Folio: #{selectedTicket.IdConsumo} | Colaborador: {selectedTicket.Usuario}
                </p>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setSelectedTicket(null)}>
                <X size={16} />
              </button>
            </div>

            {/* Content loading state */}
            {ticketLoading ? (
              <div className={styles.chartLoading}>
                <div className={styles.spinner} />
                <span>Consultando artículos del consumo...</span>
              </div>
            ) : (
              <>
                <table className={styles.modalTable}>
                  <thead>
                    <tr>
                      <th>Artículo / Producto</th>
                      <th style={{ textAlign: 'center', width: '80px' }}>Cant.</th>
                      <th style={{ textAlign: 'right', width: '120px' }}>Precio Unit.</th>
                      <th style={{ textAlign: 'right', width: '120px' }}>Total</th>
                    </tr>
                  </thead>
                  <tbody>
                    {ticketItems.map((item, idx) => (
                      <tr key={idx}>
                        <td style={{ fontWeight: 700 }}>{item.Descripcion}</td>
                        <td style={{ textAlign: 'center' }}>{item.Cantidad}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(item.Precio)}</td>
                        <td style={{ textAlign: 'right', fontWeight: 700 }}>{fmt(item.Total)}</td>
                      </tr>
                    ))}
                  </tbody>
                </table>

                {/* Summaries in ticket */}
                <div className={styles.ticketTotals}>
                  <div className={styles.totalRow}>
                    <span>Subtotal:</span>
                    <span>{fmt(selectedTicket.Subtotal)}</span>
                  </div>
                  {selectedTicket.Descuento > 0 && (
                    <div className={styles.totalRow} style={{ color: 'var(--danger)' }}>
                      <span>Descuento aplicado:</span>
                      <span>-{fmt(selectedTicket.Descuento)}</span>
                    </div>
                  )}
                  <div className={styles.grandTotalRow}>
                    <span>Total del Consumo:</span>
                    <span>{fmt(selectedTicket.Total)}</span>
                  </div>
                </div>
              </>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

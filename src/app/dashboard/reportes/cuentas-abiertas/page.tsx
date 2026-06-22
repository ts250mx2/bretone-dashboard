'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Clock,
  AlertCircle,
  Eye,
  X,
  RefreshCw,
  Users,
  User,
  DollarSign,
  Download,
  AlertTriangle,
  UtensilsCrossed,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import styles from './cuentas.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────
interface OpenTableRow {
  IdMesa: number;
  Apertura: string;
  Total: number;
  CantidadProductos: number;
  IdMesero: number | null;
  Mesero: string;
  Personas: number;
}

interface ItemRow {
  Descripcion: string;
  Cantidad: number;
  Precio: number;
  Descuento: number;
  Total: number;
}

// Helper to format currency
const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n || 0);

// La numeración real de mesa es IdMesa + 1 (el POS guarda el índice base 0)
const mesaLabel = (idMesa: number) => `Mesa ${idMesa + 1}`;

// Format date to local time (HH:MM:SS)
const formatTimeOnly = (dateStr: string) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())} hrs`;
};

// Compact local time (HH:MM) for the cards
const formatShortTime = (dateStr: string) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${pad(d.getHours())}:${pad(d.getMinutes())}`;
};

// Format date to local full datetime
const formatFullDateTime = (dateStr: string) => {
  if (!dateStr) return '—';
  const d = new Date(dateStr);
  if (isNaN(d.getTime())) return '—';
  const day = String(d.getDate()).padStart(2, '0');
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const year = d.getFullYear();
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${day}/${month}/${year} ${pad(d.getHours())}:${pad(d.getMinutes())} hrs`;
};

// ─── Elapsed Time Live Component ─────────────────────────────────────────────
function ElapsedTimer({ startDateStr }: { startDateStr: string }) {
  const [elapsed, setElapsed] = useState({ h: 0, m: 0, s: 0, rawMins: 0 });

  const calculateElapsed = useCallback(() => {
    if (!startDateStr) return;
    const start = new Date(startDateStr).getTime();
    const now = new Date().getTime();
    const diffMs = Math.max(0, now - start);

    const totalSeconds = Math.floor(diffMs / 1000);
    const totalMinutes = Math.floor(totalSeconds / 60);
    const h = Math.floor(totalMinutes / 60);
    const m = totalMinutes % 60;
    const s = totalSeconds % 60;

    setElapsed({ h, m, s, rawMins: totalMinutes });
  }, [startDateStr]);

  useEffect(() => {
    calculateElapsed();
    const interval = setInterval(calculateElapsed, 1000);
    return () => clearInterval(interval);
  }, [calculateElapsed]);

  const pad = (n: number) => String(n).padStart(2, '0');

  // Determine severity style class
  let timerClass = styles.timerGreen;
  if (elapsed.rawMins >= 60) {
    timerClass = styles.timerRed;
  } else if (elapsed.rawMins >= 30) {
    timerClass = styles.timerOrange;
  }

  return (
    <span className={`${styles.timerBadge} ${timerClass}`}>
      <Clock size={12} />
      {pad(elapsed.h)}:{pad(elapsed.m)}:{pad(elapsed.s)}
    </span>
  );
}

// ─── Main Page ───────────────────────────────────────────────────────────────
export default function OpenAccountsReport() {
  const [data, setData] = useState<OpenTableRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  // Detail Modal State
  const [selectedTable, setSelectedTable] = useState<OpenTableRow | null>(null);
  const [ticketItems, setTicketItems] = useState<ItemRow[]>([]);
  const [ticketMesero, setTicketMesero] = useState<string>('Sin asignar');
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketError, setTicketError] = useState('');

  const fetchOpenAccounts = useCallback(async () => {
    setLoading(true);
    setError('');
    try {
      const res = await fetch('/api/dashboard/reportes/cuentas-abiertas');
      if (!res.ok) throw new Error('Error al cargar datos del servidor');
      const json = await res.json();
      if (json.success) {
        setData(json.data || []);
      } else {
        throw new Error(json.error || 'Error de base de datos');
      }
    } catch (e: any) {
      setError(e.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    setMounted(true);
    fetchOpenAccounts();

    // Auto-refresh data every 30 seconds
    const interval = setInterval(fetchOpenAccounts, 30000);
    return () => clearInterval(interval);
  }, [fetchOpenAccounts]);

  // Client-side search filtering (por número de mesa o mesero)
  const filteredData = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return data;
    return data.filter(row =>
      mesaLabel(row.IdMesa).toLowerCase().includes(q) ||
      String(row.IdMesa + 1).includes(q) ||
      (row.Mesero || '').toLowerCase().includes(q)
    );
  }, [data, searchQuery]);

  // Open the detail modal for a table and load its products + waiter
  const handleOpenTable = useCallback(async (row: OpenTableRow) => {
    setSelectedTable(row);
    setTicketLoading(true);
    setTicketError('');
    setTicketItems([]);
    setTicketMesero(row.Mesero || 'Sin asignar');
    try {
      const params = new URLSearchParams({ mesa: String(row.IdMesa) });
      const res = await fetch(`/api/dashboard/reportes/cuentas-abiertas?${params}`);
      if (!res.ok) throw new Error('Error al cargar el detalle de la mesa');
      const json = await res.json();
      if (json.success) {
        setTicketItems(json.data || []);
        if (json.mesero) setTicketMesero(json.mesero);
      } else {
        throw new Error(json.error || 'Error al obtener productos');
      }
    } catch (err: any) {
      setTicketError(err.message || 'Error de conexión');
    } finally {
      setTicketLoading(false);
    }
  }, []);

  // KPIs
  const totalMesas = data.length;

  const totalMontoAbierto = useMemo(() => {
    return data.reduce((acc, row) => acc + Number(row.Total), 0);
  }, [data]);

  // Calculate average open duration in minutes
  const avgDurationMinutes = useMemo(() => {
    if (data.length === 0) return 0;
    const now = new Date().getTime();
    const sum = data.reduce((acc, row) => {
      const start = new Date(row.Apertura).getTime();
      return acc + (now - start);
    }, 0);
    return Math.floor((sum / data.length) / 60000);
  }, [data]);

  // Find the oldest open table (computed by earliest Apertura, independent of list order)
  const oldestTable = useMemo(() => {
    if (data.length === 0) return null;
    return data.reduce((oldest, row) =>
      new Date(row.Apertura).getTime() < new Date(oldest.Apertura).getTime() ? row : oldest
    );
  }, [data]);

  const oldestMinutes = useMemo(() => {
    if (!oldestTable) return 0;
    const start = new Date(oldestTable.Apertura).getTime();
    const now = new Date().getTime();
    return Math.floor((now - start) / 60000);
  }, [oldestTable]);

  // Excel Export
  const handleExportExcel = () => {
    if (filteredData.length === 0) return;

    const formatted = filteredData.map((row) => {
      const durationMs = new Date().getTime() - new Date(row.Apertura).getTime();
      const durationMins = Math.floor(durationMs / 60000);
      return {
        'Mesa': mesaLabel(row.IdMesa),
        'Mesero / Atiende': row.Mesero,
        'Comensales': row.Personas,
        'Artículos Pedidos': row.CantidadProductos,
        'Monto Acumulado ($)': row.Total,
        'Hora de Apertura': formatFullDateTime(row.Apertura),
        'Minutos Abierta': durationMins,
      };
    });

    const worksheet = XLSX.utils.json_to_sheet(formatted);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Cuentas Abiertas');
    XLSX.writeFile(workbook, `Reporte_Cuentas_Abiertas_${new Date().toISOString().split('T')[0]}.xlsx`);
  };

  if (!mounted) {
    return <div className={styles.container} style={{ opacity: 0 }}>Cargando módulo de cuentas abiertas...</div>;
  }

  return (
    <div className={styles.container}>
      {/* ====== HEADER ====== */}
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <Clock size={34} style={{ color: 'var(--bretone-gold)' }} />
          <div>
            <h1>Monitoreo de Cuentas Abiertas</h1>
            <p className={styles.subtitle}>Mesas activas en tiempo real con su tiempo de ocupación</p>
          </div>
        </div>

        <div className={styles.actionsGroup}>
          <button onClick={fetchOpenAccounts} className={styles.refreshBtn}>
            <RefreshCw size={14} /> Refrescar
          </button>
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

      {error && (
        <div className={styles.errorMsg}>
          <AlertTriangle size={18} style={{ marginRight: '0.5rem' }} />
          {error}
        </div>
      )}

      {/* ====== KPIs ROW ====== */}
      <div className={styles.kpiGrid}>
        {/* KPI: Mesas Activas */}
        <div className={`${styles.kpiCard} kpi-glow-brown`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(61, 28, 2, 0.08)', color: '#3D1C02' }}>
            <UtensilsCrossed size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Mesas Activas</span>
            <span className={styles.kpiValue}>{loading ? '—' : totalMesas}</span>
            <span className={styles.kpiSub}>Cuentas abiertas en el comedor</span>
          </div>
        </div>

        {/* KPI: Monto Acumulado */}
        <div className={`${styles.kpiCard} kpi-glow-yellow`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(237, 166, 10, 0.08)', color: 'var(--bretone-gold)' }}>
            <DollarSign size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Monto Abierto</span>
            <span className={styles.kpiValue} style={{ color: 'var(--bretone-gold)' }}>
              {loading ? '—' : fmt(totalMontoAbierto)}
            </span>
            <span className={styles.kpiSub}>Consumo en proceso</span>
          </div>
        </div>

        {/* KPI: Tiempo Promedio */}
        <div className={`${styles.kpiCard} kpi-glow-green`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(34, 197, 94, 0.08)', color: '#2E6F40' }}>
            <Clock size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Permanencia Promedio</span>
            <span className={styles.kpiValue} style={{ color: '#2E6F40' }}>
              {loading ? '—' : totalMesas > 0 ? `${avgDurationMinutes} min` : '0 min'}
            </span>
            <span className={styles.kpiSub}>Tiempo de ocupación medio</span>
          </div>
        </div>

        {/* KPI: Mayor Espera */}
        <div className={`${styles.kpiCard} kpi-glow-red`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(217, 76, 61, 0.08)', color: 'var(--danger)' }}>
            <AlertCircle size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Mayor Espera</span>
            <span className={styles.kpiValue} style={{ color: oldestMinutes >= 30 ? 'var(--danger)' : 'var(--text)' }}>
              {loading ? '—' : oldestTable ? `${oldestMinutes} min` : '0 min'}
            </span>
            <span className={styles.kpiSub}>
              {oldestTable ? mesaLabel(oldestTable.IdMesa) : 'Sin cuentas'}
            </span>
          </div>
        </div>
      </div>

      {/* ====== DATA TABLE CARD ====== */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div className={styles.tableTitleBlock}>
            <h3>Mesas Abiertas en el Establecimiento</h3>
            <p>Toca una mesa para ver su comanda y el mesero que la atiende</p>
          </div>
          <div className={styles.tableActions}>
            <div className={styles.tableSearchWrapper}>
              <Users size={14} className={styles.tableSearchIcon} />
              <input
                type="text"
                placeholder="Buscar por mesa o mesero..."
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
            <span>Consultando mesas abiertas en la base de datos...</span>
          </div>
        ) : filteredData.length === 0 ? (
          <div className={styles.chartEmpty}>
            {searchQuery ? 'No se encontraron mesas que coincidan con la búsqueda' : 'No hay mesas abiertas en este momento'}
          </div>
        ) : (
          <div className={styles.cardsGrid}>
            {filteredData.map((row) => (
              <button
                key={row.IdMesa}
                className={styles.mesaCard}
                onClick={() => handleOpenTable(row)}
              >
                <div className={styles.mesaCardTop}>
                  <span className={styles.mesaCardTitle}>
                    <UtensilsCrossed size={18} /> {mesaLabel(row.IdMesa)}
                  </span>
                  <ElapsedTimer startDateStr={row.Apertura} />
                </div>

                <div className={styles.mesaCardMesero}>
                  <User size={13} /> {row.Mesero}
                </div>

                <div className={styles.mesaCardAmount}>{fmt(row.Total)}</div>

                <div className={styles.mesaCardStats}>
                  <div className={styles.mesaCardStat}>
                    <span className={styles.mesaCardStatLabel}>Personas</span>
                    <span className={styles.mesaCardStatValue}>
                      <Users size={12} style={{ verticalAlign: '-2px', marginRight: 3 }} />
                      {row.Personas}
                    </span>
                  </div>
                  <div className={styles.mesaCardStat}>
                    <span className={styles.mesaCardStatLabel}>Productos</span>
                    <span className={styles.mesaCardStatValue}>{row.CantidadProductos} uds</span>
                  </div>
                  <div className={styles.mesaCardStat}>
                    <span className={styles.mesaCardStatLabel}>Apertura</span>
                    <span className={styles.mesaCardStatValue}>{formatShortTime(row.Apertura)} hrs</span>
                  </div>
                </div>

                <div className={styles.mesaCardFooter}>
                  <Eye size={13} /> Ver comanda
                </div>
              </button>
            ))}
          </div>
        )}
      </div>

      {/* ====== DETAIL MODAL ====== */}
      {selectedTable && (
        <div className={styles.modalOverlay} onClick={() => setSelectedTable(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <h3>Comanda de la {mesaLabel(selectedTable.IdMesa)}</h3>
                <p className={styles.modalSubtitle}>
                  Mesero: {ticketMesero} · {selectedTable.Personas} {selectedTable.Personas === 1 ? 'persona' : 'personas'} · Abierta a las {formatTimeOnly(selectedTable.Apertura)}
                </p>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setSelectedTable(null)}>
                <X size={16} />
              </button>
            </div>

            {ticketLoading ? (
              <div className={styles.chartLoading}>
                <div className={styles.spinner} />
                <span>Consultando artículos comandados...</span>
              </div>
            ) : ticketError ? (
              <div className={styles.errorMsg}>
                <AlertTriangle size={18} style={{ marginRight: '0.5rem' }} />
                {ticketError}
              </div>
            ) : ticketItems.length === 0 ? (
              <div className={styles.chartEmpty}>Esta mesa no tiene productos registrados</div>
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

                <div className={styles.ticketTotals}>
                  <div className={styles.totalRow}>
                    <span>Artículos Totales:</span>
                    <span>{ticketItems.reduce((acc, curr) => acc + Number(curr.Cantidad), 0)} uds</span>
                  </div>
                  <div className={styles.grandTotalRow}>
                    <span>Total de la Cuenta:</span>
                    <span>{fmt(selectedTable.Total)}</span>
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

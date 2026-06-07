'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Search,
  Calendar,
  RefreshCw,
  X,
  ReceiptText,
  Ban,
  Printer,
  Clipboard,
  Check,
  Eye,
  ChevronRight,
  User,
  ShieldAlert,
  FileSpreadsheet,
  DollarSign,
  TrendingUp,
  Percent,
  AlertTriangle
} from 'lucide-react';
import * as XLSX from 'xlsx';
import styles from './operaciones.module.css';

// ─── Helpers ─────────────────────────────────────────────────────────────────
const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n || 0);

const getLocalDateString = (d: Date = new Date()) => {
  const year = d.getFullYear();
  const month = String(d.getMonth() + 1).padStart(2, '0');
  const day = String(d.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
};

export default function OperacionesPage() {
  const [date, setDate] = useState(() => getLocalDateString());
  const [searchQuery, setSearchQuery] = useState('');
  const [operations, setOperations] = useState<any[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  // Modals state
  const [activeModal, setActiveModal] = useState<'ventas' | 'cancelaciones' | 'corte' | null>(null);
  const [selectedSession, setSelectedSession] = useState<any | null>(null);

  // Sales modal state
  const [salesList, setSalesList] = useState<any[]>([]);
  const [salesLoading, setSalesLoading] = useState(false);
  const [salesError, setSalesError] = useState('');

  // Ticket detail state (nested modal)
  const [selectedTicket, setSelectedTicket] = useState<any | null>(null);
  const [ticketItems, setTicketItems] = useState<any[]>([]);
  const [ticketLoading, setTicketLoading] = useState(false);
  const [ticketError, setTicketError] = useState('');

  // Cancellation modal state
  const [cancellationList, setCancellationList] = useState<any[]>([]);
  const [cancellationsLoading, setCancellationsLoading] = useState(false);
  const [cancellationsError, setCancellationsError] = useState('');

  // Z-Cut modal state
  const [closingTicketText, setClosingTicketText] = useState('');
  const [closingTicketLoading, setClosingTicketLoading] = useState(false);
  const [closingTicketError, setClosingTicketError] = useState('');
  const [copied, setCopied] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // ─── Fetch main operations ──────────────────────────────────────────────────
  const fetchOperations = useCallback(async (targetDate: string) => {
    if (!targetDate) return;
    setLoading(true);
    setError('');
    try {
      const res = await fetch(`/api/dashboard/operations?fecha=${targetDate}`);
      if (!res.ok) throw new Error('Error al obtener la lista de operaciones');
      const data = await res.json();
      setOperations(data);
    } catch (err: any) {
      setError(err.message || 'Error de conexión');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    if (mounted) {
      fetchOperations(date);
    }
  }, [date, mounted, fetchOperations]);

  const handlePreset = (preset: 'today' | 'yesterday') => {
    const d = new Date();
    if (preset === 'yesterday') {
      d.setDate(d.getDate() - 1);
    }
    setDate(getLocalDateString(d));
  };

  // ─── Client-side filter ─────────────────────────────────────────────────────
  const filteredOperations = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return operations;
    return operations.filter(
      op =>
        String(op.id).toLowerCase().includes(q) ||
        String(op.caja).toLowerCase().includes(q) ||
        String(op.cajero).toLowerCase().includes(q) ||
        String(op.supervisorApertura).toLowerCase().includes(q) ||
        String(op.supervisorCierre).toLowerCase().includes(q)
    );
  }, [operations, searchQuery]);

  // ─── Open sales details ─────────────────────────────────────────────────────
  const handleOpenVentas = async (session: any) => {
    setSelectedSession(session);
    setActiveModal('ventas');
    setSalesLoading(true);
    setSalesError('');
    setSalesList([]);
    try {
      // API expects startDate, endDate, and optional idApertura
      const params = new URLSearchParams({
        startDate: date,
        endDate: date,
        idApertura: String(session.id),
      });
      const res = await fetch(`/api/ventas-detalle?${params}`);
      if (!res.ok) throw new Error('Error al obtener el detalle de ventas');
      const result = await res.json();
      if (result.success) {
        setSalesList(result.data || []);
      } else {
        throw new Error(result.error || 'Error al procesar consulta');
      }
    } catch (err: any) {
      setSalesError(err.message || 'Fallo de conexión');
    } finally {
      setSalesLoading(false);
    }
  };

  // ─── Open ticket product breakdown ──────────────────────────────────────────
  const handleOpenTicketItems = async (ticket: any) => {
    setSelectedTicket(ticket);
    setTicketLoading(true);
    setTicketError('');
    setTicketItems([]);
    try {
      const res = await fetch(`/api/ventas-items?idVenta=${ticket.IdVenta}&idApertura=${ticket.IdApertura}`);
      if (!res.ok) throw new Error('Error al obtener productos del ticket');
      const result = await res.json();
      if (result.success) {
        setTicketItems(result.data || []);
      } else {
        throw new Error(result.error || 'Error de base de datos');
      }
    } catch (err: any) {
      setTicketError(err.message || 'Fallo de conexión');
    } finally {
      setTicketLoading(false);
    }
  };

  // ─── Open cancellations modal ──────────────────────────────────────────────
  const handleOpenCancelaciones = async (session: any) => {
    setSelectedSession(session);
    setActiveModal('cancelaciones');
    setCancellationsLoading(true);
    setCancellationsError('');
    setCancellationList([]);
    try {
      const params = new URLSearchParams({
        fechaInicio: date,
        fechaFin: date,
        idApertura: String(session.id),
      });
      const res = await fetch(`/api/dashboard/cancellation-details?${params}`);
      if (!res.ok) throw new Error('Error al obtener cancelaciones');
      const data = await res.json();
      setCancellationList(data || []);
    } catch (err: any) {
      setCancellationsError(err.message || 'Fallo de conexión');
    } finally {
      setCancellationsLoading(false);
    }
  };

  // ─── Open Z-Cut ticket modal ────────────────────────────────────────────────
  const handleOpenClosingTicket = async (session: any) => {
    setSelectedSession(session);
    setActiveModal('corte');
    setClosingTicketLoading(true);
    setClosingTicketError('');
    setClosingTicketText('');
    setCopied(false);
    try {
      const res = await fetch(`/api/dashboard/closing-ticket?idApertura=${session.id}&idCaja=${session.caja}`);
      if (!res.ok) throw new Error('Error al generar ticket de arqueo');
      const data = await res.json();
      if (data.error) {
        throw new Error(data.error);
      }
      setClosingTicketText(data.ticket || '');
    } catch (err: any) {
      setClosingTicketError(err.message || 'Error de conexión');
    } finally {
      setClosingTicketLoading(false);
    }
  };

  const handleCopyTicket = () => {
    if (!closingTicketText) return;
    navigator.clipboard.writeText(closingTicketText);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  };

  const handlePrintTicket = () => {
    const printWindow = window.open('', '_blank');
    if (!printWindow) return;
    printWindow.document.write(`
      <html>
        <head>
          <title>Corte Z - Sesion ${selectedSession?.id}</title>
          <style>
            body { font-family: monospace; white-space: pre-wrap; font-size: 14px; padding: 20px; }
          </style>
        </head>
        <body>${closingTicketText}</body>
      </html>
    `);
    printWindow.document.close();
    printWindow.focus();
    printWindow.print();
    printWindow.close();
  };

  // ─── Excel Exports ──────────────────────────────────────────────────────────
  const handleExportSales = () => {
    if (!salesList || salesList.length === 0) return;
    const formatted = salesList.map(item => ({
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
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Ventas');
    XLSX.writeFile(workbook, `Ventas_Sesion_${selectedSession?.id || ''}.xlsx`);
  };

  const handleExportCancellations = () => {
    if (!cancellationList || cancellationList.length === 0) return;
    const formatted = cancellationList.map(item => ({
      'Z': item.Z,
      'Folio Cancelación': item['Folio Cancelacion'],
      'Fecha Cancelación': new Date(item.FechaCancelacion).toLocaleString('es-MX'),
      'Código de Barras': item['Codigo Barras'],
      'Descripción': item.Descripcion,
      'Cantidad': item.Cantidad,
      'Precio Venta': item['Precio Venta'],
      'Total': item.Total,
      'Cajero': item.Cajero,
      'Supervisor': item.Supervisor,
    }));
    const worksheet = XLSX.utils.json_to_sheet(formatted);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Cancelaciones');
    XLSX.writeFile(workbook, `Cancelaciones_Sesion_${selectedSession?.id || ''}.xlsx`);
  };

  if (!mounted) {
    return <div className={styles.container} style={{ opacity: 0 }}>Cargando panel de operaciones...</div>;
  }

  return (
    <div className={styles.container}>
      {/* ====== HEADER ====== */}
      <header className={styles.header}>
        <div className={styles.titleGroup}>
          <ReceiptText size={32} style={{ color: '#3D1C02' }} />
          <div>
            <h1>Monitoreo de Operaciones</h1>
            <p className={styles.subtitle}>Supervisión en tiempo real de cajas, fondos, ventas y auditoría Z</p>
          </div>
        </div>

        <div className={styles.actionsGroup}>
          <div className={styles.statusIndicator}>
            <span className={styles.statusDot} />
            <span>Sistema Online</span>
          </div>
        </div>
      </header>

      {/* ====== FILTER & SEARCH CARD ====== */}
      <div className={styles.filterCard}>
        <div className={styles.leftFilters}>
          <div className={styles.presets}>
            <button
              className={`${styles.presetBtn} ${getLocalDateString() === date ? styles.presetActive : ''}`}
              onClick={() => handlePreset('today')}
            >
              <Calendar size={13} />
              Hoy
            </button>
            <button
              className={`${styles.presetBtn} ${getLocalDateString(new Date(Date.now() - 86400000)) === date ? styles.presetActive : ''}`}
              onClick={() => handlePreset('yesterday')}
            >
              <Calendar size={13} />
              Ayer
            </button>
          </div>

          <div className={styles.dateInputWrapper}>
            <input
              type="date"
              value={date}
              onChange={e => setDate(e.target.value)}
              className={styles.dateInput}
            />
          </div>

          <button className={styles.refreshBtn} onClick={() => fetchOperations(date)} title="Refrescar datos">
            <RefreshCw size={14} />
          </button>
        </div>

        <div className={styles.rightFilters}>
          <div className={styles.searchWrapper}>
            <Search size={14} className={styles.searchIcon} />
            <input
              type="text"
              placeholder="Buscar por cajero, supervisor o terminal..."
              className={styles.searchInput}
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
            {searchQuery && (
              <button className={styles.clearSearchBtn} onClick={() => setSearchQuery('')}>
                <X size={12} />
              </button>
            )}
          </div>
        </div>
      </div>

      {error && (
        <div style={{ padding: '1rem', background: '#fee2e2', color: '#b91c1c', borderRadius: '12px', marginBottom: '1.5rem', fontWeight: 600, display: 'flex', gap: '0.5rem', alignItems: 'center' }}>
          <AlertTriangle size={18} />
          {error}
        </div>
      )}

      {/* ====== SESSIONS KANBAN BOARD ====== */}
      <div className={styles.kanbanBoard}>
        <div className={styles.kanbanHeaders}>
          <div className={styles.columnHeader}>Sesión / Cajero</div>
          <div className={styles.columnHeader}>Fondo Inicial</div>
          <div className={styles.columnHeader}>Ventas Turno</div>
          <div className={styles.columnHeader}>Cancelaciones</div>
          <div className={styles.columnHeader}>Auditoría y Arqueo</div>
        </div>

        <div className={styles.kanbanRows}>
          {loading ? (
            <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', gap: '0.75rem', padding: '5rem 0' }}>
              <div className={styles.openPulse} style={{ width: '12px', height: '12px' }} />
              <span style={{ fontSize: '0.85rem', color: 'var(--text-muted)', fontWeight: 600 }}>Obteniendo flujos de caja...</span>
            </div>
          ) : filteredOperations.length === 0 ? (
            <div className={styles.emptyState}>
              <ReceiptText size={48} style={{ opacity: 0.2, color: 'var(--text)' }} />
              <span>No se encontraron sesiones de caja activas ni cerradas para este día.</span>
            </div>
          ) : (
            filteredOperations.map(op => {
              const totalVentas = op.ventas;
              const hasDiscrepancy = op.corteTerminado && (op.efectivoCierre - (op.fondoCaja + op.ventas)) !== 0;

              return (
                <div key={op.id} className={styles.kanbanRow}>
                  {/* Column 1: Info General */}
                  <div className={styles.cell}>
                    <div className={styles.card}>
                      <div className={styles.cardHeader}>
                        <span className={styles.cardTitle}>Z-{op.id}</span>
                        {op.corteTerminado ? (
                          <span className={`${styles.badge} ${styles.badgeEspresso}`}>Cerrada</span>
                        ) : (
                          <div style={{ display: 'flex', alignItems: 'center', gap: '0.35rem' }}>
                            <span className={`${styles.badge} ${styles.badgeOrange}`}>Activa</span>
                            <span className={styles.openPulse} />
                          </div>
                        )}
                      </div>
                      <div>
                        <div className={styles.cardLabel}>Caja</div>
                        <div className={styles.cardText} style={{ fontWeight: 800 }}>Terminal {op.caja}</div>
                      </div>
                      <div>
                        <div className={styles.cardLabel}>Cajero</div>
                        <div className={styles.cardText} style={{ display: 'flex', alignItems: 'center', gap: '0.3rem' }}>
                          <User size={12} style={{ color: 'var(--text-muted)' }} />
                          {op.cajero}
                        </div>
                      </div>
                      <div className={styles.cardGrid}>
                        <div>
                          <div className={styles.cardLabel}>Apertura</div>
                          <div className={styles.cardText} style={{ fontSize: '0.72rem' }}>{op.horaApertura} hrs</div>
                        </div>
                        <div>
                          <div className={styles.cardLabel}>Cierre</div>
                          <div className={styles.cardText} style={{ fontSize: '0.72rem' }}>{op.horaCierre || '—'}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Column 2: Apertura */}
                  <div className={styles.cell}>
                    <div className={styles.card}>
                      <div className={styles.cardHeader}>
                        <span className={styles.cardLabel}>Apertura</span>
                      </div>
                      <div>
                        <div className={styles.cardLabel}>Fondo de Caja</div>
                        <div className={styles.cardTitleLarge} style={{ color: '#3D1C02' }}>{fmt(op.fondoCaja)}</div>
                      </div>
                      <div>
                        <div className={styles.cardLabel}>Autorizó Apertura</div>
                        <div className={styles.cardText} style={{ fontSize: '0.72rem' }}>{op.supervisorApertura}</div>
                      </div>
                    </div>
                  </div>

                  {/* Column 3: Ventas Turno */}
                  <div className={styles.cell}>
                    <div className={`${styles.card} ${styles.clickableCard}`} onClick={() => handleOpenVentas(op)} title="Ver detalle de ventas">
                      <div className={styles.cardHeader}>
                        <span className={styles.cardLabel} style={{ color: '#149D92' }}>Ventas</span>
                        <ChevronRight size={14} style={{ color: '#149D92' }} />
                      </div>
                      <div>
                        <div className={styles.cardLabel}>Facturado Total</div>
                        <div className={styles.cardTitleLarge} style={{ color: '#149D92' }}>{fmt(totalVentas)}</div>
                      </div>
                      <div className={styles.cardGrid}>
                        <div>
                          <div className={styles.cardLabel}>Tickets</div>
                          <div className={styles.cardText}>{op.ventasCount} uds</div>
                        </div>
                        <div>
                          <div className={styles.cardLabel}>Promedio</div>
                          <div className={styles.cardText}>{fmt(op.ticketPromedio)}</div>
                        </div>
                      </div>
                    </div>
                  </div>

                  {/* Column 4: Cancelaciones */}
                  <div className={styles.cell}>
                    <div className={`${styles.card} ${styles.clickableCard}`} onClick={() => handleOpenCancelaciones(op)} title="Ver auditoría de cancelaciones">
                      <div className={styles.cardHeader}>
                        <span className={styles.cardLabel} style={{ color: 'var(--danger)' }}>Cancelaciones</span>
                        <ChevronRight size={14} style={{ color: 'var(--danger)' }} />
                      </div>
                      <div>
                        <div className={styles.cardLabel}>Monto Cancelado</div>
                        <div className={styles.cardTitleLarge} style={{ color: 'var(--danger)' }}>{fmt(op.cancelacionesMonto)}</div>
                      </div>
                      <div>
                        <div className={styles.cardLabel}>Movimientos</div>
                        <div className={styles.cardText} style={{ color: 'var(--danger)', fontWeight: 800 }}>{op.cancelaciones} oper.</div>
                      </div>
                    </div>
                  </div>

                  {/* Column 5: Auditoría */}
                  <div className={styles.cell}>
                    <div className={styles.card}>
                      <div className={styles.cardHeader}>
                        <span className={styles.cardLabel}>Corte / Arqueo</span>
                      </div>
                      {op.corteTerminado ? (
                        <>
                          <div>
                            <div className={styles.cardLabel}>Efectivo Declarado</div>
                            <div className={styles.cardText} style={{ fontWeight: 800, fontSize: '0.85rem' }}>{fmt(op.efectivoCierre)}</div>
                          </div>
                          <div>
                            <div className={styles.cardLabel}>Discrepancia</div>
                            <div className={styles.cardText} style={{
                              fontWeight: 800,
                              color: (op.efectivoCierre - (op.fondoCaja + op.ventas)) === 0 ? '#0F7F76' : 'var(--danger)'
                            }}>
                              {fmt(op.efectivoCierre - (op.fondoCaja + op.ventas))}
                            </div>
                          </div>
                        </>
                      ) : (
                        <div className={styles.openStatus}>
                          <span className={styles.openPulse} />
                          <span>Caja en Curso</span>
                        </div>
                      )}
                      <button
                        onClick={() => handleOpenClosingTicket(op)}
                        style={{
                          width: '100%',
                          padding: '0.45rem',
                          borderRadius: '8px',
                          border: '1px solid rgba(61, 28, 2, 0.12)',
                          background: 'var(--surface-2)',
                          fontSize: '0.72rem',
                          fontWeight: 700,
                          cursor: 'pointer',
                          marginTop: '0.25rem',
                          display: 'flex',
                          alignItems: 'center',
                          justifyContent: 'center',
                          gap: '0.35rem',
                          color: 'var(--text)'
                        }}
                      >
                        <Printer size={12} />
                        Ver Ticket Z
                      </button>
                    </div>
                  </div>
                </div>
              );
            })
          )}
        </div>
      </div>

      <div className={styles.bottomBar}>
        <div style={{ display: 'flex', gap: '1rem' }}>
          <span>Total Sesiones del día: {operations.length}</span>
          <span>Abiertas: {operations.filter(o => !o.corteTerminado).length}</span>
          <span>Cerradas: {operations.filter(o => o.corteTerminado).length}</span>
        </div>
        <span>La Petite Bretonne Country</span>
      </div>

      {/* =======================================================================
          MODAL 1: VENTAS DETAIL
          ======================================================================= */}
      {activeModal === 'ventas' && selectedSession && (
        <div className={styles.modalOverlay} onClick={() => setActiveModal(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ maxWidth: '900px' }}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <h3>Tickets de Venta — Sesión Z-{selectedSession.id}</h3>
                <p>Caja: Terminal {selectedSession.caja} | Cajero: {selectedSession.cajero}</p>
              </div>
              <div className={styles.modalActions}>
                <button className={styles.modalExportBtn} onClick={handleExportSales}>
                  <FileSpreadsheet size={13} />
                  Exportar Excel
                </button>
                <button className={styles.modalCloseBtn} onClick={() => setActiveModal(null)}>
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className={styles.modalBody}>
              {salesLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem 0', gap: '0.75rem' }}>
                  <div className={styles.openPulse} />
                  <span>Obteniendo lista de tickets...</span>
                </div>
              ) : salesError ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>
                  <ShieldAlert size={32} style={{ margin: '0 auto 1rem' }} />
                  {salesError}
                </div>
              ) : salesList.length === 0 ? (
                <div className={styles.emptyState}>No hay tickets registrados en esta sesión.</div>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Folio</th>
                        <th>Fecha / Hora</th>
                        <th>Cliente</th>
                        <th style={{ textAlign: 'center' }}>Productos</th>
                        <th style={{ textAlign: 'right' }}>Efectivo</th>
                        <th style={{ textAlign: 'right' }}>Tarjeta</th>
                        <th style={{ textAlign: 'right' }}>Total Venta</th>
                        <th style={{ textAlign: 'center' }}>Productos</th>
                      </tr>
                    </thead>
                    <tbody>
                      {salesList.map(sale => (
                        <tr key={sale['Folio Venta'] || `${sale.IdApertura || 1}-${sale.IdVenta}`}>
                          <td style={{ fontWeight: 800 }}>{sale['Folio Venta'] || `${sale.IdApertura || 1}-${sale.IdVenta}`}</td>
                          <td>{new Date(sale.FechaVenta).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} hrs</td>
                          <td>{sale.Cliente}</td>
                          <td style={{ textAlign: 'center' }}>{sale.Productos} uds</td>
                          <td style={{ textAlign: 'right' }}>{fmt(sale['Pago Efectivo'])}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(sale['Pago Tarjeta'])}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: '#149D92' }}>{fmt(sale.Total)}</td>
                          <td style={{ textAlign: 'center' }}>
                            <button
                              onClick={() => handleOpenTicketItems(sale)}
                              style={{
                                border: 'none',
                                background: 'rgba(20, 157, 146, 0.08)',
                                color: '#0F7F76',
                                padding: '0.25rem 0.65rem',
                                borderRadius: '99px',
                                fontSize: '0.72rem',
                                fontWeight: 700,
                                cursor: 'pointer',
                                display: 'inline-flex',
                                alignItems: 'center',
                                gap: '0.25rem'
                              }}
                            >
                              <Eye size={12} />
                              Ver Items
                            </button>
                          </td>
                        </tr>
                      ))}
                      <tr className={styles.totalRow}>
                        <td colSpan={3}>Totales de la Sesión</td>
                        <td style={{ textAlign: 'center' }}>{salesList.reduce((acc, curr) => acc + (curr.Productos || 0), 0)} uds</td>
                        <td style={{ textAlign: 'right' }}>{fmt(salesList.reduce((acc, curr) => acc + (curr['Pago Efectivo'] || 0), 0))}</td>
                        <td style={{ textAlign: 'right' }}>{fmt(salesList.reduce((acc, curr) => acc + (curr['Pago Tarjeta'] || 0), 0))}</td>
                        <td style={{ textAlign: 'right', color: '#149D92' }}>{fmt(salesList.reduce((acc, curr) => acc + (curr.Total || 0), 0))}</td>
                        <td />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          MODAL 1.5: TICKET ITEMS DETAIL (NESTED IN SALES DETAIL)
          ======================================================================= */}
      {selectedTicket && (
        <div className={styles.modalOverlay} style={{ zIndex: 1100 }} onClick={() => setSelectedTicket(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ maxWidth: '550px' }}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <h3>Artículos en Ticket {selectedTicket['Folio Venta']}</h3>
                <p>Cliente: {selectedTicket.Cliente} | Cajero: {selectedTicket.Cajero}</p>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setSelectedTicket(null)}>
                <X size={16} />
              </button>
            </div>

            <div className={styles.modalBody} style={{ padding: '1.25rem' }}>
              {ticketLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '3rem 0', gap: '0.5rem' }}>
                  <div className={styles.openPulse} />
                  <span>Obteniendo productos...</span>
                </div>
              ) : ticketError ? (
                <div style={{ color: 'var(--danger)', textAlign: 'center' }}>{ticketError}</div>
              ) : (
                <div className={styles.tableWrapper}>
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
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          MODAL 2: CANCELACIONES DETAIL
          ======================================================================= */}
      {activeModal === 'cancelaciones' && selectedSession && (
        <div className={styles.modalOverlay} onClick={() => setActiveModal(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ maxWidth: '900px' }}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <h3>Auditoría de Cancelaciones — Z-{selectedSession.id}</h3>
                <p>Detalle de productos cancelados y sus autorizaciones</p>
              </div>
              <div className={styles.modalActions}>
                <button className={styles.modalExportBtn} onClick={handleExportCancellations}>
                  <FileSpreadsheet size={13} />
                  Exportar Excel
                </button>
                <button className={styles.modalCloseBtn} onClick={() => setActiveModal(null)}>
                  <X size={16} />
                </button>
              </div>
            </div>

            <div className={styles.modalBody}>
              {cancellationsLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem 0', gap: '0.75rem' }}>
                  <div className={styles.openPulse} />
                  <span>Consultando cancelaciones...</span>
                </div>
              ) : cancellationsError ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>
                  <ShieldAlert size={32} style={{ margin: '0 auto 1rem' }} />
                  {cancellationsError}
                </div>
              ) : cancellationList.length === 0 ? (
                <div className={styles.emptyState}>No se registraron cancelaciones en esta sesión.</div>
              ) : (
                <div className={styles.tableWrapper}>
                  <table className={styles.table}>
                    <thead>
                      <tr>
                        <th>Folio Cancelado</th>
                        <th>Fecha / Hora</th>
                        <th>Producto</th>
                        <th style={{ textAlign: 'center' }}>Cant</th>
                        <th style={{ textAlign: 'right' }}>Precio</th>
                        <th style={{ textAlign: 'right' }}>Total</th>
                        <th>Cajero</th>
                        <th>Autorizó (Sup.)</th>
                      </tr>
                    </thead>
                    <tbody>
                      {cancellationList.map((item, idx) => (
                        <tr key={idx}>
                          <td style={{ fontWeight: 800 }}>{item['Folio Cancelacion']}</td>
                          <td>{new Date(item.FechaCancelacion).toLocaleTimeString('es-MX', { hour: '2-digit', minute: '2-digit' })} hrs</td>
                          <td>
                            <div style={{ fontSize: '0.8rem', fontWeight: 700 }}>{item.Descripcion}</div>
                            <div style={{ fontSize: '0.68rem', color: 'var(--text-muted)' }}>Cód: {item['Codigo Barras']}</div>
                          </td>
                          <td style={{ textAlign: 'center', fontWeight: 700, color: 'var(--danger)' }}>{item.Cantidad}</td>
                          <td style={{ textAlign: 'right' }}>{fmt(item['Precio Venta'])}</td>
                          <td style={{ textAlign: 'right', fontWeight: 800, color: 'var(--danger)' }}>{fmt(item.Total)}</td>
                          <td>{item.Cajero}</td>
                          <td>
                            <span style={{
                              display: 'inline-flex',
                              alignItems: 'center',
                              gap: '0.2rem',
                              padding: '0.15rem 0.5rem',
                              borderRadius: '4px',
                              background: 'rgba(61, 28, 2, 0.06)',
                              fontSize: '0.72rem',
                              fontWeight: 700
                            }}>
                              {item.Supervisor}
                            </span>
                          </td>
                        </tr>
                      ))}
                      <tr className={styles.totalRow}>
                        <td colSpan={3}>Totales de Pérdida en Cancelación</td>
                        <td style={{ textAlign: 'center', color: 'var(--danger)' }}>
                          {cancellationList.reduce((acc, curr) => acc + curr.Cantidad, 0)} uds
                        </td>
                        <td />
                        <td style={{ textAlign: 'right', color: 'var(--danger)' }}>
                          {fmt(cancellationList.reduce((acc, curr) => acc + curr.Total, 0))}
                        </td>
                        <td colSpan={2} />
                      </tr>
                    </tbody>
                  </table>
                </div>
              )}
            </div>
          </div>
        </div>
      )}

      {/* =======================================================================
          MODAL 3: CLOSING TICKET (Virtual Thermal Receipt Z-Cut)
          ======================================================================= */}
      {activeModal === 'corte' && selectedSession && (
        <div className={styles.modalOverlay} onClick={() => setActiveModal(null)}>
          <div className={styles.modalContent} onClick={e => e.stopPropagation()} style={{ maxWidth: '500px' }}>
            <div className={styles.modalHeader}>
              <div className={styles.modalTitleGroup}>
                <h3>Arqueo de Caja / Z</h3>
                <p>Auditoría física y flujo totalizador - Caja {selectedSession.caja}</p>
              </div>
              <button className={styles.modalCloseBtn} onClick={() => setActiveModal(null)}>
                <X size={16} />
              </button>
            </div>

            <div className={styles.modalBody} style={{ background: 'var(--surface-2)' }}>
              {closingTicketLoading ? (
                <div style={{ display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center', padding: '5rem 0', gap: '0.75rem' }}>
                  <div className={styles.openPulse} />
                  <span>Calculando flujos Z-cut...</span>
                </div>
              ) : closingTicketError ? (
                <div style={{ padding: '2rem', textAlign: 'center', color: 'var(--danger)' }}>
                  <ShieldAlert size={32} style={{ margin: '0 auto 1rem' }} />
                  {closingTicketError}
                </div>
              ) : (
                <>
                  <div className={styles.thermalReceipt}>
                    {closingTicketText}
                  </div>
                  <div style={{ padding: '0 1.5rem 1.5rem', display: 'flex', gap: '0.5rem' }}>
                    <button
                      onClick={handleCopyTicket}
                      style={{
                        flex: 1,
                        padding: '0.6rem',
                        borderRadius: '8px',
                        border: '1px solid rgba(61, 28, 2, 0.12)',
                        background: '#ffffff',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        color: 'var(--text)'
                      }}
                    >
                      {copied ? (
                        <>
                          <Check size={14} style={{ color: '#0F7F76' }} />
                          Copiado
                        </>
                      ) : (
                        <>
                          <Clipboard size={14} />
                          Copiar Texto
                        </>
                      )}
                    </button>
                    <button
                      onClick={handlePrintTicket}
                      style={{
                        flex: 1,
                        padding: '0.6rem',
                        borderRadius: '8px',
                        border: 'none',
                        background: 'linear-gradient(135deg, #3D1C02 0%, #5A2E0C 100%)',
                        fontSize: '0.8rem',
                        fontWeight: 700,
                        cursor: 'pointer',
                        display: 'flex',
                        alignItems: 'center',
                        justifyContent: 'center',
                        gap: '0.4rem',
                        color: '#ffffff'
                      }}
                    >
                      <Printer size={14} />
                      Imprimir Corte Z
                    </button>
                  </div>
                </>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

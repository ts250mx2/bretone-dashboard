'use client';

import React, { useState, useEffect, useMemo } from 'react';
import { Calendar, DollarSign, XCircle, Search, Eye, X } from 'lucide-react';
import styles from './cancelaciones.module.css';

type Period = 'today' | 'yesterday' | 'week' | 'month';

function toISO(d: Date) {
  return d.toISOString().split('T')[0];
}

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
      m.setDate(1);
      return [toISO(m), toISO(today)];
    }
  }
}

const fmt = (n: number) =>
  new Intl.NumberFormat('es-MX', { style: 'currency', currency: 'MXN', minimumFractionDigits: 2 }).format(n || 0);

export default function CancelacionesPage() {
  const [dateFrom, setDateFrom] = useState(() => datesForPeriod('today')[0]);
  const [dateTo, setDateTo] = useState(() => datesForPeriod('today')[1]);
  const [searchQuery, setSearchQuery] = useState('');
  
  const [cancelaciones, setCancelaciones] = useState<any[]>([]);
  const [kpis, setKpis] = useState<any>({ totalMonto: 0, totalTransacciones: 0, topMotivos: [] });
  const [loading, setLoading] = useState(true);

  // Modal
  const [selectedTicket, setSelectedTicket] = useState<any>(null);
  const [ticketItems, setTicketItems] = useState<any[]>([]);
  const [ticketLoading, setTicketLoading] = useState(false);

  useEffect(() => {
    async function fetchData() {
      if (!dateFrom || !dateTo) return;
      setLoading(true);
      try {
        const res = await fetch(`/api/dashboard/cancellations?dateFrom=${dateFrom}&dateTo=${dateTo}`, {
          cache: 'no-store'
        });
        if (!res.ok) throw new Error('Error al cargar cancelaciones');
        const json = await res.json();
        setCancelaciones(json.data || []);
        setKpis(json.kpis || { totalMonto: 0, totalTransacciones: 0, topMotivos: [] });
      } catch (err) {
        console.error(err);
      } finally {
        setLoading(false);
      }
    }
    fetchData();
  }, [dateFrom, dateTo]);

  const handlePeriod = (p: Period) => {
    const [from, to] = datesForPeriod(p);
    setDateFrom(from);
    setDateTo(to);
  };

  const activePeriod: Period | null = (['today', 'yesterday', 'week', 'month'] as Period[]).find(p => {
    const [f, t] = datesForPeriod(p);
    return f === dateFrom && t === dateTo;
  }) ?? null;

  const handleOpenTicketItems = async (ticket: any) => {
    setSelectedTicket(ticket);
    setTicketLoading(true);
    try {
      const res = await fetch(`/api/dashboard/cancellations/items?idCancelacion=${ticket.IdCancelacion}`, {
        cache: 'no-store'
      });
      if (!res.ok) throw new Error('Error al consultar artículos');
      const result = await res.json();
      setTicketItems(result.data || []);
    } catch (err) {
      console.error(err);
    } finally {
      setTicketLoading(false);
    }
  };

  const filtered = useMemo(() => {
    const q = searchQuery.toLowerCase().trim();
    if (!q) return cancelaciones;
    return cancelaciones.filter(c => 
      (c.MotivoCancelacion || '').toLowerCase().includes(q) ||
      (c.Supervisor || '').toLowerCase().includes(q) ||
      (c.Cajero || '').toLowerCase().includes(q) ||
      (c.Cliente || '').toLowerCase().includes(q)
    );
  }, [searchQuery, cancelaciones]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Cancelaciones</h1>
          <p>Registro e historial de ventas canceladas</p>
        </div>
        <div className={styles.actionsArea}>
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
          <div className={styles.dateFilter}>
            <input type="date" value={dateFrom} onChange={e => setDateFrom(e.target.value)} />
            <span>a</span>
            <input type="date" value={dateTo} onChange={e => setDateTo(e.target.value)} />
          </div>
        </div>
      </header>

      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard} style={{ borderLeft: '4px solid var(--danger, #b91c1c)' }}>
          <div className={styles.kpiIcon} style={{ background: '#fee2e2', color: '#b91c1c' }}>
            <DollarSign size={24} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Monto Cancelado</span>
            <span className={styles.kpiValue} style={{ color: '#b91c1c' }}>{fmt(kpis.totalMonto)}</span>
          </div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(61, 28, 2, 0.08)' }}>
            <XCircle size={24} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Transacciones</span>
            <span className={styles.kpiValue}>{kpis.totalTransacciones}</span>
          </div>
        </div>
      </div>

      <div className={styles.tableCard}>
        <div className={styles.cardHeader}>
          <h2>Historial de Cancelaciones</h2>
          <div className={styles.searchBar}>
            <input 
              type="text" 
              placeholder="Buscar motivo, cliente, cajero..." 
              value={searchQuery}
              onChange={e => setSearchQuery(e.target.value)}
            />
          </div>
        </div>
        <div className={styles.tableWrapper}>
          {loading ? (
            <div className={styles.emptyState}>Cargando cancelaciones...</div>
          ) : filtered.length > 0 ? (
            <table className={styles.table}>
              <thead>
                <tr>
                  <th>Folio Venta</th>
                  <th>Fecha Cancelación</th>
                  <th>Motivo</th>
                  <th>Supervisor</th>
                  <th>Cajero Orig.</th>
                  <th style={{textAlign: 'right'}}>Monto</th>
                  <th style={{textAlign: 'center'}}>Acciones</th>
                </tr>
              </thead>
              <tbody>
                {filtered.map(c => (
                  <tr key={c.IdCancelacion}>
                    <td style={{fontWeight: 800}}>{c.IdApertura}-{c.IdVenta}</td>
                    <td>{new Date(c.FechaCancelacion).toLocaleString('es-MX')}</td>
                    <td>{c.MotivoCancelacion || 'N/A'}</td>
                    <td>{c.Supervisor || 'Desconocido'}</td>
                    <td>{c.Cajero || 'Desconocido'}</td>
                    <td style={{textAlign: 'right', fontWeight: 700, color: '#b91c1c'}}>{fmt(c.MontoCancelado)}</td>
                    <td style={{textAlign: 'center'}}>
                      <button
                        onClick={() => handleOpenTicketItems(c)}
                        style={{
                          border: 'none',
                          background: 'rgba(20, 157, 146, 0.08)',
                          color: '#0F7F76',
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
                        Detalle
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          ) : (
            <div className={styles.emptyState}>No se encontraron cancelaciones en este periodo.</div>
          )}
        </div>
      </div>

      {selectedTicket && (
        <div style={{ position: 'fixed', inset: 0, background: 'rgba(0,0,0,0.5)', zIndex: 50, display: 'flex', alignItems: 'center', justifyContent: 'center' }} onClick={() => setSelectedTicket(null)}>
          <div style={{ background: 'white', borderRadius: '12px', padding: '1.5rem', width: '90%', maxWidth: '600px', maxHeight: '80vh', overflowY: 'auto' }} onClick={e => e.stopPropagation()}>
            <div style={{ display: 'flex', justifyContent: 'space-between', alignItems: 'center', marginBottom: '1rem', borderBottom: '1px solid #eee', paddingBottom: '1rem' }}>
              <div>
                <h3 style={{ fontSize: '1.2rem', fontWeight: 800 }}>Artículos Cancelados (Folio {selectedTicket.IdApertura}-{selectedTicket.IdVenta})</h3>
                <p style={{ fontSize: '0.85rem', color: '#666' }}>Supervisor: {selectedTicket.Supervisor} | Cajero: {selectedTicket.Cajero}</p>
              </div>
              <button onClick={() => setSelectedTicket(null)} style={{ background: 'none', border: 'none', cursor: 'pointer' }}><X size={20} /></button>
            </div>
            
            {ticketLoading ? (
              <div style={{ textAlign: 'center', padding: '2rem' }}>Cargando artículos...</div>
            ) : (
              <table style={{ width: '100%', borderCollapse: 'collapse', fontSize: '0.85rem' }}>
                <thead>
                  <tr style={{ borderBottom: '2px solid #eee', textAlign: 'left' }}>
                    <th style={{ padding: '0.5rem' }}>Descripción</th>
                    <th style={{ padding: '0.5rem', textAlign: 'center' }}>Cant</th>
                    <th style={{ padding: '0.5rem', textAlign: 'right' }}>Importe</th>
                  </tr>
                </thead>
                <tbody>
                  {ticketItems.map((item, idx) => (
                    <tr key={idx} style={{ borderBottom: '1px solid #eee' }}>
                      <td style={{ padding: '0.5rem', fontWeight: 600 }}>{item.Descripcion}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'center' }}>{item.Cantidad}</td>
                      <td style={{ padding: '0.5rem', textAlign: 'right', fontWeight: 700 }}>{fmt(item.Total)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            )}
          </div>
        </div>
      )}
    </div>
  );
}

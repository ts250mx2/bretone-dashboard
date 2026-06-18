'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  Bell,
  Calendar,
  Download,
  Search,
  Users,
  AlertTriangle,
  Server,
  Info,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import styles from './alertas.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────
type Period = 'today' | 'yesterday' | 'week' | 'month';

interface AlertRow {
  IdAlerta: number;
  Alerta: string;
  IdUsuario: number | null;
  Usuario: string;
  IdApertura: number;
  FechaAlerta: string;
  Rojo: number;
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

// Format ISO date string into readable local string
const formatDate = (isoString: string) => {
  if (!isoString) return '';
  const d = new Date(isoString);
  if (isNaN(d.getTime())) return isoString;
  const pad = (n: number) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())} ${pad(d.getHours())}:${pad(d.getMinutes())}:${pad(d.getSeconds())}`;
};

export default function SystemAlertsReport() {
  const [dateFrom, setDateFrom] = useState(() => datesForPeriod('week')[0]); // Default to last 7 days
  const [dateTo, setDateTo] = useState(() => datesForPeriod('week')[1]);
  const [data, setData] = useState<AlertRow[]>([]);
  const [searchQuery, setSearchQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [mounted, setMounted] = useState(false);

  useEffect(() => {
    setMounted(true);
  }, []);

  // Fetch report data for the date range
  const fetchReport = useCallback(async (from: string, to: string) => {
    setLoading(true);
    setError('');
    try {
      const params = new URLSearchParams({ dateFrom: from, dateTo: to });
      const res = await fetch(`/api/dashboard/reportes/alertas?${params}`);
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

  // Client-side filtering
  const filteredData = useMemo(() => {
    if (!searchQuery.trim()) return data;
    const q = searchQuery.toLowerCase();
    return data.filter(row => 
      row.Alerta.toLowerCase().includes(q) ||
      row.Usuario.toLowerCase().includes(q) ||
      String(row.IdApertura).includes(q)
    );
  }, [data, searchQuery]);

  // KPIs
  const totalAlerts = data.length;
  
  const criticalAlerts = useMemo(() => {
    return data.filter(row => row.Rojo === 1).length;
  }, [data]);

  const systemAlerts = useMemo(() => {
    return data.filter(row => !row.IdUsuario || row.Usuario === 'Sistema/Otro').length;
  }, [data]);

  const uniqueAffectedUsers = useMemo(() => {
    const users = new Set<string>();
    data.forEach(row => {
      if (row.Usuario && row.Usuario !== 'Sistema/Otro') {
        users.add(row.Usuario);
      }
    });
    return users.size;
  }, [data]);

  // Excel Export
  const handleExportExcel = () => {
    if (filteredData.length === 0) return;

    const formatted = filteredData.map((row) => ({
      'Folio Alerta': row.IdAlerta,
      'Fecha / Hora': formatDate(row.FechaAlerta),
      'Alerta / Incidencia': row.Alerta,
      'Usuario Asociado': row.Usuario,
      'Corte (Apertura ID)': row.IdApertura || 'N/A',
      'Incidencia Crítica (Rojo)': row.Rojo === 1 ? 'SÍ' : 'NO'
    }));

    const worksheet = XLSX.utils.json_to_sheet(formatted);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Reporte Alertas');
    XLSX.writeFile(workbook, `Reporte_Alertas_Seguridad_${dateFrom}_a_${dateTo}.xlsx`);
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
          <Bell size={34} style={{ color: 'var(--bretone-gold)' }} />
          <div>
            <h1>Reporte de Alertas del Sistema</h1>
            <p className={styles.subtitle}>Supervisión de incidentes, cortes de caja y cambios de precios en la plataforma</p>
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
            <Bell size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Total Alertas</span>
            <span className={styles.kpiValue}>{loading ? '—' : totalAlerts}</span>
            <span className={styles.kpiSub}>{activeLabel}</span>
          </div>
        </div>

        <div className={`${styles.kpiCard} kpi-glow-red`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(217, 76, 61, 0.08)', color: 'var(--danger)' }}>
            <AlertTriangle size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Alertas Críticas</span>
            <span className={styles.kpiValue} style={{ color: 'var(--danger)' }}>
              {loading ? '—' : criticalAlerts}
            </span>
            <span className={styles.kpiSub}>Requieren supervisión</span>
          </div>
        </div>

        <div className={`${styles.kpiCard} kpi-glow-yellow`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(227, 162, 28, 0.08)', color: '#E3A21C' }}>
            <Server size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Alertas del Sistema</span>
            <span className={styles.kpiValue}>{loading ? '—' : systemAlerts}</span>
            <span className={styles.kpiSub}>Eventos automáticos</span>
          </div>
        </div>

        <div className={`${styles.kpiCard} kpi-glow-green`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(20, 157, 146, 0.08)', color: '#149D92' }}>
            <Users size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Usuarios Afectados</span>
            <span className={styles.kpiValue}>{loading ? '—' : uniqueAffectedUsers}</span>
            <span className={styles.kpiSub}>Cajeros o supervisores</span>
          </div>
        </div>
      </div>

      {/* ====== DATA TABLE CARD ====== */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div className={styles.tableTitleBlock}>
            <h3>Listado de Incidencias Registradas</h3>
            <p>Detalle cronológico de las alertas y modificaciones de estado del sistema</p>
          </div>
          <div className={styles.tableActions}>
            <div className={styles.tableSearchWrapper}>
              <Search size={14} className={styles.tableSearchIcon} />
              <input
                type="text"
                placeholder="Buscar alertas..."
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
            <span>Consultando historial de alertas de seguridad...</span>
          </div>
        ) : filteredData.length === 0 ? (
          <div className={styles.chartEmpty}>
            {searchQuery ? 'No se encontraron alertas que coincidan con la búsqueda' : 'No se registraron alertas en este período'}
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: '80px' }}>ID</th>
                  <th style={{ width: '180px' }}>Fecha / Hora</th>
                  <th style={{ width: '150px' }}>Usuario</th>
                  <th>Alerta / Incidencia</th>
                  <th style={{ width: '110px' }}>Apertura</th>
                  <th style={{ width: '120px' }}>Estado</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row) => (
                  <tr key={row.IdAlerta} className={row.Rojo === 1 ? styles.criticalRow : ''}>
                    <td style={{ fontWeight: 700 }}>#{row.IdAlerta}</td>
                    <td className={styles.dateCol}>{formatDate(row.FechaAlerta)}</td>
                    <td className={styles.userCol}>{row.Usuario}</td>
                    <td className={styles.alertDesc}>{row.Alerta}</td>
                    <td>{row.IdApertura || '—'}</td>
                    <td>
                      {row.Rojo === 1 ? (
                        <span className={`${styles.badge} ${styles.badgeCritical}`}>
                          <AlertTriangle size={11} /> Crítica
                        </span>
                      ) : (
                        <span className={`${styles.badge} ${styles.badgeNormal}`}>
                          <Info size={11} /> Normal
                        </span>
                      )}
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>
    </div>
  );
}

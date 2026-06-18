'use client';

import React, { useState, useEffect, useCallback, useMemo } from 'react';
import {
  ClipboardList,
  Calendar,
  Download,
  Search,
  Users,
  CheckCircle,
  XCircle,
  X,
} from 'lucide-react';
import * as XLSX from 'xlsx';
import styles from './asistencias.module.css';

// ─── Types ───────────────────────────────────────────────────────────────────
type Period = 'today' | 'yesterday' | 'week' | 'month';

interface AttendanceRow {
  IdAsistencia: number;
  IdUsuario: number;
  Usuario: string;
  FechaAsistencia: string;
  ExitoHuella: number;
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

export default function EmployeeAttendanceReport() {
  const [dateFrom, setDateFrom] = useState(() => datesForPeriod('week')[0]); // Default to last 7 days
  const [dateTo, setDateTo] = useState(() => datesForPeriod('week')[1]);
  const [data, setData] = useState<AttendanceRow[]>([]);
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
      const res = await fetch(`/api/dashboard/reportes/asistencias?${params}`);
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
      row.Usuario.toLowerCase().includes(q) ||
      String(row.IdUsuario).includes(q)
    );
  }, [data, searchQuery]);

  // KPIs
  const totalChecks = data.length;
  
  const successChecks = useMemo(() => {
    return data.filter(row => row.ExitoHuella === 1).length;
  }, [data]);

  const failedChecks = useMemo(() => {
    return data.filter(row => row.ExitoHuella === 0).length;
  }, [data]);

  const uniqueActiveEmployees = useMemo(() => {
    const users = new Set<string>();
    data.forEach(row => {
      if (row.Usuario && row.Usuario !== 'Desconocido') {
        users.add(row.Usuario);
      }
    });
    return users.size;
  }, [data]);

  // Excel Export
  const handleExportExcel = () => {
    if (filteredData.length === 0) return;

    const formatted = filteredData.map((row) => ({
      'Registro ID': row.IdAsistencia,
      'Fecha / Hora': formatDate(row.FechaAsistencia),
      'Usuario / Empleado': row.Usuario,
      'ID Usuario': row.IdUsuario,
      'Éxito de Lectura': row.ExitoHuella === 1 ? 'ÉXITO' : 'FALLIDO'
    }));

    const worksheet = XLSX.utils.json_to_sheet(formatted);
    const workbook = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(workbook, worksheet, 'Asistencias Empleados');
    XLSX.writeFile(workbook, `Reporte_Asistencias_${dateFrom}_a_${dateTo}.xlsx`);
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
          <ClipboardList size={34} style={{ color: 'var(--bretone-gold)' }} />
          <div>
            <h1>Reporte de Asistencia de Personal</h1>
            <p className={styles.subtitle}>Registro de entradas, salidas y escaneos biométricos de huella dactilar</p>
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
            <ClipboardList size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Total Chequeos</span>
            <span className={styles.kpiValue}>{loading ? '—' : totalChecks}</span>
            <span className={styles.kpiSub}>{activeLabel}</span>
          </div>
        </div>

        <div className={`${styles.kpiCard} kpi-glow-green`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(46, 111, 64, 0.08)', color: '#2E6F40' }}>
            <CheckCircle size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Chequeos Exitosos</span>
            <span className={styles.kpiValue} style={{ color: '#2E6F40' }}>
              {loading ? '—' : successChecks}
            </span>
            <span className={styles.kpiSub}>Lector biométrico exitoso</span>
          </div>
        </div>

        <div className={`${styles.kpiCard} kpi-glow-red`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(217, 76, 61, 0.08)', color: 'var(--danger)' }}>
            <XCircle size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Intentos Fallidos</span>
            <span className={styles.kpiValue} style={{ color: 'var(--danger)' }}>
              {loading ? '—' : failedChecks}
            </span>
            <span className={styles.kpiSub}>Errores de lectura huella</span>
          </div>
        </div>

        <div className={`${styles.kpiCard} kpi-glow-yellow`}>
          <div className={styles.kpiIcon} style={{ background: 'rgba(227, 162, 28, 0.08)', color: '#E3A21C' }}>
            <Users size={20} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Personal Activo</span>
            <span className={styles.kpiValue}>{loading ? '—' : uniqueActiveEmployees}</span>
            <span className={styles.kpiSub}>Colaboradores registrados</span>
          </div>
        </div>
      </div>

      {/* ====== DATA TABLE CARD ====== */}
      <div className={styles.tableCard}>
        <div className={styles.tableHeader}>
          <div className={styles.tableTitleBlock}>
            <h3>Registros de Asistencia Biométrica</h3>
            <p>Relación de accesos validados mediante lector de huella digital</p>
          </div>
          <div className={styles.tableActions}>
            <div className={styles.tableSearchWrapper}>
              <Search size={14} className={styles.tableSearchIcon} />
              <input
                type="text"
                placeholder="Buscar empleado..."
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
            <span>Consultando historial de asistencias de personal...</span>
          </div>
        ) : filteredData.length === 0 ? (
          <div className={styles.chartEmpty}>
            {searchQuery ? 'No se encontraron empleados que coincidan con la búsqueda' : 'No se registraron asistencias en este período'}
          </div>
        ) : (
          <div className={styles.tableWrapper}>
            <table className={styles.table}>
              <thead>
                <tr>
                  <th style={{ width: '120px' }}>Registro ID</th>
                  <th style={{ width: '220px' }}>Fecha / Hora</th>
                  <th style={{ width: '150px' }}>ID Usuario</th>
                  <th>Colaborador / Empleado</th>
                  <th style={{ width: '180px' }}>Lector Huella</th>
                </tr>
              </thead>
              <tbody>
                {filteredData.map((row) => (
                  <tr key={row.IdAsistencia}>
                    <td style={{ fontWeight: 700 }}>#{row.IdAsistencia}</td>
                    <td className={styles.dateCol}>{formatDate(row.FechaAsistencia)}</td>
                    <td>#{row.IdUsuario}</td>
                    <td className={styles.userCol}>{row.Usuario}</td>
                    <td>
                      {row.ExitoHuella === 1 ? (
                        <span className={`${styles.badge} ${styles.badgeSuccess}`}>
                          <CheckCircle size={11} /> Correcto
                        </span>
                      ) : (
                        <span className={`${styles.badge} ${styles.badgeFailed}`}>
                          <XCircle size={11} /> Fallido
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

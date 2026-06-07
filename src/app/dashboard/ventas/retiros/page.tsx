"use client";

import React, { useState, useEffect, useMemo } from 'react';
import styles from './retiros.module.css';
import { Download, DollarSign, Activity, FileText, Calendar } from 'lucide-react';
import * as XLSX from 'xlsx';

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
      m.setDate(1); // Start from the 1st of the current month
      return [toISO(m), toISO(today)];
    }
  }
}

export default function RetirosPage() {
  const [dateFrom, setDateFrom] = useState(() => datesForPeriod('today')[0]);
  const [dateTo, setDateTo] = useState(() => datesForPeriod('today')[1]);
  
  const [retiros, setRetiros] = useState<any[]>([]);
  const [kpis, setKpis] = useState({ totalEfectivo: 0, transacciones: 0, promedio: 0, maxRetiro: 0 });
  const [loading, setLoading] = useState(false);
  const [searchQuery, setSearchQuery] = useState('');

  useEffect(() => {
    if (dateFrom && dateTo) {
      fetchData();
    }
  }, [dateFrom, dateTo]);

  const fetchData = async () => {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/retiros?dateFrom=${dateFrom}&dateTo=${dateTo}`);
      const data = await res.json();
      if (data.success) {
        setRetiros(data.data);
        setKpis(data.kpis);
      }
    } catch (error) {
      console.error("Failed to fetch retiros:", error);
    } finally {
      setLoading(false);
    }
  };

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

  const filteredRetiros = useMemo(() => {
    if (!searchQuery) return retiros;
    const lowerQ = searchQuery.toLowerCase();
    return retiros.filter(r => 
      (r.Concepto && r.Concepto.toLowerCase().includes(lowerQ)) ||
      (r.Supervisor && r.Supervisor.toLowerCase().includes(lowerQ)) ||
      (r.Cajero && r.Cajero.toLowerCase().includes(lowerQ))
    );
  }, [retiros, searchQuery]);

  const handleExport = () => {
    const ws = XLSX.utils.json_to_sheet(filteredRetiros.map(r => ({
      'ID Retiro': r.IdRetiro,
      'Apertura': r.IdApertura,
      'Fecha': new Date(r.Fecha).toLocaleString(),
      'Cajero': r.Cajero,
      'Supervisor': r.Supervisor,
      'Concepto': r.Concepto,
      'Monto': r.Efectivo
    })));
    const wb = XLSX.utils.book_new();
    XLSX.utils.book_append_sheet(wb, ws, "Retiros");
    XLSX.writeFile(wb, `Retiros_${dateFrom}_al_${dateTo}.xlsx`);
  };

  const [hoveredPoint, setHoveredPoint] = useState<any>(null);

  // Prepare line chart points for visual trend
  const { chartPoints, areaPoints, yTicks, xLabels, pointsData } = useMemo(() => {
    if (retiros.length === 0) return { chartPoints: "", areaPoints: "", yTicks: [], xLabels: [], pointsData: [] };
    
    // Group by date or just display chronologically
    const sorted = [...retiros].reverse(); // oldest first
    const maxVal = Math.max(...sorted.map(r => Number(r.Efectivo)), 1);
    
    const W = 780, H = 240, PAD = { t: 20, r: 20, b: 40, l: 60 };
    const innerW = W - PAD.l - PAD.r;
    const innerH = H - PAD.t - PAD.b;
    const toX    = (i: number) => PAD.l + (i / Math.max(sorted.length - 1, 1)) * innerW;
    const toY    = (v: number) => PAD.t + innerH - (v / maxVal) * innerH;

    const ptsData = sorted.map((r, i) => {
      const val = Number(r.Efectivo);
      return { x: toX(i), y: toY(val), val, data: r };
    });

    const cPoints = ptsData.map(p => `${p.x},${p.y}`).join(" ");
    const aPoints = `
      ${PAD.l},${PAD.t + innerH}
      ${cPoints}
      ${toX(sorted.length - 1)},${PAD.t + innerH}
    `;

    const generatedYTicks = [0, 0.25, 0.5, 0.75, 1].map(r => ({ v: maxVal * r, y: toY(maxVal * r) }));
    
    // Pick ~3 to 5 evenly spaced labels for the X-axis
    const numLabels = Math.min(sorted.length, 5);
    const labelIndices = Array.from({ length: numLabels }, (_, i) => Math.floor(i * (sorted.length - 1) / Math.max(numLabels - 1, 1)));
    const generatedXLabels = labelIndices.map(idx => ({
      x: toX(idx),
      label: new Date(sorted[idx].Fecha).toLocaleDateString('es-MX', { day: '2-digit', month: 'short' }),
      align: idx === 0 ? "start" : idx === sorted.length - 1 ? "end" : "middle"
    }));

    return { 
      chartPoints: cPoints, 
      areaPoints: aPoints, 
      yTicks: generatedYTicks,
      xLabels: generatedXLabels,
      pointsData: ptsData 
    };
  }, [retiros]);

  return (
    <div className={styles.container}>
      <header className={styles.header}>
        <div className={styles.titleArea}>
          <h1>Retiros de Caja</h1>
          <p>Registro y auditoría de retiros de efectivo y cortes</p>
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
            <input 
              type="date" 
              value={dateFrom} 
              onChange={(e) => setDateFrom(e.target.value)} 
            />
            <span>a</span>
            <input 
              type="date" 
              value={dateTo} 
              onChange={(e) => setDateTo(e.target.value)} 
            />
          </div>
          <button className={styles.exportBtn} onClick={handleExport}>
            <Download size={18} /> Exportar
          </button>
        </div>
      </header>

      <div className={styles.kpiGrid}>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon}>
            <DollarSign size={24} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Total Retirado</span>
            <span className={styles.kpiValue}>${kpis.totalEfectivo.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
          </div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon}>
            <Activity size={24} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Transacciones</span>
            <span className={styles.kpiValue}>{kpis.transacciones}</span>
          </div>
        </div>
        <div className={styles.kpiCard}>
          <div className={styles.kpiIcon}>
            <FileText size={24} />
          </div>
          <div className={styles.kpiInfo}>
            <span className={styles.kpiLabel}>Retiro Promedio</span>
            <span className={styles.kpiValue}>${kpis.promedio.toLocaleString('es-MX', {minimumFractionDigits: 2})}</span>
          </div>
        </div>
      </div>

      <div className={styles.contentSplit}>
        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Historial de Retiros</h2>
            <div className={styles.searchBar}>
              <input 
                type="text" 
                placeholder="Buscar concepto o usuario..." 
                value={searchQuery}
                onChange={(e) => setSearchQuery(e.target.value)}
              />
            </div>
          </div>
          <div className={styles.tableWrapper}>
            {loading ? (
              <div className={styles.emptyState}>Cargando retiros...</div>
            ) : filteredRetiros.length > 0 ? (
              <table className={styles.table}>
                <thead>
                  <tr>
                    <th>Fecha</th>
                    <th>Cajero / Apertura</th>
                    <th>Concepto</th>
                    <th>Autoriza</th>
                    <th style={{textAlign: 'right'}}>Monto</th>
                  </tr>
                </thead>
                <tbody>
                  {filteredRetiros.map((r, i) => (
                    <tr key={r.IdRetiro || i}>
                      <td>{new Date(r.Fecha).toLocaleString('es-MX')}</td>
                      <td>
                        {r.Cajero || 'Desconocido'}
                        <div style={{fontSize: '0.8em', opacity: 0.6}}>Apertura: {r.IdApertura}</div>
                      </td>
                      <td>{r.Concepto}</td>
                      <td>{r.Supervisor || `ID: ${r.IdSupervisor}`}</td>
                      <td className={styles.amount} style={{textAlign: 'right'}}>
                        ${Number(r.Efectivo).toLocaleString('es-MX', {minimumFractionDigits: 2})}
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            ) : (
              <div className={styles.emptyState}>No se encontraron retiros en este periodo.</div>
            )}
          </div>
        </div>

        <div className={styles.card}>
          <div className={styles.cardHeader}>
            <h2>Tendencia de Retiros</h2>
          </div>
          <div style={{ padding: '2rem 1rem 1rem 1rem', height: '100%', display: 'flex', flexDirection: 'column', alignItems: 'center', justifyContent: 'center' }}>
             {retiros.length > 1 ? (
               <div style={{ width: '100%', height: '250px', position: 'relative' }}>
                 <svg viewBox="0 0 780 240" preserveAspectRatio="none" style={{ width: '100%', height: '100%', overflow: 'visible' }}>
                   <defs>
                      <linearGradient id="areaGrad" x1="0" y1="0" x2="0" y2="1">
                        <stop offset="0%" stopColor="var(--color-amber)" stopOpacity="0.35" />
                        <stop offset="100%" stopColor="var(--color-amber)" stopOpacity="0.02" />
                      </linearGradient>
                   </defs>
                   
                   {/* Y-axis grid lines */}
                   {yTicks.map(({ v, y }) => (
                     <g key={v}>
                       <line x1="60" y1={y} x2="760" y2={y} stroke="rgba(105, 56, 15, 0.1)" strokeWidth="1" />
                       <text x="52" y={y + 4} fill="rgba(105, 56, 15, 0.6)" fontSize="11" textAnchor="end" style={{ userSelect: 'none' }}>
                         {v >= 1000 ? `$${(v / 1000).toFixed(1)}k` : `$${Math.round(v)}`}
                       </text>
                     </g>
                   ))}
                   
                   {/* Area fill */}
                   <polygon 
                     points={areaPoints} 
                     fill="url(#areaGrad)" 
                   />
                   
                   {/* Line */}
                   <polyline 
                     points={chartPoints} 
                     fill="none" 
                     stroke="var(--color-amber)" 
                     strokeWidth="2.5" 
                     strokeLinejoin="round" 
                     strokeLinecap="round" 
                   />
                   
                   {/* Points & Tooltips via title */}
                   {pointsData.map((pt, i) => (
                     <g key={i}>
                       <circle 
                         cx={pt.x} 
                         cy={pt.y} 
                         r="4" 
                         fill="var(--color-amber)" 
                         stroke="#fff" 
                         strokeWidth="2" 
                         style={{ cursor: 'pointer', transition: 'all 0.2s ease' }}
                       >
                         <title>
                           {`${new Date(pt.data.Fecha).toLocaleString('es-MX')} — Retiro: $${Number(pt.data.Efectivo).toLocaleString('es-MX', {minimumFractionDigits:2})}\nConcepto: ${pt.data.Concepto}`}
                         </title>
                       </circle>
                     </g>
                   ))}
                   
                   {/* X-axis labels */}
                   {xLabels.map((lbl, idx) => (
                     <text key={idx} x={lbl.x} y="225" fill="rgba(105, 56, 15, 0.6)" fontSize="10" textAnchor={lbl.align as any} style={{ userSelect: 'none' }}>
                       {lbl.label}
                     </text>
                   ))}
                 </svg>
               </div>
             ) : (
               <div className={styles.emptyState}>Insuficientes datos para graficar tendencia.</div>
             )}
          </div>
        </div>
      </div>

    </div>
  );
}

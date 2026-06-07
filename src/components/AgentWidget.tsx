'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Bot, Maximize2, X } from 'lucide-react';
import { useAgent } from '@/lib/agent/AgentContext';
import AgentChat from './AgentChat';
import styles from './agent.module.css';

export default function AgentWidget() {
  const { open, setOpen } = useAgent();
  const pathname = usePathname();
  const router = useRouter();

  // The dedicated agent page replaces the widget — hide the floating launcher there.
  if (pathname === '/dashboard/agente') return null;

  if (!open) {
    return (
      <button className={styles.launcher} onClick={() => setOpen(true)} title="Abrir asistente IA">
        <Bot size={18} />
        <span>Asistente IA</span>
        <span className={styles.launcherPulse} />
      </button>
    );
  }

  return (
    <div className={styles.panel} role="dialog" aria-label="Asistente IA">
      <div className={styles.header}>
        <div className={styles.headerIcon}><Bot size={18} /></div>
        <div className={styles.headerText}>
          <span className={styles.headerTitle}>Brioche · Asistente IA</span>
          <span className={styles.headerSub}>Análisis de ventas en tiempo real</span>
        </div>
        <div className={styles.headerActions}>
          <button
            className={styles.iconBtn}
            title="Maximizar"
            onClick={() => { setOpen(false); router.push('/dashboard/agente'); }}
          >
            <Maximize2 size={16} />
          </button>
          <button className={styles.iconBtn} title="Cerrar" onClick={() => setOpen(false)}>
            <X size={17} />
          </button>
        </div>
      </div>
      <AgentChat variant="widget" />
    </div>
  );
}

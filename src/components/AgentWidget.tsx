'use client';

import { usePathname, useRouter } from 'next/navigation';
import { Maximize2, X } from 'lucide-react';
import Image from 'next/image';
import { useState } from 'react';
import { useAgent } from '@/lib/agent/AgentContext';
import AgentChat from './AgentChat';
import MascotPicker from './MascotPicker';
import styles from './agent.module.css';

export default function AgentWidget() {
  const { open, setOpen, mascot } = useAgent();
  const [pickerOpen, setPickerOpen] = useState(false);
  const pathname = usePathname();
  const router = useRouter();

  // The dedicated agent page replaces the widget — hide the floating launcher there.
  if (pathname === '/dashboard/agente') return null;

  if (!open) {
    return (
      <button className={styles.launcher} onClick={() => setOpen(true)} title="Hablar con Brioche">
        <span className={styles.launcherMascot} aria-hidden="true">
          <Image className={styles.launcherBrioche} src={mascot === 'crepa' ? '/crepa-agent.png' : '/brioche-agent.png'} alt="" width={92} height={138} priority />
          <span className={styles.launcherPulse} />
        </span>
        <span className={styles.srOnly}>Abrir asistente con Brioche</span>
      </button>
    );
  }

  return (
    <div className={styles.panel} role="dialog" aria-label="Asistente IA">
      <div className={styles.header}>
        <button type="button" className={styles.headerIcon} onClick={() => setPickerOpen((current) => !current)} aria-expanded={pickerOpen} aria-label="Cambiar mascota" title="Cambiar mascota">
          <Image src={mascot === 'crepa' ? '/crepa-agent.png' : '/brioche-agent.png'} alt="" width={40} height={54} priority />
        </button>
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
      {pickerOpen && (
        <div className={styles.mascotPopover}>
          <span className={styles.mascotPopoverTitle}>Elige tu mascota</span>
          <MascotPicker compact />
        </div>
      )}
      <AgentChat variant="widget" />
    </div>
  );
}

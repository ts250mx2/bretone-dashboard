'use client';

import Image from 'next/image';
import { Check } from 'lucide-react';
import { AgentMascot, useAgent } from '@/lib/agent/AgentContext';
import styles from './agent.module.css';

const OPTIONS: Array<{ id: AgentMascot; label: string; src: string }> = [
  { id: 'telera', label: 'Telera de pan', src: '/brioche-agent.png' },
  { id: 'crepa', label: 'Crepa', src: '/crepa-agent.png' },
];

export default function MascotPicker({ compact = false }: { compact?: boolean }) {
  const { mascot, setMascot } = useAgent();

  return (
    <div className={`${styles.mascotPicker} ${compact ? styles.mascotPickerCompact : ''}`} role="group" aria-label="Elegir mascota">
      {OPTIONS.map((option) => {
        const selected = mascot === option.id;
        return (
          <button key={option.id} type="button" className={`${styles.mascotOption} ${selected ? styles.mascotOptionActive : ''}`} onClick={() => setMascot(option.id)} aria-pressed={selected}>
            <span className={styles.mascotOptionImage}><Image src={option.src} alt="" width={42} height={58} /></span>
            <span>{option.label}</span>
            {selected && <Check className={styles.mascotCheck} size={14} aria-hidden="true" />}
          </button>
        );
      })}
    </div>
  );
}

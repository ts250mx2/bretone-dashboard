'use client';

import { Bot, RotateCcw } from 'lucide-react';
import { useAgent } from '@/lib/agent/AgentContext';
import AgentChat from '@/components/AgentChat';
import styles from '@/components/agent.module.css';

export default function AgentePage() {
  const { reset, messages } = useAgent();

  return (
    <div style={{ display: 'flex', flexDirection: 'column', height: 'calc(100dvh - 7rem)', overflow: 'hidden' }}>
      <div style={{ flexShrink: 0, display: 'flex', alignItems: 'center', justifyContent: 'space-between', gap: '1rem', marginBottom: '1.25rem', flexWrap: 'wrap' }}>
        <div style={{ display: 'flex', alignItems: 'center', gap: '0.85rem' }}>
          <div style={{
            display: 'flex', alignItems: 'center', justifyContent: 'center',
            width: 46, height: 46, borderRadius: 14,
            background: 'linear-gradient(135deg, #E3A21C, #D17A4E)', color: '#fff',
          }}>
            <Bot size={24} />
          </div>
          <div>
            <h1 style={{ fontSize: '1.5rem', fontWeight: 800, color: '#3D1C02', lineHeight: 1.15 }}>
              Brioche · Asistente IA
            </h1>
            <p style={{ fontSize: '0.85rem', color: 'rgba(61,28,2,0.6)', marginTop: '0.15rem' }}>
              Analista de ventas inteligente de La Petite Bretonne
            </p>
          </div>
        </div>

        <button
          onClick={reset}
          disabled={messages.length === 0}
          style={{
            display: 'inline-flex', alignItems: 'center', gap: '0.45rem',
            padding: '0.55rem 1rem', borderRadius: 12, cursor: messages.length ? 'pointer' : 'not-allowed',
            border: '1.5px solid rgba(61,28,2,0.14)', background: '#fff', color: '#3D1C02',
            fontFamily: 'inherit', fontSize: '0.82rem', fontWeight: 700, opacity: messages.length ? 1 : 0.5,
          }}
          title="Nueva conversación"
        >
          <RotateCcw size={15} /> Nueva conversación
        </button>
      </div>

      <div className={styles.page}>
        <AgentChat variant="page" />
      </div>
    </div>
  );
}

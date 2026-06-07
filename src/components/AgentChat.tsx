'use client';

import React, { useEffect, useRef, useState } from 'react';
import { Send, Sparkles } from 'lucide-react';
import { useAgent } from '@/lib/agent/AgentContext';
import styles from './agent.module.css';

const SUGGESTIONS = [
  '¿Cuánto vendimos hoy?',
  'Top 5 productos de esta semana',
  '¿Cuáles son las horas pico?',
  'Compara ventas de hoy vs ayer',
];

export default function AgentChat({ variant = 'widget' }: { variant?: 'widget' | 'page' }) {
  const { messages, loading, send } = useAgent();
  const [input, setInput] = useState('');
  const bodyRef = useRef<HTMLDivElement>(null);
  const taRef = useRef<HTMLTextAreaElement>(null);

  useEffect(() => {
    bodyRef.current?.scrollTo({ top: bodyRef.current.scrollHeight, behavior: 'smooth' });
  }, [messages, loading]);

  const submit = () => {
    const text = input.trim();
    if (!text || loading) return;
    setInput('');
    if (taRef.current) taRef.current.style.height = 'auto';
    void send(text);
  };

  const onKeyDown = (e: React.KeyboardEvent<HTMLTextAreaElement>) => {
    if (e.key === 'Enter' && !e.shiftKey) {
      e.preventDefault();
      submit();
    }
  };

  const autoGrow = (e: React.ChangeEvent<HTMLTextAreaElement>) => {
    setInput(e.target.value);
    e.target.style.height = 'auto';
    e.target.style.height = `${Math.min(e.target.scrollHeight, 120)}px`;
  };

  const bodyClass = variant === 'page' ? styles.pageBody : styles.body;
  const inputRowClass = variant === 'page' ? `${styles.inputRow} ${styles.pageInputRow}` : styles.inputRow;

  return (
    <>
      <div className={bodyClass} ref={bodyRef}>
        {messages.length === 0 && !loading ? (
          <div className={styles.empty}>
            <div className={styles.emptyIcon}><Sparkles size={26} /></div>
            <div className={styles.emptyTitle}>Hola, soy Brioche 🥐</div>
            <div className={styles.emptyText}>
              Tu asistente de ventas de La Petite Bretonne. Pregúntame sobre ventas, productos, tendencias o lo que necesites.
            </div>
            <div className={styles.chips}>
              {SUGGESTIONS.map((s) => (
                <button key={s} className={styles.chip} onClick={() => send(s)}>{s}</button>
              ))}
            </div>
          </div>
        ) : (
          messages.map((m, i) => (
            <div key={i} className={`${styles.row} ${m.role === 'user' ? styles.rowUser : styles.rowBot}`}>
              <div className={`${styles.bubble} ${m.role === 'user' ? styles.bubbleUser : styles.bubbleBot}`}>
                {m.content}
              </div>
            </div>
          ))
        )}

        {loading && (
          <div className={`${styles.row} ${styles.rowBot}`}>
            <div className={`${styles.bubble} ${styles.bubbleBot}`}>
              <span className={styles.typing}><span /><span /><span /></span>
            </div>
          </div>
        )}
      </div>

      <div className={inputRowClass}>
        <textarea
          ref={taRef}
          className={styles.textarea}
          placeholder="Escribe tu pregunta…"
          rows={1}
          value={input}
          onChange={autoGrow}
          onKeyDown={onKeyDown}
        />
        <button className={styles.sendBtn} onClick={submit} disabled={loading || !input.trim()} title="Enviar">
          <Send size={17} />
        </button>
      </div>
    </>
  );
}

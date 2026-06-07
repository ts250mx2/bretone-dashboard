'use client';

import React, { createContext, useContext, useEffect, useRef, useState, useCallback } from 'react';

export type ChatMessage = { role: 'user' | 'assistant'; content: string };

const STORAGE_KEY = 'bretone_agent_chat';

interface AgentContextValue {
  messages: ChatMessage[];
  loading: boolean;
  open: boolean;
  setOpen: (open: boolean) => void;
  send: (text: string) => Promise<void>;
  reset: () => void;
}

const AgentContext = createContext<AgentContextValue | null>(null);

export function useAgent(): AgentContextValue {
  const ctx = useContext(AgentContext);
  if (!ctx) throw new Error('useAgent must be used within an AgentProvider');
  return ctx;
}

export function AgentProvider({ children }: { children: React.ReactNode }) {
  const [messages, setMessages] = useState<ChatMessage[]>([]);
  const [loading, setLoading] = useState(false);
  const [open, setOpen] = useState(false);

  // Ref mirrors state so async callbacks always read the latest conversation.
  const messagesRef = useRef<ChatMessage[]>([]);

  // Hydrate the conversation from localStorage once on mount (persistent chat).
  useEffect(() => {
    try {
      const raw = localStorage.getItem(STORAGE_KEY);
      if (raw) {
        const parsed = JSON.parse(raw);
        if (Array.isArray(parsed)) {
          messagesRef.current = parsed;
          setMessages(parsed);
        }
      }
    } catch {
      /* ignore corrupt storage */
    }
  }, []);

  const apply = useCallback((next: ChatMessage[]) => {
    messagesRef.current = next;
    setMessages(next);
    try {
      localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
    } catch {
      /* storage may be unavailable */
    }
  }, []);

  const send = useCallback(
    async (text: string) => {
      const trimmed = text.trim();
      if (!trimmed || loading) return;

      apply([...messagesRef.current, { role: 'user', content: trimmed }]);
      setLoading(true);
      try {
        const res = await fetch('/api/agent', {
          method: 'POST',
          headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ messages: messagesRef.current }),
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data?.error || 'No se pudo obtener respuesta.');
        apply([...messagesRef.current, { role: 'assistant', content: data.reply }]);
      } catch (err) {
        const message = err instanceof Error ? err.message : String(err);
        apply([...messagesRef.current, { role: 'assistant', content: `⚠️ ${message}` }]);
      } finally {
        setLoading(false);
      }
    },
    [apply, loading],
  );

  const reset = useCallback(() => apply([]), [apply]);

  return (
    <AgentContext.Provider value={{ messages, loading, open, setOpen, send, reset }}>
      {children}
    </AgentContext.Provider>
  );
}

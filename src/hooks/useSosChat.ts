import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import {
  SOS_TEXT_HEARTBEAT_MS,
  emptySosChatState,
  applyChatStateRow,
  parseHeartbeat,
  type SosChatServerState,
} from '@/lib/sosTextChat';

export interface SosChatMessage {
  id: string;
  clientId: string;
  senderType: 'patient' | 'psychologist';
  body: string;
  createdAt: string;
  /** Só nas minhas, antes de o servidor confirmar. */
  pending?: 'sending' | 'failed';
}

type Row = {
  id: string;
  client_id: string;
  sender_type: string;
  body: string;
  created_at: string;
};

const fromRow = (row: Row): SosChatMessage => ({
  id: row.id,
  clientId: row.client_id,
  senderType: row.sender_type === 'psychologist' ? 'psychologist' : 'patient',
  body: row.body,
  createdAt: row.created_at,
});

const newClientId = () =>
  typeof crypto !== 'undefined' && 'randomUUID' in crypto
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

const mergeMessage = (list: SosChatMessage[], msg: SosChatMessage) => {
  const i = list.findIndex((m) => m.clientId === msg.clientId || m.id === msg.id);
  const next = i >= 0 ? list.map((m, j) => (j === i ? msg : m)) : [...list, msg];
  return next.sort((a, b) => a.createdAt.localeCompare(b.createdAt));
};

/**
 * Conversa do SOS por mensagem: mensagens (com envio que não duplica e
 * reenvio), presença (sinal a cada 15 s só com a tela visível — é o que diz
 * ao paciente se o psicólogo está na conversa), "visto" e "digitando…".
 */
export const useSosChat = ({ requestId, userType }: { requestId: string | null; userType: 'patient' | 'psychologist' }) => {
  const [messages, setMessages] = useState<SosChatMessage[]>([]);
  const [loading, setLoading] = useState(true);
  const [state, setState] = useState<SosChatServerState>(emptySosChatState);
  /** Diferença entre o relógio do servidor e o do aparelho. */
  const [clockOffset, setClockOffset] = useState(0);
  const [remoteTyping, setRemoteTyping] = useState(false);
  const typingChannelRef = useRef<ReturnType<typeof supabase.channel> | null>(null);
  const typingTimerRef = useRef<number | null>(null);
  const lastTypingSentRef = useRef(0);

  // Mensagens: carga inicial e as novas em tempo real.
  useEffect(() => {
    if (!requestId) return;
    let active = true;
    const load = async () => {
      const { data } = await supabase
        .from('sos_messages')
        .select('id, client_id, sender_type, body, created_at')
        .eq('request_id', requestId)
        .order('created_at', { ascending: true });
      if (!active) return;
      setMessages((prev) => {
        let next = prev.filter((m) => m.pending);
        for (const row of (data ?? []) as Row[]) next = mergeMessage(next, fromRow(row));
        return next;
      });
      setLoading(false);
    };
    void load();
    const channel = supabase
      .channel(`sos-messages-${requestId}`)
      .on(
        'postgres_changes',
        { event: 'INSERT', schema: 'public', table: 'sos_messages', filter: `request_id=eq.${requestId}` },
        (payload) => setMessages((prev) => mergeMessage(prev, fromRow(payload.new as Row))),
      )
      .subscribe();
    // A internet voltou: busca o que chegou enquanto estava fora.
    window.addEventListener('online', load);
    return () => {
      active = false;
      window.removeEventListener('online', load);
      supabase.removeChannel(channel);
    };
  }, [requestId]);

  // Presença e "visto": só com a conversa visível. Um sinal por vez (foco,
  // volta da internet e o intervalo podem cair juntos).
  const beatInFlightRef = useRef(false);
  const beat = useCallback(async () => {
    if (!requestId || document.visibilityState !== 'visible' || beatInFlightRef.current) return;
    beatInFlightRef.current = true;
    try {
      const { data, error } = await supabase.rpc('sos_chat_heartbeat', { p_request_id: requestId, p_read: true });
      if (error || !data) return;
      const { state: next, serverNow } = parseHeartbeat(data);
      if (serverNow) setClockOffset(serverNow - Date.now());
      setState(next);
    } finally {
      beatInFlightRef.current = false;
    }
  }, [requestId]);

  useEffect(() => {
    if (!requestId) return;
    void beat();
    const interval = window.setInterval(() => void beat(), SOS_TEXT_HEARTBEAT_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void beat();
    };
    document.addEventListener('visibilitychange', onVisible);
    window.addEventListener('focus', onVisible);
    window.addEventListener('online', onVisible);
    return () => {
      window.clearInterval(interval);
      document.removeEventListener('visibilitychange', onVisible);
      window.removeEventListener('focus', onVisible);
      window.removeEventListener('online', onVisible);
    };
  }, [requestId, beat]);

  // Mudanças do outro lado (lido, presença, fim do atendimento) chegam na hora.
  // O evento traz a linha nova: aplica direto. Antes cada evento chamava o
  // sinal (que grava em sos_chat_state e gera outro evento para os dois
  // lados): 1 virava 2, 4, 8... enquanto a conversa estivesse aberta.
  useEffect(() => {
    if (!requestId) return;
    const channel = supabase
      .channel(`sos-chat-state-${requestId}`)
      .on(
        'postgres_changes',
        { event: '*', schema: 'public', table: 'sos_chat_state', filter: `request_id=eq.${requestId}` },
        (payload) => {
          const row = payload.new as Record<string, unknown> | null;
          if (row && Object.keys(row).length > 0) setState((prev) => applyChatStateRow(prev, row));
        },
      )
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'emergency_requests', filter: `id=eq.${requestId}` },
        (payload) => {
          const row = payload.new as { status?: string; end_reason?: string | null; ended_by_type?: string | null; started_at?: string | null };
          setState((prev) => ({
            ...prev,
            status: row.status ?? prev.status,
            endReason: row.end_reason ?? prev.endReason,
            endedByType: row.ended_by_type ?? prev.endedByType,
            startedAt: row.started_at ?? prev.startedAt,
          }));
        },
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [requestId]);

  // "digitando…": aviso direto entre os dois, sem passar pelo banco.
  useEffect(() => {
    if (!requestId) return;
    const channel = supabase.channel(`sos-typing-${requestId}`);
    channel
      .on('broadcast', { event: 'typing' }, (payload) => {
        const from = (payload.payload as { from?: string } | undefined)?.from;
        if (from === userType) return;
        setRemoteTyping(true);
        if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
        typingTimerRef.current = window.setTimeout(() => setRemoteTyping(false), 4000);
      })
      .subscribe();
    typingChannelRef.current = channel;
    return () => {
      if (typingTimerRef.current) window.clearTimeout(typingTimerRef.current);
      typingChannelRef.current = null;
      supabase.removeChannel(channel);
    };
  }, [requestId, userType]);

  const notifyTyping = useCallback(() => {
    const now = Date.now();
    if (now - lastTypingSentRef.current < 2000) return;
    lastTypingSentRef.current = now;
    void typingChannelRef.current?.send({ type: 'broadcast', event: 'typing', payload: { from: userType } });
  }, [userType]);

  // Mensagem nova chegou do outro lado: some o "digitando…".
  const lastRemoteId = [...messages].reverse().find((m) => m.senderType !== userType)?.id;
  useEffect(() => {
    if (lastRemoteId) setRemoteTyping(false);
  }, [lastRemoteId]);

  const deliver = useCallback(
    async (msg: SosChatMessage) => {
      if (!requestId) return false;
      const { data, error } = await supabase.rpc('send_sos_message', {
        p_request_id: requestId,
        p_body: msg.body,
        p_client_id: msg.clientId,
      });
      if (error || !data) {
        setMessages((prev) => prev.map((m) => (m.clientId === msg.clientId ? { ...m, pending: 'failed' } : m)));
        return false;
      }
      setMessages((prev) => mergeMessage(prev, fromRow(data as Row)));
      void beat();
      return true;
    },
    [requestId, beat],
  );

  const send = useCallback(
    (text: string) => {
      const body = text.trim();
      if (!body) return Promise.resolve(false);
      const msg: SosChatMessage = {
        id: `local-${newClientId()}`,
        clientId: newClientId(),
        senderType: userType,
        body,
        createdAt: new Date(Date.now() + clockOffset).toISOString(),
        pending: 'sending',
      };
      setMessages((prev) => [...prev, msg]);
      return deliver(msg);
    },
    [userType, clockOffset, deliver],
  );

  const retry = useCallback(
    (clientId: string) => {
      const msg = messages.find((m) => m.clientId === clientId);
      if (!msg) return;
      setMessages((prev) => prev.map((m) => (m.clientId === clientId ? { ...m, pending: 'sending' } : m)));
      void deliver(msg);
    },
    [messages, deliver],
  );

  return { messages, loading, state, clockOffset, remoteTyping, send, retry, notifyTyping, refresh: beat };
};

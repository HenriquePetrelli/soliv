import { useCallback, useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

interface UseSharedCallTimerProps {
  sessionId?: string;
  /** Duração da chamada em segundos (vale até o banco responder). */
  timeLimit: number;
  /**
   * Muda quando algo da chamada muda (aviso de mídia na sala, conexão local,
   * presença do outro lado): o cronômetro confere o banco na hora.
   */
  syncKey?: string;
  onExpire: () => void;
}

interface ClockAnchor {
  /** Segundos de chamada com os dois conectados, no instante `at`. */
  elapsed: number;
  running: boolean;
  started: boolean;
  limit: number;
  /** performance.now() de quando a resposta chegou. */
  at: number;
}

/** O banco soma no máximo 60 s entre avisos; a tela também não passa disso. */
const MAX_LIVE_SECONDS = 60;
/**
 * Conferência periódica. A cada mudança na sala (syncKey) já confere na hora;
 * entre uma e outra o segundo anda na tela. Era 5 s (24 consultas por minuto
 * por chamada só para o relógio); 15 s basta.
 */
const RESYNC_MS = 15_000;

/**
 * Cronômetro da chamada (SOS e consulta), igual para paciente e psicólogo.
 *
 * A única fonte é o banco (`call_clock`): o tempo com os DOIS conectados, que
 * ele mesmo soma a cada aviso de mídia. Começa quando o segundo lado confirma
 * áudio/vídeo, pausa quando um cai e volta de onde parou. Cada aparelho só
 * mostra esse valor e anda o segundo localmente entre uma conferência e outra
 * (a cada 15 s e a cada mudança na sala), então os dois relógios ficam iguais.
 */
export const useSharedCallTimer = ({ sessionId, timeLimit, syncKey, onExpire }: UseSharedCallTimerProps) => {
  const [anchor, setAnchor] = useState<ClockAnchor | null>(null);
  const [now, setNow] = useState(() => performance.now());
  const expiredRef = useRef(false);
  const onExpireRef = useRef(onExpire);
  onExpireRef.current = onExpire;
  const requestSeqRef = useRef(0);

  const sync = useCallback(async () => {
    if (!sessionId) return;
    const seq = ++requestSeqRef.current;
    const sentAt = performance.now();
    const { data, error } = await supabase.rpc('call_clock' as never, { p_session_id: sessionId } as never);
    const receivedAt = performance.now();
    // Uma resposta mais antiga que chegou depois não desfaz a mais nova.
    if (seq !== requestSeqRef.current || error || !data) return;
    const clock = data as unknown as {
      elapsed_seconds: number | string;
      running: boolean;
      started: boolean;
      limit_seconds: number | null;
    };
    const running = Boolean(clock.running);
    // Metade da ida e volta: o instante em que o banco mediu.
    const elapsed = Number(clock.elapsed_seconds) + (running ? (receivedAt - sentAt) / 2000 : 0);
    setAnchor({
      elapsed: Number.isFinite(elapsed) ? elapsed : 0,
      running,
      started: Boolean(clock.started),
      limit: clock.limit_seconds && clock.limit_seconds > 0 ? clock.limit_seconds : timeLimit,
      at: receivedAt,
    });
    setNow(receivedAt);
  }, [sessionId, timeLimit]);

  // Confere ao entrar, a cada mudança na sala e de tempos em tempos.
  useEffect(() => {
    void sync();
  }, [sync, syncKey]);

  useEffect(() => {
    const timer = setInterval(() => void sync(), RESYNC_MS);
    const onVisible = () => {
      if (document.visibilityState === 'visible') void sync();
    };
    document.addEventListener('visibilitychange', onVisible);
    return () => {
      clearInterval(timer);
      document.removeEventListener('visibilitychange', onVisible);
    };
  }, [sync]);

  // Entre as conferências, o segundo anda na tela (só enquanto corre).
  const running = Boolean(anchor?.running);
  useEffect(() => {
    if (!running) return;
    const timer = setInterval(() => setNow(performance.now()), 250);
    return () => clearInterval(timer);
  }, [running]);

  const limit = anchor?.limit ?? timeLimit;
  const live = anchor && anchor.running ? Math.min(MAX_LIVE_SECONDS, Math.max(0, (now - anchor.at) / 1000)) : 0;
  const elapsed = Math.floor((anchor?.elapsed ?? 0) + live);
  const timeLeft = Math.max(0, limit - elapsed);
  const started = Boolean(anchor?.started);

  useEffect(() => {
    if (!anchor || !started || expiredRef.current || timeLeft > 0) return;
    expiredRef.current = true;
    onExpireRef.current();
  }, [anchor, started, timeLeft]);

  return {
    timeLeft,
    elapsed,
    /** Parado: ainda não conectou ou alguém caiu. */
    isPaused: !running,
    /** Os dois já se conectaram alguma vez nesta chamada. */
    started,
    loaded: anchor !== null,
  };
};

import { useEffect, useRef, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionUser } from '@/lib/currentUser';

interface UseParticipantHeartbeatProps {
  sessionId?: string;
  userType: 'psychologist' | 'patient';
  enabled?: boolean;
  /** How often the heartbeat is written (ms). */
  intervalMs?: number;
  /** How long a peer can stay silent before being considered away (ms). */
  staleAfterMs?: number;
}

/**
 * Persisted presence heartbeat for an emergency call.
 *
 * Realtime presence alone cannot tell "tab closed for 2s" apart from "user
 * really abandoned the call": it disappears instantly and leaves no trace.
 * Writing a heartbeat row to `participant_presence` gives the server a durable
 * signal, which is what the scheduled `finalize_stale_emergency_sessions()`
 * routine uses to close truly abandoned rooms.
 */
export const useParticipantHeartbeat = ({
  sessionId,
  userType,
  enabled = true,
  intervalMs = 15_000,
  staleAfterMs = 45_000,
}: UseParticipantHeartbeatProps) => {
  const [remoteLastSeen, setRemoteLastSeen] = useState<number | null>(null);
  const [remoteRecentlySeen, setRemoteRecentlySeen] = useState(false);
  const userIdRef = useRef<string | null>(null);

  const remoteType = userType === 'patient' ? 'psychologist' : 'patient';

  useEffect(() => {
    if (!sessionId || !enabled) return;
    let cancelled = false;

    const beat = async () => {
      if (!userIdRef.current) {
        const { data } = await getSessionUser();
        userIdRef.current = data.user?.id ?? null;
      }
      const userId = userIdRef.current;
      if (!userId || cancelled) return;

      await supabase
        .from('participant_presence')
        .upsert(
          {
            session_id: sessionId,
            user_id: userId,
            user_type: userType,
            last_seen: new Date().toISOString(),
          },
          { onConflict: 'session_id,user_id' }
        );
    };

    const readRemote = async () => {
      const { data } = await supabase
        .from('participant_presence')
        .select('last_seen, user_type')
        .eq('session_id', sessionId)
        .eq('user_type', remoteType)
        .maybeSingle();

      if (cancelled) return;
      const seen = (data)?.last_seen ? new Date((data).last_seen).getTime() : null;
      setRemoteLastSeen(seen);
      setRemoteRecentlySeen(seen !== null && Date.now() - seen < staleAfterMs);
    };

    beat();
    readRemote();

    const interval = setInterval(() => {
      beat();
      readRemote();
    }, intervalMs);

    // Sem escuta de tempo real da tabela: o sinal do outro lado é lido junto
    // com o nosso, a cada intervalo (ele só é considerado ausente depois de
    // staleAfterMs, bem mais que o intervalo). No teste de carga de
    // 2026-11-27 esta tabela era a que mais mudava (cada participante grava a
    // cada 15 s) e o tempo real gastava 72% do tempo do banco com mudanças.

    return () => {
      cancelled = true;
      clearInterval(interval);
    };
  }, [sessionId, userType, remoteType, enabled, intervalMs, staleAfterMs]);

  return { remoteLastSeen, remoteRecentlySeen };
};

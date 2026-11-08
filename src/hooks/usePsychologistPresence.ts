import { useEffect, useState, useCallback, useSyncExternalStore } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionUser } from '@/lib/currentUser';
import { useToast } from '@/hooks/use-toast';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';

/**
 * Psychologist availability for the SOS queue.
 *
 * Presence is a heartbeat: the row exists AND `last_online` must stay fresh.
 * A closed tab stops the heartbeat and the server prunes the row
 * (`prune_stale_psychologist_presence`), so nobody stays "online" forever.
 */
const HEARTBEAT_MS = 60_000;

type State = { isOnline: boolean; initialized: boolean; userId: string | null };
let state: State = { isOnline: false, initialized: false, userId: null };
const listeners = new Set<() => void>();
const subscribe = (cb: () => void) => {
  listeners.add(cb);
  return () => listeners.delete(cb);
};
const getSnapshot = () => state;
const setState = (patch: Partial<State>) => {
  state = { ...state, ...patch };
  listeners.forEach((l) => l());
};

let bootstrapped = false;
let channel: ReturnType<typeof supabase.channel> | null = null;
let heartbeat: ReturnType<typeof setInterval> | null = null;

const stopHeartbeat = () => {
  if (heartbeat) {
    clearInterval(heartbeat);
    heartbeat = null;
  }
};

const startHeartbeat = (userId: string) => {
  stopHeartbeat();
  heartbeat = setInterval(async () => {
    if (!state.isOnline) return;
    await supabase
      .from('psychologist_presence')
      .update({ last_online: new Date().toISOString() })
      .eq('psychologist_id', userId);
  }, HEARTBEAT_MS);
};

/** Releases every shared resource (used on logout / user switch). */
export const teardownPsychologistPresence = () => {
  stopHeartbeat();
  if (channel) {
    supabase.removeChannel(channel);
    channel = null;
  }
  bootstrapped = false;
  setState({ isOnline: false, initialized: false, userId: null });
};

/**
 * Fica offline ao sair da conta: apaga o registro de presença (igual ao botão
 * "Offline") enquanto a sessão ainda existe. Sem isso o psicólogo continuava
 * "online" para o SOS até o servidor limpar o registro (até ~7 minutos).
 */
export const goOfflineOnSignOut = async (userId: string) => {
  stopHeartbeat();
  try {
    await supabase.from('psychologist_presence').delete().eq('psychologist_id', userId);
  } catch (error) {
    console.error('Error going offline on sign out:', error);
  }
  teardownPsychologistPresence();
};

const bootstrap = async () => {
  if (bootstrapped) return;
  bootstrapped = true;

  const { data: auth } = await getSessionUser();
  const userId = auth.user?.id ?? null;
  if (!userId) {
    setState({ initialized: true, userId: null, isOnline: false });
    return;
  }

  const { data } = await supabase
    .from('psychologist_presence')
    .select('psychologist_id, last_online')
    .eq('psychologist_id', userId)
    .maybeSingle();

  const fresh =
    !!data?.last_online && Date.now() - new Date(data.last_online).getTime() < 3 * 60_000;

  setState({ initialized: true, userId, isOnline: fresh });
  if (fresh) startHeartbeat(userId);

  channel = supabase
    .channel(`psychologist_presence_shared_${userId}`)
    .on(
      'postgres_changes',
      // Só a própria linha: antes cada psicólogo recebia a presença de todos os
      // outros (com muitos online, milhares de mensagens por segundo).
      { event: '*', schema: 'public', table: 'psychologist_presence', filter: `psychologist_id=eq.${userId}` },
      (payload) => {
        const newRow: any = payload.new;
        const oldRow: any = payload.old;
        if (payload.eventType === 'DELETE') {
          if (oldRow?.psychologist_id === userId) {
            stopHeartbeat();
            setState({ isOnline: false });
          }
        } else if (newRow?.psychologist_id === userId) {
          setState({ isOnline: true });
        }
      }
    )
    .subscribe();
};

export const usePsychologistPresence = () => {
  const snapshot = useSyncExternalStore(subscribe, getSnapshot, getSnapshot);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  useEffect(() => {
    bootstrap();
  }, []);

  const setOnlineStatus = useCallback(
    async (nextStatus: boolean) => {
      setLoading(true);
      try {
        const { data: auth } = await getSessionUser();
        const userId = auth.user?.id;
        if (!userId) throw new Error('Usuário não autenticado');

        if (nextStatus) {
          // Never reset the accepted/rejected counters of an existing row.
          const { data: existing } = await supabase
            .from('psychologist_presence')
            .select('psychologist_id')
            .eq('psychologist_id', userId)
            .maybeSingle();

          if (existing) {
            const { error } = await supabase
              .from('psychologist_presence')
              .update({ last_online: new Date().toISOString() })
              .eq('psychologist_id', userId);
            if (error) throw error;
          } else {
            const { error } = await supabase.from('psychologist_presence').insert({
              psychologist_id: userId,
              last_online: new Date().toISOString(),
              emergency_accepted_count: 0,
              emergency_rejected_count: 0,
            });
            if (error) throw error;
          }
          startHeartbeat(userId);
        } else {
          stopHeartbeat();
          const { error } = await supabase
            .from('psychologist_presence')
            .delete()
            .eq('psychologist_id', userId);
          if (error) throw error;
        }

        setState({ isOnline: nextStatus, userId });
      } catch (err: any) {
        console.error('Error updating presence:', err);
        toast({
          title: 'Erro',
          description: getFriendlyErrorMessage(err, 'Não foi possível atualizar seu status.'),
          variant: 'destructive',
        });
      } finally {
        setLoading(false);
      }
    },
    [toast]
  );

  const toggle = useCallback(
    () => setOnlineStatus(!snapshot.isOnline),
    [snapshot.isOnline, setOnlineStatus]
  );

  return {
    isOnline: snapshot.isOnline,
    initialized: snapshot.initialized,
    loading,
    setOnlineStatus,
    toggle,
  };
};

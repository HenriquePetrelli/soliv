import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import type { Json } from '@/integrations/supabase/types';
import {
  localDateString,
  type HabitEvent,
  type HabitKind,
  type HabitSettings,
  type UserHabit,
} from '@/lib/habits';
import { fetchHabitsSnapshot, takePrefetchedHabits } from '@/lib/habitsSnapshot';


export interface HabitDraft {
  kind: HabitKind;
  title?: string | null;
  daily_goal?: number | null;
  quit_started_at?: string | null;
  settings: HabitSettings;
  reminders_enabled: boolean;
  reminder_start: string;
  reminder_end: string;
  reminder_interval_minutes: number | null;
}

/**
 * Registros feitos sem internet (ou cuja resposta se perdeu), guardados no
 * aparelho até o servidor confirmar. Cada registro nasce com um id gerado no
 * aparelho: reenviar nunca duplica (o banco recusa o mesmo id).
 */
type PendingEvent = Omit<HabitEvent, 'pending'>;
const pendingKey = (userId: string) => `habitos:pendentes:${userId}`;

const readPending = (userId: string): PendingEvent[] => {
  try {
    const raw = localStorage.getItem(pendingKey(userId));
    const list = raw ? JSON.parse(raw) : [];
    return Array.isArray(list) ? list : [];
  } catch {
    return [];
  }
};

const writePending = (userId: string, list: PendingEvent[]) => {
  try {
    if (list.length) localStorage.setItem(pendingKey(userId), JSON.stringify(list));
    else localStorage.removeItem(pendingKey(userId));
  } catch {
    /* sem armazenamento: fica só na memória */
  }
};

const addPending = (userId: string, event: PendingEvent) =>
  writePending(userId, [...readPending(userId).filter((e) => e.id !== event.id), event]);
const removePending = (userId: string, eventId: string) =>
  writePending(userId, readPending(userId).filter((e) => e.id !== eventId));

/** Envios em andamento (o "Desfazer" espera o envio terminar antes de apagar). */
const inflight = new Map<string, Promise<unknown>>();
let flushing: Promise<void> | null = null;
let offlineNoticeShown = false;

const newId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function'
    ? crypto.randomUUID()
    : 'xxxxxxxx-xxxx-4xxx-yxxx-xxxxxxxxxxxx'.replace(/[xy]/g, (c) => {
        const r = (Math.random() * 16) | 0;
        return (c === 'x' ? r : (r & 0x3) | 0x8).toString(16);
      });

/** Falha de rede (sem resposta do servidor): vale guardar e tentar depois. */
const isNetworkError = (error: { code?: string; message?: string } | null) =>
  Boolean(error) && !error?.code && /fetch|network|failed|load/i.test(error?.message ?? 'fetch');

type SendResult = 'ok' | 'offline' | { error: { code?: string; message?: string } };

const sendEvent = (userId: string, event: PendingEvent): Promise<SendResult> => {
  const run = (async (): Promise<SendResult> => {
    try {
      const { error } = await supabase.from('habit_events').insert({
        id: event.id,
        habit_id: event.habit_id,
        user_id: userId,
        kind: event.kind,
        amount: event.amount,
        local_date: event.local_date,
        occurred_at: event.occurred_at,
        details: event.details as Json,
      });
      // 23505: já tinha chegado (a resposta anterior se perdeu).
      if (!error || error.code === '23505') {
        removePending(userId, event.id);
        return 'ok';
      }
      if (isNetworkError(error)) return 'offline';
      removePending(userId, event.id);
      return { error };
    } catch {
      return 'offline';
    }
  })();
  inflight.set(event.id, run);
  run.finally(() => {
    if (inflight.get(event.id) === run) inflight.delete(event.id);
  });
  return run;
};

/** Manda o que ficou guardado no aparelho, na ordem em que foi registrado. */
const flushPending = (userId: string): Promise<void> => {
  if (flushing) return flushing;
  flushing = (async () => {
    try {
      for (const event of readPending(userId)) {
        // Apagado ("Desfazer") enquanto os anteriores eram enviados.
        if (inflight.has(event.id) || !readPending(userId).some((e) => e.id === event.id)) continue;
        const result = await sendEvent(userId, event);
        if (result === 'offline') break;
      }
    } finally {
      flushing = null;
    }
  })();
  return flushing;
};

const deviceTimezone = () => {
  try {
    return Intl.DateTimeFormat().resolvedOptions().timeZone || 'America/Sao_Paulo';
  } catch {
    return 'America/Sao_Paulo';
  }
};

/** Postgres devolve "09:00:00"; o input de horário usa "09:00". */
const normalizeHabit = (row: Record<string, unknown>): UserHabit => ({
  ...(row as unknown as UserHabit),
  daily_goal: row.daily_goal == null ? null : Number(row.daily_goal),
  best_streak_seconds: Number(row.best_streak_seconds ?? 0),
  settings: (row.settings as HabitSettings) ?? {},
  reminder_start: String(row.reminder_start ?? '09:00').slice(0, 5),
  reminder_end: String(row.reminder_end ?? '21:00').slice(0, 5),
});

export const useHabits = () => {
  const { user } = useAuth();
  const [habits, setHabits] = useState<UserHabit[]>([]);
  const [events, setEvents] = useState<HabitEvent[]>([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(false);
  const loadedOnceRef = useRef(false);
  const lastLoadRef = useRef(0);

  const load = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }
    // Na primeira carga, aproveita a busca começada no login (habitsSnapshot).
    const [habitsResult, eventsResult] = await (takePrefetchedHabits(user.id) ?? fetchHabitsSnapshot(user.id));
    if (habitsResult.error || eventsResult.error) {
      console.error('useHabits: erro ao carregar', habitsResult.error ?? eventsResult.error);
      // Sem internet: continua mostrando o que já estava na tela.
      setError((prev) => prev || !loadedOnceRef.current);
    } else {
      setError(false);
      loadedOnceRef.current = true;
      setHabits((habitsResult.data ?? []).map((row) => normalizeHabit(row as Record<string, unknown>)));
      const confirmed: HabitEvent[] = (eventsResult.data ?? []).map((row) => ({
        ...(row as unknown as HabitEvent),
        amount: row.amount == null ? null : Number(row.amount),
        details: (row.details as Record<string, unknown>) ?? {},
      }));
      // Os registros ainda guardados no aparelho continuam na tela.
      const known = new Set(confirmed.map((e) => e.id));
      const pending = readPending(user.id)
        .filter((e) => !known.has(e.id))
        .map((e) => ({ ...e, pending: true }));
      setEvents([...confirmed, ...pending].sort((a, b) => (a.occurred_at < b.occurred_at ? -1 : a.occurred_at > b.occurred_at ? 1 : 0)));
    }
    lastLoadRef.current = Date.now();
    setLoading(false);
  }, [user?.id]);

  useEffect(() => {
    load();
  }, [load]);

  // Ao voltar para o app, reconectar ou virar o dia: manda o que ficou
  // guardado e atualiza (registro feito em outro aparelho, novo dia).
  useEffect(() => {
    if (!user?.id) return;
    const userId = user.id;
    let today = localDateString();
    const refresh = async (force = false) => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (readPending(userId).length) await flushPending(userId);
      if (force || Date.now() - lastLoadRef.current > 20_000) await load();
    };
    const onWake = () => void refresh();
    const onOnline = () => void refresh(true);
    const dayTimer = setInterval(() => {
      const now = localDateString();
      if (now !== today) {
        today = now;
        void refresh(true);
      }
    }, 60_000);
    window.addEventListener('online', onOnline);
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    if (readPending(userId).length) void flushPending(userId).then(() => load());
    return () => {
      clearInterval(dayTimer);
      window.removeEventListener('online', onOnline);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [user?.id, load]);

  const eventsByHabit = useMemo(() => {
    const map = new Map<string, HabitEvent[]>();
    for (const event of events) {
      const list = map.get(event.habit_id) ?? [];
      list.push(event);
      map.set(event.habit_id, list);
    }
    return map;
  }, [events]);

  const createHabit = useCallback(
    async (draft: HabitDraft): Promise<string> => {
      if (!user?.id) throw new Error('Sem sessão');
      const { data, error: insertError } = await supabase
        .from('user_habits')
        .insert({ ...draft, settings: draft.settings as Json, user_id: user.id, timezone: deviceTimezone() })
        .select('id')
        .single();
      if (insertError) throw insertError;
      await load();
      return data.id as string;
    },
    [user?.id, load],
  );

  const updateHabit = useCallback(
    async (habitId: string, patch: Partial<HabitDraft>) => {
      const { error: updateError } = await supabase
        .from('user_habits')
        .update({ ...patch, settings: patch.settings as Json | undefined, timezone: deviceTimezone() })
        .eq('id', habitId);
      if (updateError) throw updateError;
      await load();
    },
    [load],
  );

  /** Tirar da lista não apaga o histórico. */
  const archiveHabit = useCallback(
    async (habitId: string) => {
      const { error: updateError } = await supabase
        .from('user_habits')
        .update({ archived_at: new Date().toISOString(), reminders_enabled: false })
        .eq('id', habitId);
      if (updateError) throw updateError;
      await load();
    },
    [load],
  );

  /** Apaga o hábito e todo o histórico dele (dado de saúde: a pessoa decide). */
  const deleteHabit = useCallback(
    async (habitId: string) => {
      const { error: deleteError } = await supabase.from('user_habits').delete().eq('id', habitId);
      if (deleteError) throw deleteError;
      if (user?.id) writePending(user.id, readPending(user.id).filter((e) => e.habit_id !== habitId));
      await load();
    },
    [user?.id, load],
  );

  const logIntake = useCallback(
    async (habitId: string, amount: number, details: Record<string, unknown> = {}, kind: 'intake' | 'check' = 'intake'): Promise<string | null> => {
      if (!user?.id) return null;
      const userId = user.id;
      const event: PendingEvent = {
        id: newId(),
        habit_id: habitId,
        kind,
        amount: kind === 'check' ? null : amount,
        local_date: localDateString(),
        occurred_at: new Date().toISOString(),
        details,
      };
      // Registro instantâneo na tela: tocar num copo tem que responder na hora.
      // Guardado no aparelho antes de enviar: sem internet, não se perde.
      addPending(userId, event);
      setEvents((prev) => [...prev, { ...event, pending: true }]);
      const result = await sendEvent(userId, event);
      if (result === 'ok') {
        setEvents((prev) => prev.map((e) => (e.id === event.id ? { ...e, pending: false } : e)));
      } else if (typeof result === 'object') {
        // Recusado pelo banco (limite de registros, hábito removido): desfaz na tela.
        setEvents((prev) => prev.filter((e) => e.id !== event.id));
        throw result.error;
      }
      // 'offline': fica guardado e sai quando a internet voltar.
      if (result === 'offline' && !offlineNoticeShown) {
        offlineNoticeShown = true;
        toast('Sem internet agora', { description: 'O registro fica salvo no aparelho e é enviado quando a conexão voltar.' });
      }
      return event.id;
    },
    [user?.id],
  );

  const deleteEvent = useCallback(
    async (eventId: string) => {
      setEvents((prev) => prev.filter((e) => e.id !== eventId));
      if (user?.id) {
        const wasPending = readPending(user.id).some((e) => e.id === eventId);
        removePending(user.id, eventId);
        // "Desfazer" logo depois do toque: espera o envio terminar, senão o
        // registro chegaria depois de apagado e voltaria.
        const sending = inflight.get(eventId);
        if (sending) await sending.catch(() => undefined);
        else if (wasPending) return;
      }
      const { error: deleteError } = await supabase.from('habit_events').delete().eq('id', eventId);
      if (deleteError) {
        await load();
        throw deleteError;
      }
    },
    [user?.id, load],
  );

  /** Completa um registro já feito (ex.: como estava antes de comer). */
  const updateEventDetails = useCallback(
    async (eventId: string, details: Record<string, unknown>) => {
      setEvents((prev) => prev.map((e) => (e.id === eventId ? { ...e, details } : e)));
      const { error: updateError } = await supabase.from('habit_events').update({ details: details as Json }).eq('id', eventId);
      if (updateError) {
        await load();
        throw updateError;
      }
    },
    [load],
  );

  const logCraving = useCallback(
    async (habitId: string, intensity: number, triggers: string[], note?: string) => {
      if (!user?.id) return;
      const { error: insertError } = await supabase.from('habit_events').insert({
        habit_id: habitId,
        user_id: user.id,
        kind: 'craving',
        amount: intensity,
        local_date: localDateString(),
        details: { triggers, ...(note ? { note: note.slice(0, 500) } : {}) },
      });
      if (insertError) throw insertError;
      await load();
    },
    [user?.id, load],
  );

  const registerRelapse = useCallback(
    async (habitId: string, note?: string) => {
      const { error: rpcError } = await supabase.rpc('register_habit_relapse', {
        p_habit_id: habitId,
        p_local_date: localDateString(),
        p_note: note?.trim() || null,
      });
      if (rpcError) throw rpcError;
      await load();
    },
    [load],
  );

  return {
    habits,
    events,
    eventsByHabit,
    loading,
    error,
    reload: load,
    createHabit,
    updateHabit,
    archiveHabit,
    deleteHabit,
    logIntake,
    deleteEvent,
    updateEventDetails,
    logCraving,
    registerRelapse,
  };
};

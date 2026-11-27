import { supabase } from '@/integrations/supabase/client';

/** Quantos dias de histórico carregar (sequências e gráfico da semana). */
export const HABITS_HISTORY_DAYS = 60;

/**
 * "YYYY-MM-DD" de `days` dias atrás, no fuso do aparelho (mesma conta de
 * addDays/localDateString em lib/habits, que não vem para cá: este arquivo
 * entra no pacote inicial, pela tela de login).
 */
const localDateDaysAgo = (days: number, now: Date = new Date()): string => {
  const date = new Date(now.getFullYear(), now.getMonth(), now.getDate() - days);
  return `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;
};

/** Hábitos ativos e registros recentes, numa ida ao servidor (duas consultas juntas). */
export const fetchHabitsSnapshot = (userId: string) =>
  Promise.all([
    supabase
      .from('user_habits')
      .select('*')
      .eq('user_id', userId)
      .is('archived_at', null)
      .order('created_at', { ascending: true }),
    supabase
      .from('habit_events')
      .select('*')
      .eq('user_id', userId)
      .gte('local_date', localDateDaysAgo(HABITS_HISTORY_DAYS))
      .order('occurred_at', { ascending: true }),
  ]);

type Snapshot = ReturnType<typeof fetchHabitsSnapshot>;

/** Quanto tempo a busca antecipada serve para a tela que abrir em seguida. */
export const HABITS_PREFETCH_TTL_MS = 15_000;

let prefetched: { userId: string; at: number; promise: Snapshot } | null = null;

/**
 * Começa a buscar os hábitos já no login (ou ao reabrir o app logado), junto
 * com a linha do paciente. Antes o cartão "Meus hábitos" da tela inicial só
 * pedia os dados depois que o código da tela tinha baixado e montado: uma
 * ida ao servidor inteira a mais, com o cartão aparecendo depois do resto.
 */
export const prefetchHabits = (userId: string) => {
  if (prefetched && prefetched.userId === userId && Date.now() - prefetched.at < HABITS_PREFETCH_TTL_MS) return;
  prefetched = { userId, at: Date.now(), promise: fetchHabitsSnapshot(userId) };
};

/**
 * A busca antecipada, se ainda vale. Serve uma vez só: depois disso (ex.:
 * recarregar após registrar algo) a consulta vai ao servidor de novo.
 */
export const takePrefetchedHabits = (userId: string): Snapshot | null => {
  const entry = prefetched;
  prefetched = null;
  if (!entry || entry.userId !== userId || Date.now() - entry.at >= HABITS_PREFETCH_TTL_MS) return null;
  return entry.promise;
};

/** Só para testes. */
export const __resetHabitsPrefetch = () => {
  prefetched = null;
};

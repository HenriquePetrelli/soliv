import { describe, it, expect, beforeEach, vi, afterEach } from 'vitest';
import { fakeDb, fakeSupabase } from './fakeSupabase';

vi.mock('@/integrations/supabase/client', () => ({ supabase: fakeSupabase }));

import {
  HABITS_PREFETCH_TTL_MS,
  __resetHabitsPrefetch,
  prefetchHabits,
  takePrefetchedHabits,
} from '@/lib/habitsSnapshot';

const USER = 'patient-1';

beforeEach(() => {
  fakeDb.tables = {};
  fakeDb.writes = [];
  __resetHabitsPrefetch();
  fakeDb.rows('user_habits').push({ id: 'h1', user_id: USER, kind: 'water', archived_at: null, created_at: '2026-01-01' });
});

afterEach(() => {
  vi.useRealTimers();
});

describe('habitsSnapshot (hábitos buscados já no login)', () => {
  it('a tela inicial aproveita a busca começada no login, sem ir ao servidor de novo', async () => {
    const from = vi.spyOn(fakeSupabase, 'from');
    prefetchHabits(USER);
    prefetchHabits(USER); // login e reabertura: uma busca só
    const snapshot = takePrefetchedHabits(USER);
    expect(snapshot).not.toBeNull();
    const [habits] = await snapshot!;
    expect(habits.data).toHaveLength(1);
    expect(from).toHaveBeenCalledTimes(2); // user_habits + habit_events
    from.mockRestore();
  });

  it('serve uma vez só: a próxima carga (ex.: depois de registrar) vai ao servidor', () => {
    prefetchHabits(USER);
    expect(takePrefetchedHabits(USER)).not.toBeNull();
    expect(takePrefetchedHabits(USER)).toBeNull();
  });

  it('não serve para outra conta nem depois de velha', () => {
    prefetchHabits(USER);
    expect(takePrefetchedHabits('outra-conta')).toBeNull();

    vi.useFakeTimers();
    prefetchHabits(USER);
    vi.advanceTimersByTime(HABITS_PREFETCH_TTL_MS + 1);
    expect(takePrefetchedHabits(USER)).toBeNull();
  });
});

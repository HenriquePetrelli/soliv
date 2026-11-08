import { describe, it, expect, vi, beforeEach } from 'vitest';
import { render, screen } from '@testing-library/react';
import { fakeDb, fakeSupabase } from './fakeSupabase';

vi.mock('@/integrations/supabase/client', () => ({ supabase: fakeSupabase }));

import RoutinesHealthCard from '@/components/admin/RoutinesHealthCard';
import { routinesNeedingAttention, type RoutineHealth } from '@/components/admin/routinesHealth';

const ok = (name: string): RoutineHealth => ({
  jobname: name, schedule: '* * * * *', active: true, last_status: 'succeeded',
  last_start: '2026-10-11T12:00:00Z', failures_24h: 0, last_error: null,
});

beforeEach(() => {
  fakeDb.rpcHandlers = {};
});

describe('saúde das rotinas no painel do admin', () => {
  it('aponta rotina desligada ou com falha', () => {
    const rows = [ok('a'), { ...ok('b'), active: false }, { ...ok('c'), failures_24h: 3, last_status: 'failed' }];
    expect(routinesNeedingAttention(rows).map((r) => r.jobname)).toEqual(['b', 'c']);
  });

  it('tudo certo: mostra que todas estão rodando', async () => {
    fakeDb.rpcHandlers.get_routines_health = () => ({ data: [ok('a'), ok('b')], error: null });
    render(<RoutinesHealthCard />);
    expect(await screen.findByText(/Todas as 2 rotinas estão ativas/)).toBeInTheDocument();
  });

  it('com falha: mostra qual rotina e o erro', async () => {
    fakeDb.rpcHandlers.get_routines_health = () => ({
      data: [{ ...ok('notification-push'), failures_24h: 5, last_status: 'failed', last_error: 'connection refused' }, ok('b')],
      error: null,
    });
    render(<RoutinesHealthCard />);
    expect(await screen.findByText('1 rotina precisa de atenção')).toBeInTheDocument();
    expect(screen.getByText('notification-push')).toBeInTheDocument();
    expect(screen.getByText('connection refused')).toBeInTheDocument();
  });
});

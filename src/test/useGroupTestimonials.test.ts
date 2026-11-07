import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act } from '@testing-library/react';
import { fakeDb, fakeSupabase } from './fakeSupabase';

vi.mock('@/integrations/supabase/client', () => ({ supabase: fakeSupabase }));
vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ subscribed: true, subscriptionTier: 'Completo' }),
}));

import { useGroupTestimonials } from '@/hooks/useSupportGroups';

const RPC_ROWS = [
  {
    id: 't-anon',
    group_id: 'g1',
    anonimo: true,
    sintoma_id: null,
    sintoma_texto: null,
    humor: 2,
    texto: 'Relato anônimo',
    criado_em: new Date().toISOString(),
    likes_positivos: 1,
    likes_negativos: 0,
    autor_nome: null,
    is_mine: false,
    user_like: 'positivo',
    reported_by_me: false,
  },
];

beforeEach(() => {
  fakeDb.tables = {};
  fakeDb.writes = [];
  fakeDb.currentUserId = 'reader-1';
  fakeDb.rpcHandlers = {
    get_group_testimonials: () => ({ data: RPC_ROWS, error: null }),
  };
});

describe('useGroupTestimonials — anonimato e denúncia', () => {
  it('lê o feed pela RPC, sem ler a tabela direto e sem user_id do autor', async () => {
    const rpcSpy = vi.fn(() => ({ data: RPC_ROWS, error: null }));
    fakeDb.rpcHandlers.get_group_testimonials = rpcSpy;
    // Se o hook voltasse a ler a tabela, veria esta linha com o user_id.
    fakeDb.seed('group_testimonials', [{ id: 't-anon', group_id: 'g1', user_id: 'author-1', anonimo: true }]);

    const { result } = renderHook(() => useGroupTestimonials('g1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    expect(rpcSpy).toHaveBeenCalledWith(expect.anything(), { p_group_id: 'g1', p_only_mine: false });
    expect(result.current.testimonials).toHaveLength(1);
    expect(result.current.testimonials[0]).not.toHaveProperty('user_id');
    expect(result.current.testimonials[0].user_like).toEqual({ tipo: 'positivo' });
  });

  it('denunciar chama a RPC e marca o depoimento como já denunciado', async () => {
    const reportSpy = vi.fn(() => ({ data: null, error: null }));
    fakeDb.rpcHandlers.report_group_testimonial = reportSpy;

    const { result } = renderHook(() => useGroupTestimonials('g1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.reportTestimonial('t-anon', 'risco', 'detalhe');
    });

    expect(reportSpy).toHaveBeenCalledWith(expect.anything(), {
      p_testimonial_id: 't-anon',
      p_reason: 'risco',
      p_details: 'detalhe',
    });
    expect(result.current.testimonials[0].reported_by_me).toBe(true);
  });
});

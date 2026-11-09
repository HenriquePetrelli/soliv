import { describe, it, expect, beforeEach, vi } from 'vitest';
import { renderHook, waitFor, act, render, screen, fireEvent } from '@testing-library/react';
import { MemoryRouter } from 'react-router-dom';
import { fakeDb, fakeSupabase } from './fakeSupabase';

const { toastMock } = vi.hoisted(() => ({ toastMock: vi.fn() }));
vi.mock('@/integrations/supabase/client', () => ({ supabase: fakeSupabase }));
vi.mock('@/hooks/use-toast', () => ({ useToast: () => ({ toast: toastMock }), toast: toastMock }));
vi.mock('@/contexts/SubscriptionContext', () => ({
  useSubscription: () => ({ subscribed: true, subscriptionTier: 'Completo' }),
}));
vi.mock('@/hooks/usePatientStatistics', () => ({ usePatientStatistics: () => ({ addActivity: vi.fn() }) }));

import { useGroupTestimonials } from '@/hooks/useSupportGroups';
import { mentionsCrisis } from '@/lib/crisisLanguage';
import AddTestimonialForm from '@/components/support-groups/AddTestimonialForm';

const row = (over: Record<string, unknown> = {}) => ({
  id: 't1',
  group_id: 'g1',
  anonimo: false,
  sintoma_id: null,
  sintoma_texto: null,
  humor: 3,
  texto: 'Relato',
  criado_em: new Date().toISOString(),
  likes_positivos: 0,
  likes_negativos: 0,
  autor_nome: 'Ana',
  is_mine: false,
  user_like: null,
  reported_by_me: false,
  under_review: false,
  ...over,
});

beforeEach(() => {
  toastMock.mockReset();
  fakeDb.tables = {};
  fakeDb.writes = [];
  fakeDb.failNextWith = null;
  fakeDb.offlineError = null;
  fakeDb.currentUserId = 'reader-1';
  fakeDb.rpcHandlers = {
    get_group_testimonials: () => ({ data: [row()], error: null }),
  };
});

describe('Grupos de apoio — reagir', () => {
  it('reage numa operação só no servidor, aplica os totais e não mostra aviso de sucesso', async () => {
    const reactSpy = vi.fn(() => ({ data: { likes_positivos: 5, likes_negativos: 1, user_like: 'positivo' }, error: null }));
    fakeDb.rpcHandlers.react_to_testimonial = reactSpy;

    const { result } = renderHook(() => useGroupTestimonials('g1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await result.current.likeTestimonial('t1', 'positivo');
    });

    expect(reactSpy).toHaveBeenCalledWith(expect.anything(), { p_testimonial_id: 't1', p_tipo: 'positivo' });
    expect(result.current.testimonials[0].user_like).toEqual({ tipo: 'positivo' });
    expect(result.current.testimonials[0].likes_positivos).toBe(5);
    expect(toastMock).not.toHaveBeenCalled();
    // Nada de ler e depois gravar a tabela de reações pelo app.
    expect(fakeDb.writes.filter((w: { table?: string }) => w.table === 'group_testimonial_likes')).toHaveLength(0);
  });

  it('dois toques rápidos vão ao servidor na ordem, sem se atropelar', async () => {
    const calls: string[] = [];
    fakeDb.rpcHandlers.react_to_testimonial = (_db: unknown, args: { p_tipo: string }) => {
      calls.push(args.p_tipo);
      return { data: { likes_positivos: args.p_tipo === 'positivo' ? 1 : 0, likes_negativos: 0 }, error: null };
    };

    const { result } = renderHook(() => useGroupTestimonials('g1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    await act(async () => {
      await Promise.all([
        result.current.likeTestimonial('t1', 'positivo'),
        result.current.likeTestimonial('t1', 'none'),
      ]);
    });

    expect(calls).toEqual(['positivo', 'none']);
    expect(result.current.testimonials[0].user_like).toBeNull();
    expect(result.current.testimonials[0].likes_positivos).toBe(0);
  });

  it('erro do servidor recarrega a lista e avisa', async () => {
    const getSpy = vi.fn(() => ({ data: [row()], error: null }));
    fakeDb.rpcHandlers.get_group_testimonials = getSpy;
    fakeDb.rpcHandlers.react_to_testimonial = () => ({
      data: null,
      error: { code: '42501', message: 'Escrever depoimentos e reagir é dos planos Essencial, Flex e Completo.' },
    });

    const { result } = renderHook(() => useGroupTestimonials('g1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    const before = getSpy.mock.calls.length;

    let ok: boolean | undefined;
    await act(async () => {
      ok = await result.current.likeTestimonial('t1', 'positivo');
    });

    expect(ok).toBe(false);
    expect(getSpy.mock.calls.length).toBeGreaterThan(before);
    expect(toastMock).toHaveBeenCalledWith(expect.objectContaining({ variant: 'destructive' }));
  });
});

describe('Grupos de apoio — depoimento', () => {
  it('salvar de novo com o mesmo id não publica em dobro', async () => {
    const { result } = renderHook(() => useGroupTestimonials('g1'));
    await waitFor(() => expect(result.current.loading).toBe(false));

    const body = { anonimo: true, sintoma_id: null, sintoma_texto: null, humor: 3, texto: 'Oi' };
    let first: boolean | undefined;
    let second: boolean | undefined;
    await act(async () => {
      first = await result.current.addTestimonial(body, 'dep-1');
      second = await result.current.addTestimonial(body, 'dep-1');
    });

    expect(first).toBe(true);
    expect(second).toBe(true);
    expect(fakeDb.tables.group_testimonials).toHaveLength(1);
    expect(fakeDb.tables.group_testimonials[0]).toMatchObject({ id: 'dep-1', group_id: 'g1', user_id: 'reader-1' });
  });

  it('o autor recebe o aviso de em análise vindo do servidor', async () => {
    fakeDb.rpcHandlers.get_group_testimonials = () => ({
      data: [row({ is_mine: true, under_review: true })],
      error: null,
    });
    const { result } = renderHook(() => useGroupTestimonials('g1'));
    await waitFor(() => expect(result.current.loading).toBe(false));
    expect(result.current.testimonials[0].under_review).toBe(true);
  });
});

describe('Grupos de apoio — apoio de crise ao escrever', () => {
  it('reconhece falas de risco, com ou sem acento', () => {
    expect(mentionsCrisis('às vezes eu quero morrer')).toBe(true);
    expect(mentionsCrisis('penso em SUICÍDIO')).toBe(true);
    expect(mentionsCrisis('nao aguento mais viver assim')).toBe(true);
    expect(mentionsCrisis('Hoje foi um dia difícil, mas fiz a respiração')).toBe(false);
    expect(mentionsCrisis('')).toBe(false);
  });

  it('mostra o 188 e o SOS enquanto a pessoa escreve, sem impedir de publicar', async () => {
    render(
      <MemoryRouter>
        <AddTestimonialForm groupId="g1" groupName="Ansiedade" onSuccess={vi.fn()} />
      </MemoryRouter>,
    );

    expect(screen.queryByTestId('crisis-support')).toBeNull();
    const textarea = screen.getByRole('textbox');
    fireEvent.change(textarea, { target: { value: 'tem dias que penso em me matar' } });

    const box = await screen.findByTestId('crisis-support');
    expect(box.querySelector('a[href="tel:188"]')).not.toBeNull();
    expect(screen.getByRole('button', { name: /salvar depoimento/i })).not.toBeDisabled();
  });
});

describe('Grupos de apoio — depoimentos bloqueados pelo admin', () => {
  it('paciente bloqueado lê os depoimentos, mas ao criar vê o aviso com a data', async () => {
    const { default: SupportGroupDetail } = await import('@/pages/SupportGroupDetail');
    const { Routes, Route } = await import('react-router-dom');
    fakeDb.rpcHandlers.get_my_testimonial_block = () => ({
      data: { blocked: true, blocked_until: '2030-03-10T15:00:00Z' },
      error: null,
    });
    render(
      <MemoryRouter initialEntries={[{ pathname: '/support-groups/g1', state: { groupName: 'Ansiedade' } }]}>
        <Routes>
          <Route path="/support-groups/:groupId" element={<SupportGroupDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    expect(await screen.findByText('Relato')).toBeInTheDocument();
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar depoimento' }));
    const msg = await screen.findByTestId('testimonial-block-message');
    expect(msg).toHaveTextContent(/fugiu dos padrões do Soliv/);
    expect(msg).toHaveTextContent(/até 10 de março de 2030/);
    expect(screen.queryByText('Adicionar Depoimento')).not.toBeInTheDocument();
  });

  it('sem bloqueio, abre o formulário normalmente', async () => {
    const { default: SupportGroupDetail } = await import('@/pages/SupportGroupDetail');
    const { Routes, Route } = await import('react-router-dom');
    fakeDb.rpcHandlers.get_my_testimonial_block = () => ({ data: { blocked: false, blocked_until: null }, error: null });
    render(
      <MemoryRouter initialEntries={[{ pathname: '/support-groups/g1', state: { groupName: 'Ansiedade' } }]}>
        <Routes>
          <Route path="/support-groups/:groupId" element={<SupportGroupDetail />} />
        </Routes>
      </MemoryRouter>,
    );
    await screen.findByText('Relato');
    fireEvent.click(screen.getByRole('button', { name: 'Adicionar depoimento' }));
    expect(await screen.findByText('Adicionar Depoimento')).toBeInTheDocument();
    expect(screen.queryByTestId('testimonial-block-message')).not.toBeInTheDocument();
  });
});

import { describe, it, expect } from 'vitest';
import {
  PLAN_LIMITS,
  cancelMode,
  parseTier,
  tierForPrice,
  tierRank,
  changeDirection,
  pendingChange,
  rankLiveSubscriptions,
  stripeState,
  type SubscriptionLike,
} from '../../supabase/functions/_shared/billing';

const prices = { Essencial: 'price_essencial', Flex: 'price_flex', Completo: 'price_completo' };
const NOW = 1_790_000_000;

const sub = (overrides: Partial<SubscriptionLike> & { price?: string } = {}): SubscriptionLike => ({
  id: overrides.id ?? 'sub_1',
  status: overrides.status ?? 'active',
  created: overrides.created ?? NOW - 1000,
  current_period_end: overrides.current_period_end ?? NOW + 10 * 86400,
  cancel_at_period_end: overrides.cancel_at_period_end ?? false,
  items: { data: [{ id: 'si_1', price: { id: overrides.price ?? 'price_essencial' } }] },
  schedule: overrides.schedule ?? null,
});

describe('regras de assinatura (Stripe)', () => {
  it('sem assinatura, sem plano', () => {
    expect(stripeState(prices, [], NOW)).toMatchObject({ tier: null, status: null, extraSubscriptions: 0 });
  });

  it('pagamento atrasado mantém o plano e é sinalizado', () => {
    const state = stripeState(prices, [sub({ status: 'past_due' })], NOW);
    expect(state.tier).toBe('Essencial');
    expect(state.status).toBe('past_due');
  });

  it('assinaturas canceladas ou incompletas não dão acesso', () => {
    expect(stripeState(prices, [sub({ status: 'canceled' }), sub({ status: 'incomplete' })], NOW).tier).toBeNull();
  });

  it('preço desconhecido não vira plano', () => {
    expect(stripeState(prices, [sub({ price: 'price_outro' })], NOW).tier).toBeNull();
  });

  it('com duas assinaturas vivas (cobrança em dobro), vale a maior e o app avisa', () => {
    const ranked = rankLiveSubscriptions(prices, [sub({ id: 'a', price: 'price_essencial' }), sub({ id: 'b', price: 'price_completo' })]);
    expect(ranked.map((s) => s.id)).toEqual(['b', 'a']);
    expect(stripeState(prices, ranked, NOW)).toMatchObject({ tier: 'Completo', extraSubscriptions: 1 });
  });

  it('cancelamento agendado continua dando acesso até o fim do período', () => {
    const state = stripeState(prices, [sub({ cancel_at_period_end: true })], NOW);
    expect(state).toMatchObject({ tier: 'Essencial', cancelAtPeriodEnd: true });
    expect(state.periodEnd).toBe(new Date((NOW + 10 * 86400) * 1000).toISOString());
  });

  it('lê a troca para baixo agendada', () => {
    const schedule = {
      id: 'sched_1',
      phases: [
        { start_date: NOW - 1000, end_date: NOW + 500, items: [{ price: 'price_completo' }] },
        { start_date: NOW + 500, items: [{ price: { id: 'price_essencial' } }] },
      ],
    };
    const completo = sub({ price: 'price_completo', schedule });
    expect(pendingChange(prices, completo, NOW)).toEqual({ tier: 'Essencial', from: NOW + 500 });
    expect(stripeState(prices, [completo], NOW)).toMatchObject({ tier: 'Completo', pendingTier: 'Essencial' });
    // Fase futura no mesmo plano não é troca.
    expect(pendingChange(prices, sub({ price: 'price_essencial', schedule }), NOW)).toEqual(null);
  });

  it('subir cobra agora; descer vale na renovação', () => {
    expect(changeDirection('Essencial', 'Completo')).toBe('upgrade');
    expect(changeDirection('Completo', 'Essencial')).toBe('downgrade');
    expect(changeDirection('Essencial', 'Essencial')).toBe('same');
  });

  it('cancelamento: na hora só no arrependimento (7 dias) ou com pagamento atrasado', () => {
    expect(cancelMode(true, 'active')).toBe('immediate');
    expect(cancelMode(false, 'past_due')).toBe('immediate');
    expect(cancelMode(false, 'active')).toBe('period_end');
  });

  it('planos novos: Essencial < Flex < Completo, e os nomes antigos viram os novos', () => {
    expect(tierRank('Essencial')).toBeLessThan(tierRank('Flex'));
    expect(tierRank('Flex')).toBeLessThan(tierRank('Completo'));
    expect(parseTier('plus')).toBe('Essencial');
    expect(parseTier('Premium')).toBe('Completo');
    expect(parseTier('flex')).toBe('Flex');
    expect(parseTier('outro')).toBeNull();
    expect(changeDirection('Flex', 'Completo')).toBe('upgrade');
    expect(changeDirection('Flex', 'Essencial')).toBe('downgrade');
  });

  it('Flex: um atendimento no mês, dividido entre SOS e consulta', () => {
    expect(PLAN_LIMITS.Flex).toEqual({ appointments: 1, sos_uses: 1, shared: true });
    expect(PLAN_LIMITS.Completo.shared).toBe(false);
    expect(PLAN_LIMITS.Essencial.appointments).toBe(0);
  });

  it('preço antigo do Premium continua valendo como Completo', () => {
    const withLegacy = { ...prices, legacy: { price_premium_antigo: 'Completo' as const } };
    expect(tierForPrice(withLegacy, 'price_premium_antigo')).toBe('Completo');
    expect(tierForPrice(withLegacy, 'price_flex')).toBe('Flex');
    // Preço não configurado (vazio) nunca casa.
    expect(tierForPrice({ ...prices, Flex: '' }, '')).toBeNull();
  });
});

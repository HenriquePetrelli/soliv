import { describe, expect, it } from 'vitest';
import { cancelledPlanExpired, cancelledPlanLabel, withExpiredCancellation } from '@/lib/subscriptionStatus';

// Pago em 15/03 às 10h (Brasília): o período vai até 15/04 às 10h.
const END = '2026-04-15T13:00:00.000Z';
const BEFORE = new Date('2026-04-15T12:59:00.000Z');
const AFTER = new Date('2026-04-15T13:00:01.000Z');

describe('plano cancelado', () => {
  it('mostra "Plano cancelado - Essencial disponível até" com a data do fim do período pago', () => {
    expect(cancelledPlanLabel('Essencial', true, END, BEFORE)).toBe('Plano cancelado - Essencial disponível até 15/04/2026');
    expect(cancelledPlanLabel('Completo', true, END, BEFORE)).toBe('Plano cancelado - Completo disponível até 15/04/2026');
  });

  it('usa a data de Brasília, não a de UTC (fim às 01h UTC ainda é o dia anterior)', () => {
    expect(cancelledPlanLabel('Essencial', true, '2026-04-16T01:00:00.000Z', BEFORE)).toBe(
      'Plano cancelado - Essencial disponível até 15/04/2026',
    );
  });

  it('sem cancelamento, sem texto', () => {
    expect(cancelledPlanLabel('Essencial', false, END, BEFORE)).toBeNull();
    expect(cancelledPlanLabel(null, true, END, BEFORE)).toBeNull();
  });

  it('o plano vale até o último segundo do período pago', () => {
    expect(cancelledPlanExpired(true, END, BEFORE)).toBe(false);
    expect(cancelledPlanExpired(true, END, AFTER)).toBe(true);
    expect(cancelledPlanExpired(false, END, AFTER)).toBe(false);
  });

  it('depois do período pago, o app mostra o plano grátis', () => {
    const data = {
      subscribed: true,
      subscription_tier: 'Essencial',
      subscription_end: END,
      cancel_at_period_end: true,
      entitlement_source: 'stripe' as const,
      plan_limits: { appointments: 0, sos_uses: 1 },
    };
    expect(cancelledPlanLabel('Essencial', true, END, AFTER)).toBeNull();
    expect(withExpiredCancellation(data, BEFORE)).toBe(data);
    expect(withExpiredCancellation(data, AFTER)).toMatchObject({
      subscribed: false,
      subscription_tier: null,
      cancel_at_period_end: false,
      plan_limits: { appointments: 0, sos_uses: 0 },
    });
  });

  it('não mexe no plano da empresa', () => {
    const data = { subscribed: true, subscription_tier: 'Completo', subscription_end: END, cancel_at_period_end: true, entitlement_source: 'organization' as const };
    expect(withExpiredCancellation(data, AFTER)).toBe(data);
  });
});

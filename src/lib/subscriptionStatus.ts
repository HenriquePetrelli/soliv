// Situação da assinatura própria (Stripe) para exibir no app.
//
// Cancelar fora do prazo de arrependimento mantém o plano até o fim do período
// já pago (`subscriptionEnd`) e ele não renova. Nesse intervalo o app mostra
// "Plano cancelado - Essencial disponível até 15/04/2026"; depois, o plano grátis.

/** Data no formato do Brasil (dd/mm/aaaa), no horário de Brasília. */
export const formatBrazilDate = (iso: string): string =>
  new Date(iso).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });

/** O período pago de um plano cancelado já acabou. */
export const cancelledPlanExpired = (
  cancelAtPeriodEnd: boolean,
  subscriptionEnd: string | null,
  now: Date = new Date(),
): boolean => cancelAtPeriodEnd && !!subscriptionEnd && new Date(subscriptionEnd).getTime() <= now.getTime();

/** "Plano cancelado - Essencial disponível até 15/04/2026", ou null se não se aplica. */
export const cancelledPlanLabel = (
  tier: string | null,
  cancelAtPeriodEnd: boolean,
  subscriptionEnd: string | null,
  now: Date = new Date(),
): string | null => {
  if (!tier || !cancelAtPeriodEnd || !subscriptionEnd) return null;
  if (cancelledPlanExpired(cancelAtPeriodEnd, subscriptionEnd, now)) return null;
  return `Plano cancelado - ${tier} disponível até ${formatBrazilDate(subscriptionEnd)}`;
};

/** Dados de check-subscription com o plano cancelado já vencido tratados como plano grátis. */
// eslint-disable-next-line @typescript-eslint/no-explicit-any
export const withExpiredCancellation = <T extends Record<string, any>>(data: T, now: Date = new Date()): T => {
  if (data?.entitlement_source !== 'stripe') return data;
  if (!cancelledPlanExpired(Boolean(data.cancel_at_period_end), data.subscription_end ?? null, now)) return data;
  return {
    ...data,
    subscribed: false,
    subscription_tier: null,
    subscription_end: null,
    plan_type: null,
    entitlement_source: null,
    cancel_at_period_end: false,
    plan_limits: { appointments: 0, sos_uses: 0 },
    can_schedule_appointment: false,
  };
};

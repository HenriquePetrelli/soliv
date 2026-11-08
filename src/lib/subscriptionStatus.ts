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

/** Resposta da edge function check-subscription (e o cache dela no aparelho). */
export interface CheckSubscriptionData {
  subscribed?: boolean;
  subscription_tier?: string | null;
  subscription_end?: string | null;
  plan_type?: string | null;
  entitlement_source?: 'organization' | 'stripe' | null;
  cancel_at_period_end?: boolean;
  plan_limits?: { appointments: number; sos_uses: number };
  current_usage?: { appointments: number; sos_uses: number };
  can_schedule_appointment?: boolean;
  appointment_reason?: string | null;
  plan_can_schedule_appointment?: boolean;
  plan_appointment_reason?: string | null;
  extra_credits?: { sos?: number; appointment?: number };
  extra_prices?: { sos: number; appointment: number };
  organization_name?: string | null;
  personal_subscription_tier?: string | null;
  pending_tier?: string | null;
  pending_from?: string | null;
  payment_issue?: boolean;
  extra_subscriptions?: number;
}

/** Dados de check-subscription com o plano cancelado já vencido tratados como plano grátis. */
export const withExpiredCancellation = <T extends CheckSubscriptionData>(data: T, now: Date = new Date()): T => {
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

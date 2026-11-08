import React, { createContext, useContext, useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useAuth } from '@/contexts/AuthContext';
import { withExpiredCancellation, type CheckSubscriptionData } from '@/lib/subscriptionStatus';
import { EXTRA_PRICES_CENTS, hasPaidPlan as tierIsPaid, parsePlanTier, type ExtraKind, type PlanTier } from '@/lib/plans';

interface SubscriptionContextType {
  subscribed: boolean;
  subscriptionTier: PlanTier | null;
  /** Essencial, Flex ou Completo ativo (o Plano Grátis tem recursos só de leitura). */
  hasPaidPlan: boolean;
  subscriptionEnd: string | null;
  planLimits: { appointments: number; sos_uses: number };
  currentUsage: { appointments: number; sos_uses: number };
  canScheduleAppointment: boolean;
  appointmentReason: string | null;
  /** Cota do próprio plano (sem contar avulsos) e o motivo quando não há. */
  planCanScheduleAppointment: boolean;
  planAppointmentReason: string | null;
  /** Atendimentos avulsos pagos e ainda não usados. */
  extraCredits: Record<ExtraKind, number>;
  /** Preço do avulso para esta pessoa (assinante paga menos), em centavos. */
  extraPrices: Record<ExtraKind, number>;
  /** De onde vem o plano: assinatura própria (Stripe) ou benefício da empresa (B2B). */
  entitlementSource: 'stripe' | 'organization' | null;
  /** Nome da empresa, quando o plano vem dela. */
  organizationName: string | null;
  /** Assinatura própria (Stripe) que a pessoa ainda paga, mesmo com o plano da empresa. */
  personalSubscriptionTier: string | null;
  /** Assinatura própria: cancelada, mas ativa até `subscriptionEnd`. */
  cancelAtPeriodEnd: boolean;
  /** Troca para baixo agendada para a renovação. */
  pendingTier: string | null;
  pendingFrom: string | null;
  /** Renovação recusada: o Stripe está tentando cobrar de novo. */
  paymentIssue: boolean;
  /** Assinaturas a mais pagas ao mesmo tempo (cobrança em dobro). */
  extraSubscriptions: number;
  loading: boolean;
  /** `force`: consulta o Stripe agora, sem usar o cache do servidor (ex.: volta do checkout). */
  checkSubscription: (options?: { force?: boolean }) => Promise<void>;
}

const SubscriptionContext = createContext<SubscriptionContextType | undefined>(undefined);

export const useSubscription = () => {
  const context = useContext(SubscriptionContext);
  if (context === undefined) {
    throw new Error('useSubscription must be used within a SubscriptionProvider');
  }
  return context;
};

/**
 * O mesmo, mas sem exigir o provider (telas reaproveitadas fora dele, como
 * nos testes). Sem provider não há plano conhecido: quem usa trata como
 * "não sei" e deixa o banco conferir.
 */
export const useOptionalSubscription = () => useContext(SubscriptionContext);

const CACHE_PREFIX = 'soliv:subscription:';

const readCachedSubscription = (userId: string): unknown | null => {
  try {
    const raw = sessionStorage.getItem(CACHE_PREFIX + userId);
    return raw ? JSON.parse(raw) : null;
  } catch {
    return null;
  }
};

const writeCachedSubscription = (userId: string, data: unknown) => {
  try {
    sessionStorage.setItem(CACHE_PREFIX + userId, JSON.stringify(data));
  } catch {
    // armazenamento bloqueado (modo privado): segue sem cache
  }
};

export const SubscriptionProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [subscribed, setSubscribed] = useState(false);
  const [subscriptionTier, setSubscriptionTier] = useState<PlanTier | null>(null);
  const [subscriptionEnd, setSubscriptionEnd] = useState<string | null>(null);
  const [planLimits, setPlanLimits] = useState({ appointments: 0, sos_uses: 0 });
  const [currentUsage, setCurrentUsage] = useState({ appointments: 0, sos_uses: 0 });
  const [canScheduleAppointment, setCanScheduleAppointment] = useState(false);
  const [appointmentReason, setAppointmentReason] = useState<string | null>(null);
  const [planCanScheduleAppointment, setPlanCanScheduleAppointment] = useState(false);
  const [planAppointmentReason, setPlanAppointmentReason] = useState<string | null>(null);
  const [extraCredits, setExtraCredits] = useState<Record<ExtraKind, number>>({ sos: 0, appointment: 0 });
  const [extraPrices, setExtraPrices] = useState<Record<ExtraKind, number>>(EXTRA_PRICES_CENTS.free);
  const [entitlementSource, setEntitlementSource] = useState<'stripe' | 'organization' | null>(null);
  const [organizationName, setOrganizationName] = useState<string | null>(null);
  const [personalSubscriptionTier, setPersonalSubscriptionTier] = useState<string | null>(null);
  const [cancelAtPeriodEnd, setCancelAtPeriodEnd] = useState(false);
  const [pendingTier, setPendingTier] = useState<string | null>(null);
  const [pendingFrom, setPendingFrom] = useState<string | null>(null);
  const [paymentIssue, setPaymentIssue] = useState(false);
  const [extraSubscriptions, setExtraSubscriptions] = useState(0);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { user, userType } = useAuth();
  // Assinatura é só de paciente. Psicólogo, admin e conta em análise (que a
  // tela de login desconecta logo em seguida) não consultam o Stripe.
  const patientId = user && userType === 'patient' ? user.id : null;
  const isPatient = patientId !== null;
  const activeUserId = useRef<string | null>(null);
  activeUserId.current = patientId;

  const applySubscriptionData = (raw: CheckSubscriptionData | null) => {
    // Plano cancelado cujo período pago acabou: já mostra o plano grátis, sem
    // esperar o Stripe e o banco encerrarem (alguns minutos depois).
    const data = withExpiredCancellation(raw ?? {});
    setSubscribed(data.subscribed || false);
    // Normaliza nomes antigos (Plus/Premium) que podem vir do cache da sessão.
    setSubscriptionTier(parsePlanTier(data.subscription_tier));
    setSubscriptionEnd(data.subscription_end);
    setPlanLimits(data.plan_limits || { appointments: 0, sos_uses: 0 });
    setCurrentUsage(data.current_usage || { appointments: 0, sos_uses: 0 });
    setCanScheduleAppointment(data.can_schedule_appointment ?? false);
    setAppointmentReason(data.appointment_reason ?? null);
    setPlanCanScheduleAppointment(data.plan_can_schedule_appointment ?? data.can_schedule_appointment ?? false);
    setPlanAppointmentReason(data.plan_appointment_reason ?? data.appointment_reason ?? null);
    setExtraCredits({ sos: Number(data.extra_credits?.sos ?? 0), appointment: Number(data.extra_credits?.appointment ?? 0) });
    setExtraPrices(
      data.extra_prices
        ? { sos: Number(data.extra_prices.sos), appointment: Number(data.extra_prices.appointment) }
        : EXTRA_PRICES_CENTS[tierIsPaid(Boolean(data.subscribed), parsePlanTier(data.subscription_tier)) ? 'plan' : 'free'],
    );
    setEntitlementSource(data.entitlement_source ?? null);
    setOrganizationName(data.organization_name ?? null);
    setPersonalSubscriptionTier(parsePlanTier(data.personal_subscription_tier));
    setCancelAtPeriodEnd(data.cancel_at_period_end ?? false);
    setPendingTier(parsePlanTier(data.pending_tier));
    setPendingFrom(data.pending_from ?? null);
    setPaymentIssue(data.payment_issue ?? false);
    setExtraSubscriptions(data.extra_subscriptions ?? 0);
  };

  const checkSubscription = async (options?: { force?: boolean }) => {
    try {
      const userId = activeUserId.current;
      if (!user || !userId) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase.functions.invoke('check-subscription', {
        body: { force: options?.force === true },
      });

      // Saiu da conta (ou trocou de conta) enquanto a conferência rodava: a
      // resposta não vale mais e a falha esperada não é mostrada como erro.
      if (activeUserId.current !== userId) return;

      if (error) {
        const { data: current } = await supabase.auth.getSession();
        if (current.session?.user.id !== userId || activeUserId.current !== userId) return;
        console.warn('Error checking subscription:', error);
        toast({
          title: "Erro",
          description: "Erro ao verificar assinatura",
          variant: "destructive",
        });
        return;
      }

      applySubscriptionData(data);
      writeCachedSubscription(userId, data);
    } catch (error) {
      console.warn('Error checking subscription:', error);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    if (!patientId) {
      setSubscribed(false);
      setSubscriptionTier(null);
      setSubscriptionEnd(null);
      setPlanLimits({ appointments: 0, sos_uses: 0 });
      setCurrentUsage({ appointments: 0, sos_uses: 0 });
      setCanScheduleAppointment(false);
      setAppointmentReason(null);
      setEntitlementSource(null);
      setOrganizationName(null);
      setPersonalSubscriptionTier(null);
      setCancelAtPeriodEnd(false);
      setPendingTier(null);
      setPendingFrom(null);
      setPaymentIssue(false);
      setExtraSubscriptions(0);
      setLoading(false);
      return;
    }

    // Mostra na hora o último plano conhecido nesta sessão; a conferência no
    // Stripe (1-2s) roda em seguida e corrige se algo mudou. Só exibição: o
    // servidor confere o plano de novo em cada uso (SOS, agendamento).
    const cached = readCachedSubscription(patientId);
    if (cached) {
      applySubscriptionData(cached);
      setLoading(false);
    }

    const scheduleCheck = () => checkSubscription();
    const idle = globalThis as typeof globalThis & {
      requestIdleCallback?: (callback: () => void, options?: { timeout?: number }) => number;
      cancelIdleCallback?: (handle: number) => void;
    };

    if (idle.requestIdleCallback) {
      const handle = idle.requestIdleCallback(scheduleCheck, { timeout: 1500 });
      return () => idle.cancelIdleCallback?.(handle);
    }

    const timeout = globalThis.setTimeout(scheduleCheck, 500);
    return () => globalThis.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId]);

  // Com o app aberto na hora em que o plano cancelado acaba, confere de novo
  // para trocar para o plano grátis sem precisar recarregar.
  useEffect(() => {
    if (!isPatient || !cancelAtPeriodEnd || !subscriptionEnd) return;
    const ms = new Date(subscriptionEnd).getTime() - Date.now();
    if (ms < 0 || ms > 24 * 60 * 60 * 1000) return;
    const timeout = globalThis.setTimeout(() => checkSubscription({ force: true }), ms + 1000);
    return () => globalThis.clearTimeout(timeout);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [patientId, cancelAtPeriodEnd, subscriptionEnd]);

  return (
    <SubscriptionContext.Provider
      value={{
        subscribed,
        subscriptionTier,
        hasPaidPlan: tierIsPaid(subscribed, subscriptionTier),
        subscriptionEnd,
        planLimits,
        currentUsage,
        canScheduleAppointment,
        appointmentReason,
        planCanScheduleAppointment,
        planAppointmentReason,
        extraCredits,
        extraPrices,
        entitlementSource,
        organizationName,
        personalSubscriptionTier,
        cancelAtPeriodEnd,
        pendingTier,
        pendingFrom,
        paymentIssue,
        extraSubscriptions,
        loading,
        checkSubscription,
      }}
    >
      {children}
    </SubscriptionContext.Provider>
  );
};
import { useOptionalSubscription } from '@/contexts/SubscriptionContext';
import { FREE_MAX_HABITS, FREE_MAX_SAFETY_PLANS, hasPaidPlan } from '@/lib/plans';
import { MAX_ACTIVE_HABITS } from '@/lib/habits';
import { MAX_SAFETY_PLANS } from '@/lib/safetyPlan';

/**
 * Limites que dependem do plano: no Plano Grátis cabem 3 hábitos e 1 plano de
 * segurança; nos pagos, 10 de cada. Enquanto o plano carrega, vale o limite
 * maior (o banco confere de novo e recusa o que passar).
 */
export const usePlanLimits = () => {
  const subscription = useOptionalSubscription();
  const isFree = Boolean(subscription && !subscription.loading && !hasPaidPlan(subscription.subscribed, subscription.subscriptionTier));
  return {
    /** Plano Grátis confirmado (diário e chat só leitura; 3 hábitos; 1 plano de segurança). */
    isFree,
    maxHabits: isFree ? FREE_MAX_HABITS : MAX_ACTIVE_HABITS,
    maxSafetyPlans: isFree ? FREE_MAX_SAFETY_PLANS : MAX_SAFETY_PLANS,
  };
};

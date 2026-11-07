// Catálogo dos planos mostrado nas telas (preço e benefícios). Fonte única:
// o preço cobrado é o do Stripe (STRIPE_PRICE_ESSENCIAL / STRIPE_PRICE_FLEX /
// STRIPE_PRICE_COMPLETO) e os limites de uso vêm do servidor (PLAN_LIMITS em
// supabase/functions/_shared/billing.ts). Se o preço mudar no Stripe, mude aqui.

export type PlanTier = 'Essencial' | 'Flex' | 'Completo';

export interface PlanInfo {
  id: 'essencial' | 'flex' | 'completo';
  name: PlanTier;
  price: string;
  period: string;
  /** Resumo do atendimento com psicólogo incluído no mês. */
  consultation: string;
  features: string[];
  popular?: boolean;
}

/** O que todos os planos pagos têm além do atendimento. */
const PAID_EXTRAS = [
  'Respiração guiada e sons terapêuticos',
  'Grupos de apoio: ler e publicar',
  'Diário, hábitos e planos de segurança completos',
  'Chat com o psicólogo',
];

export const PLANS: Record<PlanTier, PlanInfo> = {
  Essencial: {
    id: 'essencial',
    name: 'Essencial',
    price: 'R$ 69,90',
    period: '/mês',
    consultation: 'SOS',
    features: ['1 atendimento SOS por mês, de até 25 minutos', ...PAID_EXTRAS],
  },
  Flex: {
    id: 'flex',
    name: 'Flex',
    price: 'R$ 120,00',
    period: '/mês',
    consultation: 'SOS ou agendada',
    features: [
      '1 atendimento por mês: SOS (até 25 minutos) ou consulta agendada (50 minutos), você escolhe',
      ...PAID_EXTRAS,
    ],
    popular: true,
  },
  Completo: {
    id: 'completo',
    name: 'Completo',
    price: 'R$ 159,90',
    period: '/mês',
    consultation: 'SOS e agendada',
    features: [
      '1 atendimento SOS por mês, de até 25 minutos',
      '1 consulta agendada por mês, de 50 minutos',
      ...PAID_EXTRAS,
    ],
  },
};

export const PLAN_LIST: PlanInfo[] = [PLANS.Essencial, PLANS.Flex, PLANS.Completo];

export const FREE_PLAN = {
  name: 'Plano Grátis',
  price: 'R$ 0',
  features: [
    'Respiração guiada e sons terapêuticos',
    'Grupos de apoio: só leitura',
    'Diário: só leitura',
    "Até 3 hábitos e 1 plano de segurança",
    'Chat: só leitura',
  ],
};

/** Limites do Plano Grátis (o banco confere de novo). */
export const FREE_MAX_HABITS = 3;
export const FREE_MAX_SAFETY_PLANS = 1;

/** Nome do plano, aceitando os nomes antigos (Plus → Essencial, Premium → Completo). */
export const parsePlanTier = (value: unknown): PlanTier | null => {
  switch (String(value ?? '').trim().toLowerCase()) {
    case 'essencial':
    case 'plus':
      return 'Essencial';
    case 'flex':
      return 'Flex';
    case 'completo':
    case 'premium':
      return 'Completo';
    default:
      return null;
  }
};

export const planTierRank = (tier: string | null | undefined): number => {
  const parsed = parsePlanTier(tier);
  return parsed === 'Completo' ? 3 : parsed === 'Flex' ? 2 : parsed === 'Essencial' ? 1 : 0;
};

/** Flex e Completo agendam consultas. */
export const tierHasAppointments = (tier: string | null | undefined): boolean => {
  const parsed = parsePlanTier(tier);
  return parsed === 'Flex' || parsed === 'Completo';
};

/** Tem um plano pago (Essencial, Flex ou Completo)? */
export const hasPaidPlan = (subscribed: boolean, tier: string | null | undefined): boolean =>
  subscribed && parsePlanTier(tier) !== null;

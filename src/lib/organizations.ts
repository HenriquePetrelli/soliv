import type { PlanTier } from '@/lib/plans';
// B2B: benefício oferecido pela empresa. As regras ficam no banco
// (join_organization, organization_entitlement); aqui só os textos.

export type JoinErrorCode =
  | 'invalid_code'
  | 'inactive'
  | 'domain_mismatch'
  | 'no_seats'
  | 'already_member'
  | 'not_patient'
  | 'not_authenticated'
  | 'too_many_attempts'
  | 'removed_by_company'
  | 'email_not_confirmed';

export interface JoinResult {
  ok: boolean;
  error?: JoinErrorCode;
  organization?: string;
  tier?: PlanTier;
  domain?: string;
  already?: boolean;
}

export const joinErrorMessage = (result: Pick<JoinResult, 'error' | 'domain'>): string => {
  switch (result.error) {
    case 'invalid_code':
      return 'Código não encontrado. Confira com o RH da sua empresa.';
    case 'inactive':
      return 'O contrato da sua empresa com o Soliv não está ativo. Fale com o RH.';
    case 'domain_mismatch':
      return `Este código vale só para e-mails @${result.domain}. Use a sua conta com o e-mail da empresa.`;
    case 'no_seats':
      return 'As vagas do benefício da sua empresa acabaram. Fale com o RH.';
    case 'already_member':
      return 'Você já tem o benefício de outra empresa. Saia dele antes de usar este código.';
    case 'too_many_attempts':
      return 'Muitas tentativas de código. Aguarde 15 minutos e tente de novo.';
    case 'removed_by_company':
      return 'Seu acesso ao benefício desta empresa foi encerrado pelo RH. Se foi engano, fale com o RH.';
    case 'email_not_confirmed':
      return 'Confirme o seu e-mail (link enviado no cadastro) para usar o benefício da empresa.';
    case 'not_patient':
      return 'O benefício da empresa é para contas de paciente.';
    default:
      return 'Não foi possível usar o código agora. Tente de novo.';
  }
};

/** O que cada plano inclui (mesmas regras da tela de planos e dos Termos). */
export const PLAN_INCLUDES: Record<PlanTier, string[]> = {
  Essencial: ['1 atendimento SOS por mês, de até 25 minutos', 'Respiração, sons, diário, hábitos, planos de segurança, grupos e chat'],
  Flex: [
    '1 atendimento por mês: SOS (até 25 minutos) ou consulta agendada (50 minutos)',
    'Respiração, sons, diário, hábitos, planos de segurança, grupos e chat',
  ],
  Completo: [
    '1 atendimento SOS por mês, de até 25 minutos',
    '1 consulta agendada por mês, de 50 minutos',
    'Respiração, sons, diário, hábitos, planos de segurança, grupos e chat',
  ],
};

export const normalizeInviteCode = (code: string) => code.toUpperCase().replace(/[^A-Z0-9]/g, '');

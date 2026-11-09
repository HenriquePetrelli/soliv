import { supabase } from '@/integrations/supabase/client';

/** Rota da tela do código de verificação do admin. */
export const ADMIN_MFA_PATH = '/admin/verificacao';

/**
 * O código do app autenticador é exigido do admin? Só em produção: com o app
 * em teste (public.app_settings), a senha basta. Na dúvida, exige.
 */
export const isAdminMfaRequired = async (): Promise<boolean> => {
  try {
    const { data, error } = await supabase.rpc('admin_mfa_required');
    if (error) return true;
    return data !== false;
  } catch {
    return true;
  }
};

/**
 * True se o admin pode usar o painel nesta sessão: já passou pela verificação
 * em duas etapas (nível "aal2") ou o app está em teste, quando o código não é
 * pedido. Em produção, o banco e as funções de admin só aceitam o admin com
 * aal2; com a senha sozinha (aal1), a conta não acessa nada do painel.
 */
export const hasAdminMfaSession = async (): Promise<boolean> => {
  const { data, error } = await supabase.auth.mfa.getAuthenticatorAssuranceLevel();
  if (!error && data?.currentLevel === 'aal2') return true;
  return !(await isAdminMfaRequired());
};

export const mfaErrorMessage = (error: unknown): string => {
  const message = error instanceof Error ? error.message : String((error as { message?: unknown })?.message ?? '');
  if (/invalid|expired|code/i.test(message)) {
    return 'Código inválido ou expirado. Confira se o horário do celular está certo e digite o código que aparece agora.';
  }
  if (/rate|too many/i.test(message)) return 'Muitas tentativas. Espere um minuto e tente de novo.';
  return 'Não foi possível confirmar agora. Tente de novo.';
};

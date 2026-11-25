// Cadastro só com código de convite (enquanto o app está em teste).
// O código fica no banco (app_settings.signup_invite_code); o banco recusa a
// conta sem ele. Aqui o app só pergunta se o cadastro está fechado e se o
// código digitado vale, para avisar antes de enviar o formulário.

import { useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';

/** Chave dos dados do cadastro que o banco confere (e apaga depois). */
export const SIGNUP_INVITE_METADATA_KEY = 'signup_invite_code';

export type SignupInviteError = 'invalid' | 'too_many_attempts' | 'unavailable';

export const normalizeSignupInviteCode = (code: string): string => code.replace(/\s/g, '').toUpperCase();

export const signupInviteErrorMessage = (error: SignupInviteError): string => {
  switch (error) {
    case 'too_many_attempts':
      return 'Muitos códigos errados em pouco tempo. Espere 15 minutos e tente de novo.';
    case 'unavailable':
      return 'Não foi possível conferir o código agora. Tente de novo.';
    default:
      return 'Código de convite inválido. Confira com quem te convidou.';
  }
};

/** Dados extras do cadastro: o código, só quando foi digitado. */
export const signupInviteMetadata = (code: string): Record<string, string> => {
  const normalized = normalizeSignupInviteCode(code);
  return normalized ? { [SIGNUP_INVITE_METADATA_KEY]: normalized } : {};
};

// Códigos que o banco já confirmou nesta aba: não pergunta de novo (o campo
// confere ao sair e o formulário confere ao enviar; cada envio que volta por
// outro campo errado conferia outra vez).
const confirmedCodes = new Set<string>();

/** Só para os testes. */
export const resetSignupInviteCache = () => confirmedCodes.clear();

type InviteRpcResult = { valid?: boolean; error?: SignupInviteError } | null;

const askDatabase = async (code: string) => {
  const { data, error } = await supabase.rpc('check_signup_invite_code', { p_code: code });
  return { result: data as InviteRpcResult, failed: Boolean(error) || !data };
};

export async function checkSignupInviteCode(code: string): Promise<{ valid: boolean; error?: SignupInviteError }> {
  const normalized = normalizeSignupInviteCode(code);
  if (confirmedCodes.has(normalized)) return { valid: true };

  // Uma falha de rede passageira não deve virar "tente de novo": pergunta mais uma vez.
  let { result, failed } = await askDatabase(normalized);
  if (failed) {
    await new Promise((resolve) => setTimeout(resolve, 600));
    ({ result, failed } = await askDatabase(normalized));
  }
  if (failed || !result) return { valid: false, error: 'unavailable' };
  if (result.valid) {
    confirmedCodes.add(normalized);
    return { valid: true };
  }
  return { valid: false, error: result.error === 'too_many_attempts' ? 'too_many_attempts' : 'invalid' };
}

/**
 * O cadastro está fechado (pede código)? Enquanto não sabe, ou se a pergunta
 * falhar, considera fechado: o campo aparece e o banco decide no fim.
 */
export function useSignupInviteRequired(): boolean {
  const [required, setRequired] = useState(true);
  useEffect(() => {
    let active = true;
    void supabase.rpc('signup_invite_required').then(({ data, error }) => {
      if (active && !error && data === false) setRequired(false);
    });
    return () => {
      active = false;
    };
  }, []);
  return required;
}

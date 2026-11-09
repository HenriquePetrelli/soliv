import { supabase } from '@/integrations/supabase/client';

/**
 * Tudo o que o app precisa saber logo depois do login, numa consulta só
 * (`get_login_state`). A tela de login e o controle de acesso (AuthContext)
 * pedem ao mesmo tempo; a busca é feita uma vez e compartilhada.
 */

export interface BlockInfo {
  is_blocked: boolean | null;
  blocked_until: string | null;
  blocked_reason: string | null;
  blocked_at?: string | null;
}

export interface LoginState {
  /** Conta de admin (cadastro em admin_users), mesmo antes do código de verificação. */
  is_admin: boolean;
  /** Admin que já passou pela verificação em duas etapas nesta sessão. */
  admin_verified?: boolean;
  /** Código de verificação exigido do admin (só em produção). */
  admin_mfa_required?: boolean;
  profile: { user_type: string | null; full_name: string | null } | null;
  patient: BlockInfo | null;
  psychologist: (BlockInfo & { approved: boolean | null; approval_status: string | null }) | null;
  registration: { status: string | null; rejected_at: string | null; rejection_reason: string | null } | null;
  rejection: {
    is_rejected: boolean | null;
    should_show_rejection_message: boolean | null;
    should_cleanup: boolean | null;
  } | null;
}

export type ResolvedUserType = 'patient' | 'psychologist' | 'admin' | 'unknown';

/** Tipo de conta a partir do estado do login (mesmas regras de antes). */
export const userTypeFromLoginState = (state: LoginState | null): ResolvedUserType => {
  if (!state) return 'unknown';
  if (state.is_admin) return 'admin';
  if (state.rejection?.is_rejected && (state.rejection.should_show_rejection_message || state.rejection.should_cleanup)) {
    return 'unknown';
  }
  const type = state.profile?.user_type;
  if (type === 'psychologist') {
    const approved =
      state.registration?.status === 'approved' ||
      (state.psychologist?.approved === true && state.psychologist.approval_status === 'approved');
    return approved ? 'psychologist' : 'unknown';
  }
  if (type === 'patient') return 'patient';
  return 'unknown';
};

// Sem a função no banco (antes da migração ser aplicada): as mesmas
// informações em consultas paralelas.
const fetchLegacy = async (userId: string): Promise<LoginState> => {
  const [admin, profile, patient, psychologist, registration, rejection] = await Promise.all([
    supabase.rpc('is_super_admin', { user_id_param: userId }),
    supabase.from('profiles').select('user_type, full_name').eq('user_id', userId).maybeSingle(),
    supabase.from('patients').select('is_blocked, blocked_until, blocked_reason').eq('user_id', userId).maybeSingle(),
    supabase
      .from('psychologists')
      .select('approved, approval_status, is_blocked, blocked_until, blocked_reason')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase
      .from('psychologist_registrations')
      .select('status, rejected_at, rejection_reason')
      .eq('user_id', userId)
      .maybeSingle(),
    supabase.rpc('get_psychologist_rejection_status', { p_user_id: userId }),
  ]);
  return {
    is_admin: admin.data === true,
    profile: (profile.data as LoginState['profile']) ?? null,
    patient: (patient.data as LoginState['patient']) ?? null,
    psychologist: (psychologist.data as LoginState['psychologist']) ?? null,
    registration: (registration.data as LoginState['registration']) ?? null,
    rejection: ((rejection.data as LoginState['rejection'][] | null)?.[0] as LoginState['rejection']) ?? null,
  };
};

const fetchOnce = async (userId: string): Promise<LoginState> => {
  const { data, error } = await supabase.rpc('get_login_state');
  if (error || !data) {
    // Função ainda não existe no banco (PGRST202), falha momentânea ou
    // resposta vazia: as mesmas informações pelas consultas antigas.
    return fetchLegacy(userId);
  }
  return data as unknown as LoginState;
};

const CACHE_MS = 15_000;
let cached: { userId: string; at: number; promise: Promise<LoginState> } | null = null;

/** Estado do login do usuário, buscado uma vez e reaproveitado por 15 s. */
export const fetchLoginState = (userId: string): Promise<LoginState> => {
  if (cached && cached.userId === userId && Date.now() - cached.at < CACHE_MS) return cached.promise;
  const promise = fetchOnce(userId);
  cached = { userId, at: Date.now(), promise };
  promise.catch(() => {
    if (cached?.promise === promise) cached = null;
  });
  return promise;
};

/** Esquece o estado guardado (saída da conta, mudança de cadastro). */
export const clearLoginState = () => {
  cached = null;
};

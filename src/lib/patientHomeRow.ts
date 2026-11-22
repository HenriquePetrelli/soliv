import { supabase } from '@/integrations/supabase/client';

/**
 * A linha do paciente que a tela inicial precisa logo ao abrir, numa consulta
 * só. Antes a tela inicial, o layout e a conferência de identidade pediam cada
 * um o seu pedaço de `patients` (três idas ao servidor), e só depois que o
 * código da tela tinha baixado. Agora a tela de login começa a buscar assim
 * que a senha é aceita, junto com o tipo da conta, e quem abrir em seguida
 * reaproveita a resposta.
 *
 * A resposta vale por pouco tempo (só para a abertura) e é descartada em
 * qualquer gravação em `patients` feita pelo app (forgetPatientHomeRow).
 */
export const PATIENT_HOME_FIELDS =
  'last_mood_date, last_mood_value, daily_mood_enabled, show_weekly_goal_modal, show_goal_modal, ' +
  'identity_status, identity_rejection_reason, identity_submitted_at, identity_reviewed_at, identity_prompt_seen_at, identity_prompt_after_plan_at';

export type PatientHomeRow = {
  last_mood_date: string | null;
  last_mood_value: number | null;
  daily_mood_enabled: boolean | null;
  show_weekly_goal_modal: boolean | null;
  show_goal_modal: boolean | null;
  identity_status: string | null;
  identity_rejection_reason: string | null;
  identity_submitted_at: string | null;
  identity_reviewed_at: string | null;
  identity_prompt_seen_at: string | null;
  identity_prompt_after_plan_at: string | null;
};

type Result = { data: PatientHomeRow | null; error: unknown };

/** Quanto tempo a resposta serve para quem abrir em seguida. */
export const PATIENT_HOME_ROW_TTL_MS = 15_000;

let entry: { userId: string; at: number; promise: Promise<Result> } | null = null;

const fetchRow = (userId: string): Promise<Result> =>
  Promise.resolve(
    supabase.from('patients').select(PATIENT_HOME_FIELDS).eq('user_id', userId).maybeSingle(),
  ).then(
    ({ data, error }) => ({ data: (data as unknown as PatientHomeRow | null) ?? null, error }),
    (error: unknown) => ({ data: null, error }),
  );

/**
 * A linha do paciente: a que já está a caminho (ou chegou há pouco) ou uma
 * consulta nova. `fresh` ignora a guardada (ex.: aviso de mudança no banco).
 */
export const getPatientHomeRow = (userId: string, options?: { fresh?: boolean }): Promise<Result> => {
  const now = Date.now();
  if (!options?.fresh && entry && entry.userId === userId && now - entry.at < PATIENT_HOME_ROW_TTL_MS) {
    return entry.promise;
  }
  const promise = fetchRow(userId);
  entry = { userId, at: now, promise };
  // Falhou: a próxima tela tenta de novo em vez de reaproveitar o erro.
  void promise.then(({ error }) => {
    if (error && entry?.promise === promise) entry = null;
  });
  return promise;
};

/** Começa a buscar já (tela de login, assim que a senha é aceita). */
export const prefetchPatientHomeRow = (userId: string) => {
  void getPatientHomeRow(userId);
};

/** O app gravou algo em `patients`: a próxima leitura vai ao servidor. */
export const forgetPatientHomeRow = () => {
  entry = null;
};

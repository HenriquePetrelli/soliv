/**
 * Verificação de identidade do paciente.
 *
 * SOS e agendamento só funcionam com a identidade aprovada pelo admin (o
 * servidor também confere). A modal que pede o documento aparece sozinha:
 *  - uma vez, no primeiro login;
 *  - se a pessoa escolheu "Não autenticar agora", mais uma vez, quando pagar
 *    um plano pela primeira vez;
 * e sempre que ela tocar em SOS ou Agendamento sem a identidade aprovada.
 */

export type IdentityStatus = 'nao_enviado' | 'pendente' | 'aprovado' | 'recusado';

export const IDENTITY_BUCKET = 'patient-identity';
export const IDENTITY_MAX_BYTES = 10 * 1024 * 1024;
export const IDENTITY_ACCEPTED_TYPES = ['image/jpeg', 'image/png', 'image/webp', 'image/heic', 'image/heif'];

export interface PatientIdentityFields {
  identity_status: string | null;
  identity_rejection_reason?: string | null;
  identity_submitted_at?: string | null;
  identity_reviewed_at?: string | null;
  identity_document_path?: string | null;
  identity_prompt_seen_at?: string | null;
  identity_prompt_after_plan_at?: string | null;
}

export const parseIdentityStatus = (value: unknown): IdentityStatus =>
  value === 'pendente' || value === 'aprovado' || value === 'recusado' ? value : 'nao_enviado';

/** Por que a modal abriu (muda o título e o texto). */
export type IdentityPromptReason = 'first_login' | 'first_plan' | 'sos' | 'appointment' | 'manual';

/**
 * Qual modal automática mostrar agora (ou nenhuma).
 * `hasPaidPlan` só vale quando a assinatura já terminou de carregar.
 */
export const autoPromptFor = (
  fields: PatientIdentityFields,
  hasPaidPlan: boolean,
): Extract<IdentityPromptReason, 'first_login' | 'first_plan'> | null => {
  const status = parseIdentityStatus(fields.identity_status);
  if (status === 'aprovado' || status === 'pendente') return null;
  if (!fields.identity_prompt_seen_at) return 'first_login';
  if (hasPaidPlan && !fields.identity_prompt_after_plan_at) return 'first_plan';
  return null;
};

/**
 * Marcas gravadas quando a modal automática é mostrada. Quem já tem plano no
 * primeiro login não vê a modal de novo "depois do primeiro plano".
 */
export const promptMarksFor = (
  reason: 'first_login' | 'first_plan',
  hasPaidPlan: boolean,
  nowIso: string = new Date().toISOString(),
): Pick<PatientIdentityFields, 'identity_prompt_seen_at' | 'identity_prompt_after_plan_at'> => {
  if (reason === 'first_login') {
    return hasPaidPlan
      ? { identity_prompt_seen_at: nowIso, identity_prompt_after_plan_at: nowIso }
      : { identity_prompt_seen_at: nowIso };
  }
  return { identity_prompt_after_plan_at: nowIso };
};

/** Confere o arquivo antes de enviar; devolve a mensagem de erro ou null. */
export const validateIdentityFile = (file: { type: string; size: number; name?: string }): string | null => {
  const type = (file.type || '').toLowerCase();
  const ext = (file.name || '').split('.').pop()?.toLowerCase() ?? '';
  const isImage = IDENTITY_ACCEPTED_TYPES.includes(type) || (!type && ['jpg', 'jpeg', 'png', 'webp', 'heic', 'heif'].includes(ext));
  if (!isImage) return 'Envie uma foto ou imagem do documento (JPG, PNG, WEBP ou HEIC).';
  if (file.size <= 0) return 'O arquivo está vazio. Escolha outra imagem.';
  if (file.size > IDENTITY_MAX_BYTES) return 'A imagem passa de 10 MB. Tire outra foto ou reduza o tamanho.';
  return null;
};

/** Caminho no bucket: a pasta é o id do usuário (a política do Storage confere). */
export const identityDocumentPath = (userId: string, file: { type: string; name?: string }, now = Date.now()) => {
  const fromName = (file.name || '').split('.').pop()?.toLowerCase();
  const fromType = (file.type || '').split('/')[1]?.toLowerCase();
  const raw = fromName && fromName.length <= 5 && fromName !== file.name?.toLowerCase() ? fromName : fromType || 'jpg';
  const ext = raw === 'jpeg' ? 'jpg' : raw.replace(/[^a-z0-9]/g, '') || 'jpg';
  return `${userId}/documento-${now}.${ext}`;
};

export const IDENTITY_STATUS_LABEL: Record<IdentityStatus, string> = {
  nao_enviado: 'Não enviada',
  pendente: 'Em análise',
  aprovado: 'Confirmada',
  recusado: 'Recusada',
};

/**
 * Canonical `end_reason` vocabulary for `emergency_requests`.
 *
 * A single value per concept — never two strings meaning the same thing.
 * Anything that is not in this list must not be persisted.
 */
export const END_REASONS = {
  /** Patient pressed "cancelar solicitação" while still `pending`. */
  CANCELLED_BY_PATIENT: 'cancelled_by_patient',
  /** Patient left the waiting room and never came back. */
  ABANDONED: 'abandoned',
  /** Nobody accepted the request within the allowed window. */
  EXPIRED: 'expired',
  /** Patient explicitly ended an ongoing call. */
  COMPLETED_BY_PATIENT: 'completed_by_patient',
  /** Psychologist explicitly ended an ongoing call. */
  COMPLETED_BY_PSYCHOLOGIST: 'completed_by_psychologist',
  /** The 20-minute limit was reached; ended by the system. */
  TIME_LIMIT: 'time_limit',
  /** The call could not be sustained (network/ICE failure). */
  CONNECTION_FAILURE: 'connection_failure',
  /** Media/device or other technical problem. */
  TECHNICAL_ISSUE: 'technical_issue',
  /**
   * Psychologist lost the connection and did not come back within 3 minutes
   * (set only by the database): not paid, and the SOS goes back to the patient.
   */
  PSYCHOLOGIST_DROPPED: 'psychologist_dropped',
  /** Anything else — always accompanied by `end_notes`. */
  OTHER: 'other',
} as const;

export type EndReason = (typeof END_REASONS)[keyof typeof END_REASONS];

export const ALL_END_REASONS: EndReason[] = Object.values(END_REASONS);

export const isEndReason = (value: unknown): value is EndReason =>
  typeof value === 'string' && (ALL_END_REASONS as string[]).includes(value);

/** The canonical reason for an explicit termination by a participant. */
export const completionReasonFor = (userType: 'patient' | 'psychologist'): EndReason =>
  userType === 'psychologist'
    ? END_REASONS.COMPLETED_BY_PSYCHOLOGIST
    : END_REASONS.COMPLETED_BY_PATIENT;

/** Human labels — used in history screens, never technical strings. */
export const END_REASON_LABELS: Record<EndReason, string> = {
  [END_REASONS.CANCELLED_BY_PATIENT]: 'Cancelada pelo paciente',
  [END_REASONS.ABANDONED]: 'Solicitação abandonada',
  [END_REASONS.EXPIRED]: 'Expirada sem atendimento',
  [END_REASONS.COMPLETED_BY_PATIENT]: 'Encerrada pelo paciente',
  [END_REASONS.COMPLETED_BY_PSYCHOLOGIST]: 'Encerrada pelo psicólogo',
  [END_REASONS.TIME_LIMIT]: 'Tempo limite atingido',
  [END_REASONS.CONNECTION_FAILURE]: 'Falha de conexão',
  [END_REASONS.TECHNICAL_ISSUE]: 'Problema técnico',
  [END_REASONS.PSYCHOLOGIST_DROPPED]: 'Psicólogo caiu e não voltou (SOS devolvido)',
  [END_REASONS.OTHER]: 'Outro motivo',
};

export const describeEndReason = (value?: string | null): string =>
  isEndReason(value) ? END_REASON_LABELS[value] : 'Não informado';

/**
 * Options shown to the psychologist when the crisis was NOT resolved.
 * The choice is stored as free text in `end_notes` so `end_reason`
 * stays inside the canonical vocabulary above.
 */
export const UNRESOLVED_CRISIS_OPTIONS = [
  { value: 'conexao', label: 'Problema de conexão' },
  { value: 'tempo', label: 'Tempo insuficiente' },
  { value: 'melhora_parcial', label: 'Paciente apresentou melhora parcial' },
  { value: 'necessita_suporte', label: 'Paciente ainda necessita de suporte' },
  { value: 'nao_concluido', label: 'Não foi possível concluir o atendimento' },
  { value: 'sem_ajuda_adequada', label: 'Não consegui ajudar adequadamente' },
  { value: 'outro', label: 'Outro' },
] as const;

export type UnresolvedCrisisOption = (typeof UNRESOLVED_CRISIS_OPTIONS)[number]['value'];

export const unresolvedCrisisLabel = (value: string): string =>
  UNRESOLVED_CRISIS_OPTIONS.find((o) => o.value === value)?.label ?? 'Outro';

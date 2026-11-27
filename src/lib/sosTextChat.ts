/**
 * SOS por mensagem: regras de tempo e presença, iguais às do banco
 * (sos_text_psychologist_unresponsive, sos_text_nudges). O relógio é o do
 * servidor (o sinal da conversa devolve a hora dele), não o do aparelho.
 */

/** Sem a conversa visível por mais que isso, o psicólogo "pode ter se afastado". */
export const SOS_TEXT_AWAY_MS = 60_000;
/** Mensagem do paciente sem resposta por mais que isso: pode chamar outro psicólogo. */
export const SOS_TEXT_UNANSWERED_MS = 120_000;
/** Sinal de presença com a conversa aberta e visível. */
export const SOS_TEXT_HEARTBEAT_MS = 15_000;
export const SOS_TEXT_MAX_LENGTH = 2000;

export interface SosChatServerState {
  status: string | null;
  endReason: string | null;
  endedByType: string | null;
  acceptedAt: string | null;
  startedAt: string | null;
  timeLimitSeconds: number | null;
  psychologistSeenAt: string | null;
  patientSeenAt: string | null;
  psychologistReadAt: string | null;
  patientReadAt: string | null;
  lastPatientMessageAt: string | null;
  lastPsychologistMessageAt: string | null;
}

export const emptySosChatState = (): SosChatServerState => ({
  status: null,
  endReason: null,
  endedByType: null,
  acceptedAt: null,
  startedAt: null,
  timeLimitSeconds: null,
  psychologistSeenAt: null,
  patientSeenAt: null,
  psychologistReadAt: null,
  patientReadAt: null,
  lastPatientMessageAt: null,
  lastPsychologistMessageAt: null,
});

const ms = (iso: string | null | undefined) => (iso ? new Date(iso).getTime() : NaN);

export const parseHeartbeat = (raw: unknown): { state: SosChatServerState; serverNow: number | null } => {
  const r = (raw ?? {}) as Record<string, unknown>;
  const str = (k: string) => (typeof r[k] === 'string' ? (r[k] as string) : null);
  return {
    serverNow: str('server_now') ? ms(str('server_now')) : null,
    state: {
      status: str('status'),
      endReason: str('end_reason'),
      endedByType: str('ended_by_type'),
      acceptedAt: str('accepted_at'),
      startedAt: str('started_at'),
      timeLimitSeconds: typeof r.time_limit_seconds === 'number' ? r.time_limit_seconds : null,
      psychologistSeenAt: str('psychologist_seen_at'),
      patientSeenAt: str('patient_seen_at'),
      psychologistReadAt: str('psychologist_read_at'),
      patientReadAt: str('patient_read_at'),
      lastPatientMessageAt: str('last_patient_message_at'),
      lastPsychologistMessageAt: str('last_psychologist_message_at'),
    },
  };
};

/**
 * Aplica uma linha de sos_chat_state recebida pelo tempo real (presença,
 * "visto", última mensagem de cada lado) sem perguntar ao servidor.
 */
export const applyChatStateRow = (prev: SosChatServerState, row: Record<string, unknown>): SosChatServerState => {
  const pick = (k: string, fallback: string | null) =>
    k in row ? (typeof row[k] === 'string' ? (row[k] as string) : null) : fallback;
  return {
    ...prev,
    psychologistSeenAt: pick('psychologist_seen_at', prev.psychologistSeenAt),
    patientSeenAt: pick('patient_seen_at', prev.patientSeenAt),
    psychologistReadAt: pick('psychologist_read_at', prev.psychologistReadAt),
    patientReadAt: pick('patient_read_at', prev.patientReadAt),
    lastPatientMessageAt: pick('last_patient_message_at', prev.lastPatientMessageAt),
    lastPsychologistMessageAt: pick('last_psychologist_message_at', prev.lastPsychologistMessageAt),
  };
};

export const isChatActive = (state: SosChatServerState) =>
  state.status === 'accepted' || state.status === 'in_progress';

/** Psicólogo sem a conversa visível há mais de 60 s. */
export const isPsychologistAway = (state: SosChatServerState, now: number) => {
  if (!isChatActive(state)) return false;
  const seen = ms(state.psychologistSeenAt ?? state.acceptedAt);
  return Number.isFinite(seen) && now - seen > SOS_TEXT_AWAY_MS;
};

/** Última mensagem é do paciente e está sem resposta há mais de 2 min. */
export const isPatientUnanswered = (state: SosChatServerState, now: number) => {
  if (!isChatActive(state)) return false;
  const patient = ms(state.lastPatientMessageAt);
  if (!Number.isFinite(patient)) return false;
  const psychologist = ms(state.lastPsychologistMessageAt);
  if (Number.isFinite(psychologist) && psychologist >= patient) return false;
  return now - patient > SOS_TEXT_UNANSWERED_MS;
};

/** Segundos restantes (null antes da 1ª resposta do psicólogo). */
export const secondsLeft = (state: SosChatServerState, now: number): number | null => {
  const started = ms(state.startedAt);
  if (!Number.isFinite(started) || !state.timeLimitSeconds) return null;
  return Math.max(0, Math.round((started + state.timeLimitSeconds * 1000 - now) / 1000));
};

/** A outra pessoa leu até esta mensagem (minha). */
export const isSeenBy = (readAt: string | null, messageCreatedAt: string) =>
  Boolean(readAt) && ms(readAt) >= ms(messageCreatedAt);

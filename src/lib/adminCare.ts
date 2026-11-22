/**
 * Atendimentos no painel do admin: consultas agendadas e SOS.
 *
 * As listas não trazem conteúdo clínico. O detalhe, o plano de segurança e a
 * transcrição vêm de RPCs que gravam cada leitura na Auditoria
 * (`admin_get_care_detail`, `admin_get_care_safety_plan`,
 * `admin_get_call_transcript`).
 */
import { supabase } from '@/integrations/supabase/client';
import type { TranscriptSegment } from '@/lib/callTranscription';

export type CareKind = 'appointment' | 'sos';
export type CareRole = 'psychologist' | 'patient';

export interface CareListRow {
  id: string;
  /** Consulta: horário marcado; SOS: quando foi pedido. */
  at: string;
  status: string;
  psychologist_id: string | null;
  psychologist_name: string | null;
  patient_id: string;
  patient_name: string;
  /** Tempo com os dois na chamada (consulta) ou duração do SOS, em segundos. */
  seconds: number | null;
  channel?: string | null;
  transcription_consent: boolean;
  has_transcript: boolean;
  patient_rating: number | null;
  psychologist_rating: number | null;
}

export interface CareList {
  total: number;
  rows: CareListRow[];
}

interface RawRow {
  id: string;
  scheduled_at?: string;
  created_at?: string;
  status: string;
  psychologist_id: string | null;
  psychologist_name: string | null;
  patient_id: string;
  patient_name: string | null;
  call_seconds?: number | null;
  duration?: number | null;
  channel?: string | null;
  transcription_consent?: boolean;
  has_transcript?: boolean;
  patient_rating?: number | null;
  psychologist_rating?: number | null;
}

const toRow = (kind: CareKind, r: RawRow): CareListRow => ({
  id: r.id,
  at: (kind === 'appointment' ? r.scheduled_at : r.created_at) ?? '',
  status: r.status,
  psychologist_id: r.psychologist_id,
  psychologist_name: r.psychologist_name,
  patient_id: r.patient_id,
  patient_name: r.patient_name || 'Paciente',
  seconds: (kind === 'appointment' ? r.call_seconds : r.duration) ?? null,
  channel: r.channel ?? null,
  transcription_consent: !!r.transcription_consent,
  has_transcript: !!r.has_transcript,
  patient_rating: r.patient_rating ?? null,
  psychologist_rating: r.psychologist_rating ?? null,
});

export const fetchCareList = async (
  kind: CareKind,
  { psychologistId, patientId, page, pageSize }: { psychologistId?: string | null; patientId?: string | null; page: number; pageSize: number },
): Promise<CareList> => {
  const { data, error } = await supabase.rpc(kind === 'appointment' ? 'admin_list_appointments' : 'admin_list_sos', {
    p_psychologist_id: psychologistId ?? null,
    p_patient_id: patientId ?? null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) throw error;
  const body = (data ?? {}) as { total?: number; rows?: RawRow[] };
  return { total: body.total ?? 0, rows: (body.rows ?? []).map((r) => toRow(kind, r)) };
};

export interface CarePerson {
  user_id: string;
  full_name: string;
  email: string | null;
  care_count: number;
  last_at: string;
}

export const fetchCarePeople = async (
  role: CareRole,
  kind: CareKind,
  { search, page, pageSize }: { search: string; page: number; pageSize: number },
): Promise<{ total: number; rows: CarePerson[] }> => {
  const { data, error } = await supabase.rpc('admin_list_care_people', {
    p_role: role,
    p_kind: kind,
    p_search: search.trim() || null,
    p_limit: pageSize,
    p_offset: (page - 1) * pageSize,
  });
  if (error) throw error;
  const body = (data ?? {}) as { total?: number; rows?: CarePerson[] };
  return { total: body.total ?? 0, rows: body.rows ?? [] };
};

export interface CareFeedback {
  user_type: CareRole;
  rating: number | null;
  comment: string | null;
  felt_heard: string | null;
  resolution_status: string | null;
  problem_resolved: string | null;
  has_complaint: boolean;
  complaint_categories: string[] | null;
  complaint_description: string | null;
  requires_admin_review: boolean;
  symptoms: string[] | null;
  clinical_notes: string | null;
  created_at: string | null;
}

export interface CareDetail {
  care: {
    kind: CareKind;
    id: string;
    status: string;
    // Consulta
    appointment_type?: string | null;
    scheduled_at?: string;
    planned_minutes?: number | null;
    cancelled_at?: string | null;
    cancelled_by?: string | null;
    cancellation_reason?: string | null;
    notes?: string | null;
    session_summary?: string | null;
    connected_at?: string | null;
    call_seconds?: number | null;
    psychologist_name_fallback?: string | null;
    // SOS
    channel?: string | null;
    triage?: string[] | null;
    accepted_at?: string | null;
    started_at?: string | null;
    duration_seconds?: number | null;
    end_notes?: string | null;
    crisis_resolved?: boolean | null;
    patient_name_fallback?: string | null;
    // Os dois
    created_at?: string;
    ended_at?: string | null;
    ended_by_type?: string | null;
    end_reason?: string | null;
    transcription_consent_at?: string | null;
  };
  patient: { user_id: string; full_name: string | null; email: string | null; phone: string | null } | null;
  psychologist: { user_id: string; full_name: string | null; email: string | null; crp_number: string | null } | null;
  feedback: CareFeedback[];
  safety_plan_count: number;
  transcript_segments: number;
}

export const fetchCareDetail = async (kind: CareKind, id: string): Promise<CareDetail> => {
  const { data, error } = await supabase.rpc('admin_get_care_detail', { p_kind: kind, p_id: id });
  if (error) throw error;
  const detail = data as unknown as CareDetail;
  return { ...detail, feedback: detail.feedback ?? [] };
};

export interface AdminSafetyPlan {
  title: string;
  warning_signs: string[];
  coping_strategies: string[];
  distractions: string[];
  safe_environment: string[];
  reasons_to_live: string[];
  updated_at: string;
  contacts: { name: string; relationship: string | null; phone: string; is_primary: boolean }[];
}

export const fetchCareSafetyPlans = async (kind: CareKind, id: string): Promise<AdminSafetyPlan[]> => {
  const { data, error } = await supabase.rpc('admin_get_care_safety_plan', { p_kind: kind, p_id: id });
  if (error) throw error;
  return ((data ?? {}) as { plans?: AdminSafetyPlan[] }).plans ?? [];
};

export const fetchCareTranscript = async (kind: CareKind, id: string): Promise<TranscriptSegment[]> => {
  const { data, error } = await supabase.rpc('admin_get_call_transcript', { p_kind: kind, p_id: id });
  if (error) throw error;
  return (data ?? []) as TranscriptSegment[];
};

export interface AppointmentMetrics {
  total: number;
  completed: number;
  cancelled: number;
  no_show: number;
  upcoming: number;
  avg_call_seconds: number;
  transcribed: number;
  avg_patient_rating: number;
}

export const fetchAppointmentMetrics = async (days = 30): Promise<AppointmentMetrics | null> => {
  const { data, error } = await supabase.rpc('admin_appointment_metrics', { p_days: days });
  if (error) throw error;
  return (data as unknown as AppointmentMetrics) ?? null;
};

// ---------------------------------------------------------------------------
// Textos

const APPOINTMENT_STATUS: Record<string, string> = {
  pending: 'Pendente',
  scheduled: 'Agendada',
  confirmed: 'Confirmada',
  in_progress: 'Em andamento',
  completed: 'Realizada',
  cancelled: 'Cancelada',
  no_show: 'Não compareceu',
  declined: 'Recusada',
  rescheduled: 'Remarcada',
  proposed: 'Nova data proposta',
};

const SOS_STATUS: Record<string, string> = {
  pending: 'Aguardando',
  accepted: 'Aceita',
  in_progress: 'Em andamento',
  completed: 'Concluída',
  cancelled: 'Cancelada',
};

export const careStatusLabel = (kind: CareKind, status: string) =>
  (kind === 'appointment' ? APPOINTMENT_STATUS : SOS_STATUS)[status] ?? status;

export type CareTone = 'success' | 'active' | 'muted' | 'neutral' | 'danger';

export const careStatusTone = (status: string): CareTone => {
  switch (status) {
    case 'completed':
      return 'success';
    case 'accepted':
    case 'in_progress':
    case 'scheduled':
    case 'confirmed':
      return 'active';
    case 'cancelled':
    case 'declined':
      return 'muted';
    case 'no_show':
      return 'danger';
    default:
      return 'neutral';
  }
};

export const CARE_TONE_CLASS: Record<CareTone, string> = {
  success: 'bg-primary/10 text-primary border-primary/20',
  // Mesmas cores do histórico do psicólogo (o tom secundário quase some no claro).
  active: 'bg-sky-100 text-sky-800 border-sky-200 dark:bg-sky-500/15 dark:text-sky-300 dark:border-sky-500/30',
  muted: 'bg-muted text-muted-foreground border-border',
  neutral: 'bg-accent/10 text-accent-foreground border-border',
  danger: 'bg-destructive/10 text-destructive border-destructive/20',
};

export const careKindLabel = (kind: CareKind) => (kind === 'appointment' ? 'Consulta agendada' : 'SOS');

/** Rótulo de quem fala na transcrição, do ponto de vista do admin. */
export const adminSpeakerLabel = (role: TranscriptSegment['speaker_role']) => (role === 'patient' ? 'Paciente' : 'Psicólogo');

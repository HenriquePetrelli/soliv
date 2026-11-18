import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';

export interface PendingFeedback {
  /** SOS bloqueia o app até avaliar; consulta agendada só pede (dá para pular). */
  kind: 'emergency' | 'appointment';
  sessionId: string;
  requestId: string;
  endedAt: string | null;
  partnerName?: string;
}

const DISMISSED_KEY = 'soliv:feedback-dismissed';

const readDismissed = (): string[] => {
  try {
    const raw = localStorage.getItem(DISMISSED_KEY);
    return raw ? (JSON.parse(raw) as string[]) : [];
  } catch {
    return [];
  }
};

/** "Pular" na avaliação de uma consulta agendada: não pergunta de novo naquela consulta. */
export const dismissAppointmentFeedback = (sessionId: string) => {
  try {
    const next = [...new Set([...readDismissed(), sessionId])].slice(-50);
    localStorage.setItem(DISMISSED_KEY, JSON.stringify(next));
  } catch {
    // sem armazenamento: pode perguntar de novo, sem problema
  }
};

/** Only calls finished in the last 7 days block the app. */
const WINDOW_DAYS = 7;

/**
 * Pending SOS feedback gate.
 *
 * After an emergency call ends, both patient and psychologist MUST rate it.
 * If the app was closed before rating, the pending evaluation is detected on
 * the next app open and blocks usage until it is submitted.
 *
 * Consultas agendadas: o paciente também é convidado a avaliar, mas pode pular.
 */
export const usePendingCallFeedback = () => {
  const { user, userType } = useAuth();
  const [pending, setPending] = useState<PendingFeedback | null>(null);

  const check = useCallback(async () => {
    if (!user || (userType !== 'patient' && userType !== 'psychologist')) {
      setPending(null);
      return;
    }

    const since = new Date(Date.now() - WINDOW_DAYS * 24 * 60 * 60 * 1000).toISOString();

    const query = supabase
      .from('emergency_requests')
      .select('id, video_room_id, ended_at, started_at, end_reason')
      .not('ended_at', 'is', null)
      .not('video_room_id', 'is', null)
      .not('started_at', 'is', null)
      .gte('ended_at', since)
      .order('ended_at', { ascending: false })
      .limit(10);

    const { data, error } =
      userType === 'patient'
        ? await query.eq('patient_id', user.id)
        : await query.eq('accepted_by', user.id);

    // O paciente trocou de psicólogo porque o primeiro sumiu, ou o psicólogo
    // caiu e não voltou (SOS devolvido): não há o que avaliar.
    const rateable = (data ?? []).filter(
      (r) => r.end_reason !== 'psychologist_unavailable' && r.end_reason !== 'psychologist_dropped',
    );

    if (!error && rateable.length) {
      const sessionIds = rateable.map((r) => r.video_room_id as string);
      const { data: feedbacks } = await supabase
        .from('session_feedback')
        .select('session_id')
        .eq('user_id', user.id)
        .in('session_id', sessionIds);

      const rated = new Set((feedbacks ?? []).map((f) => f.session_id));
      const next = rateable.find((r) => !rated.has(r.video_room_id as string));
      if (next) {
        setPending({ kind: 'emergency', sessionId: next.video_room_id as string, requestId: next.id, endedAt: next.ended_at });
        return;
      }
    }

    // Consulta agendada concluída e ainda sem avaliação do paciente (ex.: fechou
    // o app ou a chamada caiu antes da tela de avaliação).
    if (userType === 'patient') {
      const { data: appointments } = await supabase
        .from('appointments')
        .select('id, video_room_id, scheduled_at, psychologists!psychologist_id(full_name)')
        .eq('patient_id', user.id)
        .eq('status', 'completed')
        .not('video_room_id', 'is', null)
        // Psicólogo excluído: não há a quem avaliar.
        .not('psychologist_id', 'is', null)
        .gte('scheduled_at', since)
        .order('scheduled_at', { ascending: false })
        .limit(10);

      if (appointments?.length) {
        const sessionIds = appointments.map((a) => a.video_room_id as string);
        const { data: feedbacks } = await supabase
          .from('session_feedback')
          .select('session_id')
          .eq('user_id', user.id)
          .in('session_id', sessionIds);
        const rated = new Set((feedbacks ?? []).map((f) => f.session_id));
        const dismissed = new Set(readDismissed());
        const next = appointments.find(
          (a) => !rated.has(a.video_room_id as string) && !dismissed.has(a.video_room_id as string)
        );
        if (next) {
          const psychologist = next.psychologists as { full_name?: string } | { full_name?: string }[] | null;
          const name = Array.isArray(psychologist) ? psychologist[0]?.full_name : psychologist?.full_name;
          setPending({
            kind: 'appointment',
            sessionId: next.video_room_id as string,
            requestId: next.id,
            endedAt: next.scheduled_at,
            partnerName: name ?? undefined,
          });
          return;
        }
      }
    }

    setPending(null);
  }, [user, userType]);

  useEffect(() => {
    check();
  }, [check]);

  return { pending, recheck: check, clear: () => setPending(null) };
};

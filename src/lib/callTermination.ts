import type { supabase } from '@/integrations/supabase/client';

/**
 * Shared, pure logic that decides whether a realtime `webrtc_sessions` update
 * represents a REAL call termination (someone pressed "encerrar chamada") or
 * just noise: app/tab closed, navigation, remount, reconnection or a stale
 * "completed" row left over from a previous call.
 */

import { END_REASONS } from './emergencyEndReasons';
import { sosLog } from './sosLogger';

export type CallUserType = 'patient' | 'psychologist';

export interface TerminationSessionLike {
  status?: string | null;
  ended_by?: string | null;
  ended_by_type?: string | null;
  ended_at?: string | null;
}

/** Parses `ended_at` into epoch ms (0 when absent/invalid). */
export function parseEndedAt(endedAt?: string | null): number {
  if (!endedAt) return 0;
  const ms = new Date(endedAt).getTime();
  return Number.isNaN(ms) ? 0 : ms;
}

/**
 * A termination is only "real" when the session was explicitly completed by a
 * participant (or finalized by the server) AND that happened after the current
 * viewer joined this call.
 *
 * Server-side finalizations (`finalize_stale_emergency_sessions`) carry
 * `ended_by_type = 'system'` with NO `ended_by`, since no user pressed
 * anything — they must still be treated as a real termination.
 */
export function isRealTermination(
  session: TerminationSessionLike | null | undefined,
  joinedAtMs: number
): boolean {
  if (!session) return false;
  if (session.status !== 'completed') return false;
  if (!session.ended_by_type) return false;
  if (session.ended_by_type !== 'system' && !session.ended_by) return false;
  return parseEndedAt(session.ended_at) >= joinedAtMs;
}

/** True when the row is a leftover from a previous call and should be reopened. */
export function isStaleCompletedSession(
  session: TerminationSessionLike | null | undefined,
  joinedAtMs: number
): boolean {
  if (!session) return false;
  if (session.status !== 'completed') return false;
  return !isRealTermination(session, joinedAtMs);
}

export function getTerminationMessage(endedByType?: string | null): string {
  if (endedByType === 'system') {
    return 'O tempo da chamada de emergência terminou e a sessão foi encerrada.';
  }
  const endedByName = endedByType === 'psychologist' ? 'O psicólogo' : 'O paciente';
  return `${endedByName} encerrou a chamada de vídeo.`;
}


/**
 * Persists an EXPLICIT termination (participant pressed "encerrar chamada").
 * This is the only path allowed to mark the emergency request / webrtc session
 * as `completed`. App/tab closures must never call it.
 */
export interface PersistTerminationParams {
  requestId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  endedByType: CallUserType | 'system';
  reason?: string;
  endedAt?: string;
  /** Psychologist outcome — whether the patient's crisis was resolved. */
  crisisResolved?: boolean | null;
  /** Free-text context for the outcome (motive chosen + observations). */
  notes?: string | null;
}

export async function persistExplicitTermination(
  client: typeof supabase,
  {
    requestId,
    sessionId,
    userId,
    endedByType,
    reason = END_REASONS.OTHER,
    endedAt = new Date().toISOString(),
    crisisResolved = null,
    notes = null,
  }: PersistTerminationParams
): Promise<{ duration: number; alreadyEnded: boolean }> {
  let duration = 0;
  const alreadyEnded = false;

  if (requestId) {
    const { data: emergencyData } = await client
      .from('emergency_requests')
      .select('started_at, status, ended_at')
      .eq('id', requestId)
      .maybeSingle();

    // Idempotency: a second endCall() must never rewrite the outcome.
    if (emergencyData?.status === 'completed' || emergencyData?.ended_at) {
      sosLog('SESSION', 'termination ignored — session already finished', { requestId });
      return { duration: 0, alreadyEnded: true };
    }

    duration = emergencyData?.started_at
      ? Math.max(
          0,
          Math.floor(
            (new Date(endedAt).getTime() - new Date(emergencyData.started_at).getTime()) / 1000
          )
        )
      : 0;

    // Atomic guard: two peers ending at the same time must not overwrite each
    // other's outcome — only the row that is still open is updated.
    const { data: updatedRows, error } = await client
      .from('emergency_requests')
      .update({
        ended_at: endedAt,
        status: 'completed',
        duration,
        ended_by: userId ?? null,
        ended_by_type: endedByType,
        end_reason: reason,
        ...(crisisResolved === null ? {} : { crisis_resolved: crisisResolved }),
        ...(notes ? { end_notes: notes } : {}),
      })
      .eq('id', requestId)
      .is('ended_at', null)
      .select('id');

    if (error) throw error;

    if (Array.isArray(updatedRows) && updatedRows.length === 0) {
      sosLog('SESSION', 'termination lost the race — session already finished', { requestId });
      return { duration: 0, alreadyEnded: true };
    }

    sosLog('SESSION', 'emergency request completed', { requestId, reason, endedByType });

  }

  if (sessionId) {
    await client
      .from('webrtc_sessions')
      .update({
        status: 'completed',
        ended_at: endedAt,
        ended_by: userId ?? null,
        ended_by_type: endedByType,
        end_reason: reason,
      })
      .eq('id', sessionId);
    sosLog('SESSION', 'webrtc session completed', { sessionId });
  }

  return { duration, alreadyEnded };
}

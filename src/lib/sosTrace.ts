/**
 * SOS lifecycle tracing.
 *
 * Every emergency call gets a stable `traceId` derived from the emergency
 * request (so patient, psychologist and the server all produce the SAME id)
 * and each relevant lifecycle event is persisted in `sos_trace_events`.
 *
 * This is an audit/debug trail: it must NEVER break the call flow, so every
 * write is fire-and-forget and errors are swallowed (only logged in dev).
 */

import { supabase } from '@/integrations/supabase/client';
import { sosLog, sosWarn } from './sosLogger';
import type { Json } from '@/integrations/supabase/types';

export type SosActorType = 'patient' | 'psychologist' | 'system';

export const SOS_EVENTS = {
  REQUEST_CREATED: 'request_created',
  REQUEST_ACCEPTED: 'request_accepted',
  ROOM_JOINED: 'room_joined',
  CALL_STARTED: 'call_started',
  CALL_ENDED_SIGNAL_SENT: 'call_ended_signal_sent',
  CALL_ENDED_SIGNAL_RECEIVED: 'call_ended_signal_received',
  CALL_ENDED_BY_PARTICIPANT: 'call_ended_by_participant',
  CALL_FINALIZED_BY_SYSTEM: 'call_finalized_by_system',
  SESSION_COMPLETED: 'session_completed',
  FEEDBACK_SUBMITTED: 'feedback_submitted',
} as const;

export type SosEventType = (typeof SOS_EVENTS)[keyof typeof SOS_EVENTS] | (string & {});

/**
 * Stable trace id shared by both participants of the same emergency call.
 * Falls back to the WebRTC session when the request id is not known yet.
 */
export function buildTraceId(requestId?: string | null, sessionId?: string | null): string {
  if (requestId) return `req:${requestId}`;
  if (sessionId) return `ses:${sessionId}`;
  return 'unknown';
}

export interface SosTraceEvent {
  eventType: SosEventType;
  requestId?: string | null;
  sessionId?: string | null;
  actorType?: SosActorType;
  actorUserId?: string | null;
  message?: string | null;
  metadata?: Record<string, unknown>;
  traceId?: string;
}

/**
 * Persists one lifecycle event. Never throws, never awaits the caller's path
 * in a blocking way beyond the insert itself.
 */
export async function traceSosEvent(
  event: SosTraceEvent,
  client: typeof supabase = supabase
): Promise<void> {
  const traceId = event.traceId ?? buildTraceId(event.requestId, event.sessionId);
  try {
    let actorUserId = event.actorUserId ?? null;
    if (!actorUserId) {
      const { data } = await client.auth.getUser();
      actorUserId = data?.user?.id ?? null;
    }
    // RLS only allows inserting rows owned by the caller.
    if (!actorUserId) return;

    sosLog('SESSION', `trace ${event.eventType}`, { traceId, ...event.metadata });

    const { error } = await client.from('sos_trace_events').insert({
      trace_id: traceId,
      emergency_request_id: event.requestId ?? null,
      session_id: event.sessionId ?? null,
      event_type: event.eventType,
      actor_user_id: actorUserId,
      actor_type: event.actorType ?? 'system',
      message: event.message ?? null,
      metadata: (event.metadata ?? {}) as Json,
    });
    if (error) sosWarn('SESSION', 'failed to persist trace event', error);
  } catch (error) {
    sosWarn('SESSION', 'failed to persist trace event', error);
  }
}

/** Fire-and-forget helper for hot paths (e.g. hanging up). */
export function trackSosEvent(event: SosTraceEvent, client: typeof supabase = supabase): void {
  void traceSosEvent(event, client);
}

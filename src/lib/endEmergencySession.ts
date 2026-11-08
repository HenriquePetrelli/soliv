/**
 * SINGLE termination flow for the emergency (SOS) call.
 *
 * Every path that finishes a call — patient pressing "encerrar", psychologist
 * outcome flow, server time limit, peer CALL_ENDED signal — must go through
 * `endEmergencySession`. It is idempotent, never throws at the caller and owns
 * the full teardown order:
 *
 *   1. notify the peer (CALL_ENDED over the data channel)
 *   2. persist the termination (emergency_requests + webrtc_sessions)
 *   3. trace the lifecycle events
 *   4. release hardware (camera/microphone) and close WebRTC
 *   5. hand control back to the UI (feedback / redirect)
 */

import { supabase as defaultClient } from '@/integrations/supabase/client';
import { persistExplicitTermination, type CallUserType } from '@/lib/callTermination';
import { END_REASONS, completionReasonFor } from '@/lib/emergencyEndReasons';
import { sosLog } from '@/lib/sosLogger';
import { trackSosEvent, SOS_EVENTS } from '@/lib/sosTrace';

export interface EndEmergencySessionParams {
  requestId?: string | null;
  sessionId?: string | null;
  userId?: string | null;
  endedBy: CallUserType | 'system';
  reason?: string;
  crisisResolved?: boolean | null;
  notes?: string | null;
  /** Best-effort instant notification to the peer. */
  sendCallEndedSignal?: (payload: { endedByType: CallUserType | 'system'; reason: string }) => boolean;
  /** Stops camera/microphone tracks and clears video elements. */
  stopMedia?: () => void | Promise<void>;
  /** Closes the peer connection, timers, realtime channels and reconnection. */
  closeWebRTC?: () => void;
  /** Called once the teardown finished (open feedback / redirect). */
  onFinished?: () => void;
  client?: typeof defaultClient;
}

export interface EndEmergencySessionResult {
  ok: boolean;
  alreadyEnded: boolean;
  reason: string;
}

/** Calls already terminated (or terminating) in this tab — guarantees idempotency. */
const inFlight = new Set<string>();
const finished = new Set<string>();

const keyOf = (p: EndEmergencySessionParams) => p.sessionId || p.requestId || 'unknown-call';

/** Test helper: clears the in-memory idempotency guards. */
export const resetEndEmergencySessionGuards = () => {
  inFlight.clear();
  finished.clear();
};

export async function endEmergencySession(
  params: EndEmergencySessionParams
): Promise<EndEmergencySessionResult> {
  const {
    requestId,
    sessionId,
    userId,
    endedBy,
    crisisResolved = null,
    notes = null,
    sendCallEndedSignal,
    stopMedia,
    closeWebRTC,
    onFinished,
    client = defaultClient,
  } = params;

  const reason =
    params.reason ?? (endedBy === 'system' ? END_REASONS.TIME_LIMIT : completionReasonFor(endedBy));
  const key = keyOf(params);

  // Idempotency: a second endCall() must never duplicate work or feedback.
  if (inFlight.has(key) || finished.has(key)) {
    sosLog('SESSION', 'end ignored — termination already handled', { key, reason });
    onFinished?.();
    return { ok: true, alreadyEnded: true, reason };
  }
  inFlight.add(key);

  try {
    sosLog('SESSION', 'ending emergency session', { key, endedBy, reason, crisisResolved });

    // 1. Peer notification first: the other side must not see "reconnecting".
    let delivered = false;
    try {
      delivered = sendCallEndedSignal?.({ endedByType: endedBy, reason }) ?? false;
    } catch (error) {
      console.warn('[SOS] CALL_ENDED signal failed', error);
    }
    trackSosEvent({
      eventType: SOS_EVENTS.CALL_ENDED_SIGNAL_SENT,
      requestId: requestId ?? null,
      sessionId: sessionId ?? null,
      actorType: endedBy,
      actorUserId: userId ?? null,
      message: 'CALL_ENDED enviado ao peer',
      metadata: { reason, delivered, crisisResolved },
    });

    // 2. Persist — idempotent for both emergency_requests and webrtc_sessions.
    let alreadyEnded = false;
    try {
      const persisted = await persistExplicitTermination(client, {
        requestId,
        sessionId,
        userId,
        endedByType: endedBy,
        reason,
        crisisResolved,
        notes,
      });
      alreadyEnded = persisted.alreadyEnded;
    } catch (error) {
      console.error('[SOS] failed to persist termination', error);
    }

    // 3. Trace the explicit termination.
    trackSosEvent({
      eventType:
        endedBy === 'system' ? SOS_EVENTS.SESSION_COMPLETED : SOS_EVENTS.CALL_ENDED_BY_PARTICIPANT,
      requestId: requestId ?? null,
      sessionId: sessionId ?? null,
      actorType: endedBy,
      actorUserId: userId ?? null,
      message: 'Encerramento da sessão de emergência',
      metadata: { reason, crisisResolved, alreadyEnded },
    });

    // 4. Hardware + WebRTC teardown (must run even when persistence failed).
    try {
      await stopMedia?.();
    } catch (error) {
      console.warn('[MEDIA] cleanup error', error);
    }
    try {
      closeWebRTC?.();
    } catch (error) {
      console.warn('[WEBRTC] cleanup error', error);
    }

    finished.add(key);
    sosLog('SESSION', 'cleanup completed', { key, reason });

    // 5. UI takes over (feedback / redirect).
    onFinished?.();

    return { ok: true, alreadyEnded, reason };
  } finally {
    inFlight.delete(key);
  }
}

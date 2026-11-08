/**
 * In-call control signalling over an RTCDataChannel.
 *
 * The database + realtime is the source of truth for a termination, but it can
 * take a second or two to propagate. A direct `CALL_ENDED` message on the peer
 * connection lets the other side tear the room down immediately, exactly like
 * Meet/Uber do, while the persisted row remains the authoritative record.
 */

import { sosLog } from './sosLogger';

export const CALL_SIGNAL_CHANNEL = 'sos-control';

export type CallSignalType = 'CALL_ENDED' | 'MEDIA_STATE' | 'MEDIA_STATE_REQUEST';

export interface CallEndedSignal {
  type: 'CALL_ENDED';
  endedByType: 'patient' | 'psychologist' | 'system';
  reason: string;
  sessionId?: string | null;
  at: number;
}

/**
 * Instant camera/mic/avatar state of the sender.
 *
 * The `webrtc_sessions` row keeps the durable copy (used on join/refresh), but
 * waiting for the database round-trip makes the remote avatar lag ~1-2s behind
 * the actual camera toggle. This message updates the peer immediately.
 */
export interface MediaStateSignal {
  type: 'MEDIA_STATE';
  userType: 'patient' | 'psychologist';
  cameraOff: boolean;
  muted: boolean;
  displayName?: string | null;
  avatarUrl?: string | null;
  /**
   * Monotonic counter per sender. Concurrent toggles (mute + camera in the same
   * millisecond, retries, re-announcements after a reconnection) are ordered by
   * this value, so an older update can never override a newer one.
   */
  seq: number;
  at: number;
}

/**
 * Asks the peer to re-announce its current media state.
 *
 * Sent right after the control channel recovers (reconnection, ICE restart),
 * so a temporarily stale remote camera/mic indicator is refreshed immediately
 * instead of waiting for the next toggle or database round-trip.
 */
export interface MediaStateRequestSignal {
  type: 'MEDIA_STATE_REQUEST';
  from: 'patient' | 'psychologist';
  at: number;
}

export type CallSignal = CallEndedSignal | MediaStateSignal | MediaStateRequestSignal;

const USER_TYPES = ['patient', 'psychologist'];

/** Type guard for anything arriving on the control channel. */
export function parseCallSignal(raw: unknown): CallSignal | null {
  if (typeof raw !== 'string') return null;
  try {
    const parsed = JSON.parse(raw);
    if (!parsed) return null;

    if (parsed.type === 'MEDIA_STATE') {
      if (!USER_TYPES.includes(parsed.userType)) return null;
      return {
        type: 'MEDIA_STATE',
        userType: parsed.userType,
        cameraOff: Boolean(parsed.cameraOff),
        muted: Boolean(parsed.muted),
        displayName: typeof parsed.displayName === 'string' ? parsed.displayName : null,
        avatarUrl: typeof parsed.avatarUrl === 'string' ? parsed.avatarUrl : null,
        seq: typeof parsed.seq === 'number' ? parsed.seq : 0,
        at: typeof parsed.at === 'number' ? parsed.at : Date.now(),
      };
    }

    if (parsed.type === 'MEDIA_STATE_REQUEST') {
      if (!USER_TYPES.includes(parsed.from)) return null;
      return {
        type: 'MEDIA_STATE_REQUEST',
        from: parsed.from,
        at: typeof parsed.at === 'number' ? parsed.at : Date.now(),
      };
    }

    if (parsed.type !== 'CALL_ENDED') return null;
    if (!['patient', 'psychologist', 'system'].includes(parsed.endedByType)) return null;
    return {
      type: 'CALL_ENDED',
      endedByType: parsed.endedByType,
      reason: typeof parsed.reason === 'string' ? parsed.reason : 'other',
      sessionId: parsed.sessionId ?? null,
      at: typeof parsed.at === 'number' ? parsed.at : Date.now(),
    };
  } catch {
    return null;
  }
}

interface DataChannelLike {
  readyState: string;
  send: (data: string) => void;
  close?: () => void;
  onmessage: ((event: { data: unknown }) => void) | null;
  onopen?: (() => void) | null;
}

interface PeerLike {
  createDataChannel: (label: string, options?: unknown) => DataChannelLike;
  ondatachannel: ((event: { channel: DataChannelLike }) => void) | null;
}

export interface CallSignalChannel {
  /** Sends CALL_ENDED to the peer. Returns false when it could not be delivered. */
  sendCallEnded: (payload: Omit<CallEndedSignal, 'type' | 'at'>) => boolean;
  /** Sends the local camera/mic/avatar state to the peer (best effort). */
  sendMediaState: (payload: Omit<MediaStateSignal, 'type' | 'at' | 'seq'>) => boolean;
  /** Asks the peer to re-announce its media state (used after a recovery). */
  requestMediaState: (from: 'patient' | 'psychologist') => boolean;
  /** True when the control channel is open and messages can be delivered now. */
  isOpen: () => boolean;
  close: () => void;
}

/**
 * Attaches the control channel to a peer connection.
 *
 * Both sides create their own outgoing channel and listen for the peer's one,
 * so the signal works regardless of who is the offerer.
 */
export function attachCallSignalChannel(
  pc: PeerLike,
  onSignal: (signal: CallSignal) => void
): CallSignalChannel {
  let outgoing: DataChannelLike | null = null;
  const handled = new Set<string>();
  /** Outgoing monotonic counter and the highest sequence seen per remote peer. */
  let outSeq = 0;
  const lastSeqByUser = new Map<string, number>();

  const dispatch = (event: { data: unknown }) => {
    const signal = parseCallSignal(event.data);
    if (!signal) return;
    // Both channels can carry the same message — deliver it only once.
    if (signal.type === 'MEDIA_STATE') {
      // Ordering guard: ignore duplicates and out-of-order/stale updates.
      const last = lastSeqByUser.get(signal.userType);
      if (last !== undefined && signal.seq <= last) return;
      lastSeqByUser.set(signal.userType, signal.seq);
      sosLog('SESSION', 'MEDIA_STATE signal received', signal);
      onSignal(signal);
      return;
    }

    if (signal.type === 'MEDIA_STATE_REQUEST') {
      sosLog('SESSION', 'MEDIA_STATE_REQUEST signal received', signal);
      onSignal(signal);
      return;
    }

    const key = `CALL_ENDED:${signal.at}:${signal.endedByType}`;
    if (handled.has(key)) return;
    handled.add(key);
    sosLog('SESSION', `${signal.type} signal received`, signal);
    onSignal(signal);
  };

  try {
    outgoing = pc.createDataChannel(CALL_SIGNAL_CHANNEL, { ordered: true });
    outgoing.onmessage = dispatch;
  } catch {
    outgoing = null;
  }

  const previousHandler = pc.ondatachannel;
  pc.ondatachannel = (event) => {
    previousHandler?.(event);
    if (!event?.channel) return;
    event.channel.onmessage = dispatch;
    // Prefer an already-open inbound channel when our own is not ready.
    if (!outgoing || outgoing.readyState !== 'open') outgoing = event.channel;
  };

  const send = (signal: CallSignal): boolean => {
    if (!outgoing || outgoing.readyState !== 'open') return false;
    try {
      outgoing.send(JSON.stringify(signal));
      sosLog('SESSION', `${signal.type} signal sent`, signal);
      return true;
    } catch {
      return false;
    }
  };

  return {
    isOpen: () => outgoing?.readyState === 'open',
    sendCallEnded: (payload) => send({ type: 'CALL_ENDED', at: Date.now(), ...payload }),
    sendMediaState: (payload) =>
      send({ type: 'MEDIA_STATE', at: Date.now(), seq: ++outSeq, ...payload }),
    requestMediaState: (from) => send({ type: 'MEDIA_STATE_REQUEST', from, at: Date.now() }),
    close: () => {
      try {
        outgoing?.close?.();
      } catch {
        /* noop */
      }
      outgoing = null;
    },
  };
}

import { useState, useEffect, useRef, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { getSessionUser } from '@/lib/currentUser';
import { isRealTermination } from '@/lib/callTermination';
import { attachCallSignalChannel, type CallSignalChannel, type MediaStateSignal } from '@/lib/callSignals';
import { trackSosEvent, SOS_EVENTS } from '@/lib/sosTrace';
import {
  answerMatchesOffer,
  classifyNetworkQuality,
  isNewRemotePeer,
  isPendingRenegotiation,
  patientShouldRequestRenegotiation,
  reconnectStepFor,
  sdpTag,
  type NetworkQuality,
  type StoredAnswer,
} from '@/lib/callNegotiation';

import { useToast } from '@/hooks/use-toast';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import { useUserPreferences } from '@/hooks/useUserPreferences';
import { useMediaDeviceManager } from '@/hooks/useMediaDeviceManager';
import { getReconnectDelay, MAX_RECONNECT_ATTEMPTS } from '@/lib/reconnect';
import { getIceServers } from '@/lib/iceServers';
import type { WebRTCState } from '@/utils/state-machine';

interface WebRTCSession {
  id: string;
  emergency_request_id?: string;
  psychologist_id?: string;
  patient_id?: string;
  status: string;
  offer?: RTCSessionDescriptionInit;
  answer?: StoredAnswer;
  ice_candidates?: RTCIceCandidateInit[];
  ended_by?: string;
  ended_by_type?: string;
  renegotiate_requested_at?: string | null;
}

/** Extracts the ICE ufrags declared in an SDP (one per m-line, usually equal). */
const getUfrags = (sdp?: string): string[] => {
  if (!sdp) return [];
  return Array.from(new Set(
    sdp.split('\n')
      .filter((l) => l.startsWith('a=ice-ufrag:'))
      .map((l) => l.replace('a=ice-ufrag:', '').trim())
  ));
};

/** Stable identity for a remote candidate, used to avoid re-adding duplicates. */
const candidateKey = (c: RTCIceCandidateInit) =>
  `${(c).usernameFragment ?? ''}|${c.sdpMid ?? ''}|${c.sdpMLineIndex ?? ''}|${c.candidate ?? ''}`;

/** Postgres "function does not exist" through PostgREST (migration not applied yet). */
const isMissingFunction = (error: { code?: string; message?: string } | null) =>
  error?.code === 'PGRST202' || error?.code === '42883' || /could not find the function/i.test(error?.message ?? '');

/** Video ceiling while the network is healthy, and the relief applied when it is poor. */
const VIDEO_MAX_BITRATE = 1_500_000;
const VIDEO_POOR_BITRATE = 350_000;

/** Câmera/microfone escolhidos nesta chamada (sobrevive a recarregar a página). */
export interface LocalMediaChoice {
  muted: boolean;
  cameraOff: boolean;
}

const mediaChoiceKey = (sessionId: string, userType: string) => `soliv:call-media:${sessionId}:${userType}`;

const readMediaChoice = (key: string): LocalMediaChoice | null => {
  try {
    const raw = sessionStorage.getItem(key);
    if (!raw) return null;
    const value = JSON.parse(raw);
    if (typeof value?.muted === 'boolean' && typeof value?.cameraOff === 'boolean') return value;
  } catch {
    /* sem armazenamento: vale o que está na sala */
  }
  return null;
};

const writeMediaChoice = (key: string, value: LocalMediaChoice) => {
  try {
    sessionStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* noop */
  }
};

/**
 * Quadro preto no lugar da câmera desligada. Como no Meet, a câmera desligada
 * é solta de verdade (a luz apaga); o lugar dela na conexão fica com este
 * quadro, então religar não precisa renegociar e uma reconexão continua com
 * espaço para o vídeo.
 */
const makePlaceholderVideoTrack = (): MediaStreamTrack | null => {
  try {
    const canvas = document.createElement('canvas');
    canvas.width = 320;
    canvas.height = 180;
    const ctx = canvas.getContext('2d');
    if (!ctx) return null;
    ctx.fillStyle = '#000';
    ctx.fillRect(0, 0, canvas.width, canvas.height);
    const capture = (canvas as HTMLCanvasElement & { captureStream?: (fps?: number) => MediaStream }).captureStream;
    const track = capture?.call(canvas, 1)?.getVideoTracks()[0] ?? null;
    if (track) track.enabled = false;
    return track;
  } catch {
    return null;
  }
};

interface UseWebRTCProps {
  sessionId: string;
  userType: 'psychologist' | 'patient';
  onConnectionStateChange?: (state: RTCPeerConnectionState) => void;
}

/**
 * Conexão de vídeo de um atendimento (SOS ou consulta).
 *
 * Sinalização pelo banco (`webrtc_sessions`), com o realtime como caminho
 * rápido e uma leitura a cada 3 s como garantia: se uma escrita ou um evento se
 * perder, a próxima leitura corrige. O psicólogo oferece, o paciente responde.
 *
 * Quedas nunca encerram a chamada. A reconexão primeiro reinicia o caminho de
 * rede (ICE restart) e, se não voltar, recria a conexão inteira; quando um lado
 * recarrega a página, o outro percebe pela oferta/resposta nova e recria a sua.
 */
export const useWebRTC = ({ sessionId, userType, onConnectionStateChange }: UseWebRTCProps) => {
  const [peerConnection, setPeerConnection] = useState<RTCPeerConnection | null>(null);
  const [localStream, setLocalStream] = useState<MediaStream | null>(null);
  const [remoteStream, setRemoteStream] = useState<MediaStream | null>(null);
  const [connectionState, setConnectionState] = useState<RTCPeerConnectionState>('new');
  const [isConnected, setIsConnected] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [session, setSession] = useState<WebRTCSession | null>(null);
  const [isInitializing, setIsInitializing] = useState(false);
  const [webrtcState, setWebrtcState] = useState<WebRTCState>('idle');
  const [callEndedBy, setCallEndedBy] = useState<{ userId: string; userType: string } | null>(null);
  const [isReconnecting, setIsReconnecting] = useState(false);
  const [reconnectAttempt, setReconnectAttempt] = useState(0);
  const [isNetworkOffline, setIsNetworkOffline] = useState(
    typeof navigator !== 'undefined' ? !navigator.onLine : false
  );
  /** Since when the media is not flowing (join time until the first connection). */
  const [notConnectedSince, setNotConnectedSince] = useState<number | null>(() => Date.now());
  const [networkQuality, setNetworkQuality] = useState<NetworkQuality>('good');
  /** Meu microfone/câmera, já com a escolha guardada reaplicada ao entrar. */
  const [isMuted, setIsMutedState] = useState(false);
  const [isCameraOff, setIsCameraOffState] = useState(false);
  /** True depois de reaplicar a escolha guardada (antes disso não anuncia nada). */
  const [mediaChoiceReady, setMediaChoiceReady] = useState(false);

  const localVideoRef = useRef<HTMLVideoElement>(null);
  const remoteVideoRef = useRef<HTMLVideoElement>(null);

  const pcRef = useRef<RTCPeerConnection | null>(null);
  const localStreamRef = useRef<MediaStream | null>(null);
  const remoteStreamRef = useRef<MediaStream | null>(null);
  const disposedRef = useRef(false);
  const joinedAtRef = useRef(Date.now());
  const iceServersRef = useRef<RTCIceServer[] | null>(null);

  // Negotiation bookkeeping (always about the CURRENT peer connection).
  const lastAppliedOfferRef = useRef<string | null>(null);
  const lastAppliedAnswerRef = useRef<string | null>(null);
  const appliedCandidatesRef = useRef<Set<string>>(new Set());
  const lastRenegotiationHandledRef = useRef(0);
  /**
   * Exact text of the offer/answer we wrote to the row. The local description
   * itself can't be compared: the browser keeps appending candidates to it.
   */
  const publishedOfferRef = useRef<string | null>(null);
  const publishedAnswerRef = useRef<string | null>(null);
  const opQueueRef = useRef<Promise<unknown>>(Promise.resolve());

  // Outgoing ICE candidates are batched and appended atomically in the database.
  const candidateBufferRef = useRef<RTCIceCandidateInit[]>([]);
  const candidateFlushTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const legacyIceWriteRef = useRef(false);

  // Reconnection.
  const reconnectAttemptsRef = useRef(0);
  const reconnectTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const settleTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const graceTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);
  const wasConnectedRef = useRef(false);

  // Media reporting (the server only counts a call when BOTH sides report).
  const mediaReportedRef = useRef<boolean | null>(null);
  const mediaReportTimerRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const callEndedByRef = useRef<{ userId: string; userType: string } | null>(null);
  const signalChannelRef = useRef<CallSignalChannel | null>(null);
  /** Last media state announced by the peer over the data channel (instant). */
  const [remoteMediaState, setRemoteMediaState] = useState<MediaStateSignal | null>(null);
  /** Last media state we announced — re-sent whenever the channel (re)opens. */
  const localMediaStateRef = useRef<Omit<MediaStateSignal, 'type' | 'at' | 'seq'> | null>(null);
  /** True while the remote media state may be outdated (control channel down). */
  const [isRemoteMediaStale, setIsRemoteMediaStale] = useState(false);
  /** Local clock of the last MEDIA_STATE actually received from the peer. */
  const remoteMediaReceivedAtRef = useRef(0);
  const isNetworkOfflineRef = useRef(false);
  const isMutedRef = useRef(false);
  const cameraOffRef = useRef(false);
  const placeholderTrackRef = useRef<MediaStreamTrack | null>(null);
  const cameraDeviceRef = useRef<string | null>(null);
  const cameraQueueRef = useRef<Promise<unknown>>(Promise.resolve());
  const isReconnectingRef = useRef(false);

  const { toast } = useToast();
  const toastRef = useRef(toast);
  toastRef.current = toast;
  const onStateChangeRef = useRef(onConnectionStateChange);
  onStateChangeRef.current = onConnectionStateChange;
  const { preferences, isLoading: prefsLoading } = useUserPreferences();
  const preferencesRef = useRef(preferences);
  preferencesRef.current = preferences;
  const mediaManager = useMediaDeviceManager();
  const mediaManagerRef = useRef(mediaManager);
  mediaManagerRef.current = mediaManager;

  useEffect(() => {
    callEndedByRef.current = callEndedBy;
  }, [callEndedBy]);

  /** Runs signalling steps one at a time (rebuild, offer, answer never interleave). */
  const enqueue = useCallback(<T,>(task: () => Promise<T>): Promise<T | undefined> => {
    const next = opQueueRef.current.then(async () => {
      if (disposedRef.current) return undefined;
      try {
        return await task();
      } catch (err) {
        console.warn('[WebRTC] signalling step failed', err);
        return undefined;
      }
    });
    opQueueRef.current = next.catch(() => undefined);
    return next;
  }, []);

  const clearReconnectTimers = useCallback(() => {
    for (const ref of [reconnectTimerRef, settleTimerRef, graceTimerRef]) {
      if (ref.current) {
        clearTimeout(ref.current);
        ref.current = null;
      }
    }
  }, []);

  const isLive = () => !disposedRef.current && !callEndedByRef.current;

  // ---------------------------------------------------------------- media

  const initializeMedia = useCallback(async () => {
    const prefs = preferencesRef.current;
    const manager = mediaManagerRef.current;
    const result = await manager.getMediaStream(
      prefs?.mic_device_id || undefined,
      prefs?.camera_device_id || undefined
    );

    if (result.error) {
      const errorMessage = result.error.message + (result.error.details ? ` - ${result.error.details}` : '');
      // Only a warning when part of the media is available (ex.: só áudio).
      if (result.stream.getTracks().length > 0) {
        toastRef.current({ title: result.error.message, description: result.error.details });
      } else {
        setError(errorMessage);
        toastRef.current({
          title: `Erro de ${result.error.type === 'permission' ? 'Permissão' : 'Dispositivo'}`,
          description: errorMessage,
          variant: 'destructive',
        });
        throw new Error(errorMessage);
      }
    }

    const stream = result.stream;
    // Hints help the encoder: speech for the voice, motion for a face on camera.
    stream.getAudioTracks().forEach((t) => { try { (t).contentHint = 'speech'; } catch { /* noop */ } });
    stream.getVideoTracks().forEach((t) => { try { (t).contentHint = 'motion'; } catch { /* noop */ } });
    localStreamRef.current = stream;
    setLocalStream(stream);
    if (localVideoRef.current) localVideoRef.current.srcObject = stream;

    if (prefs?.speaker_device_id) {
      try {
        await manager.setAudioOutputDevice(prefs.speaker_device_id);
      } catch (err) {
        console.warn('⚠️ Failed to apply audio output preference:', err);
      }
    }
    return stream;
  }, []);

  /** Voice first, and a sane video ceiling (the browser adapts below it). */
  const tuneSenders = useCallback(async (pc: RTCPeerConnection, poor = false) => {
    for (const sender of pc.getSenders()) {
      if (!sender.track || typeof sender.getParameters !== 'function') continue;
      try {
        const params = sender.getParameters();
        if (!params.encodings || params.encodings.length === 0) params.encodings = [{}];
        if (sender.track.kind === 'audio') {
          params.encodings[0].priority = 'high';
          (params.encodings[0]).networkPriority = 'high';
        } else {
          params.encodings[0].maxBitrate = poor ? VIDEO_POOR_BITRATE : VIDEO_MAX_BITRATE;
          params.encodings[0].scaleResolutionDownBy = poor ? 2 : 1;
          params.encodings[0].priority = 'medium';
          (params).degradationPreference = 'balanced';
        }
        await sender.setParameters(params);
      } catch {
        // Some browsers reject parts of this; the call works without it.
      }
    }
  }, []);

  // ------------------------------------------------------ database writes

  const flushCandidates = useCallback(async () => {
    candidateFlushTimerRef.current = null;
    const batch = candidateBufferRef.current.splice(0, 50);
    if (batch.length === 0 || disposedRef.current) return;

    if (!legacyIceWriteRef.current) {
      const { error: rpcError } = await supabase.rpc('append_webrtc_ice_candidates', {
        p_session_id: sessionId,
        p_candidates: batch as unknown as Json,
      });
      if (!rpcError) {
        if (candidateBufferRef.current.length > 0) void flushCandidates();
        return;
      }
      if (isMissingFunction(rpcError)) {
        legacyIceWriteRef.current = true;
      } else {
        // Transient failure: put them back and retry shortly.
        candidateBufferRef.current.unshift(...batch);
        candidateFlushTimerRef.current = setTimeout(() => void flushCandidates(), 1000);
        return;
      }
    }

    // Legacy path (before the migration): read, append and write back.
    const { data } = await supabase.from('webrtc_sessions').select('ice_candidates').eq('id', sessionId).maybeSingle();
    const current = ((data)?.ice_candidates ?? []) as RTCIceCandidateInit[];
    await supabase
      .from('webrtc_sessions')
      .update({ ice_candidates: [...current, ...batch] as unknown as Json[] })
      .eq('id', sessionId);
    if (candidateBufferRef.current.length > 0) void flushCandidates();
  }, [sessionId]);

  const queueLocalCandidate = useCallback((candidate: RTCIceCandidate) => {
    candidateBufferRef.current.push(candidate.toJSON());
    if (!candidateFlushTimerRef.current) {
      candidateFlushTimerRef.current = setTimeout(() => void flushCandidates(), 120);
    }
  }, [flushCandidates]);

  /** Tells the server whether audio/video is flowing on this side. */
  const mediaQueueRef = useRef<Promise<void>>(Promise.resolve());
  const mediaWantedRef = useRef<boolean | null>(null);
  const reportMedia = useCallback((connected: boolean) => {
    if (mediaReportTimerRef.current) {
      clearTimeout(mediaReportTimerRef.current);
      mediaReportTimerRef.current = null;
    }
    if (mediaWantedRef.current === connected) return;
    mediaWantedRef.current = connected;
    // One report at a time, in order: "no media" sent at join can never land
    // after the "connected" that follows it.
    mediaQueueRef.current = mediaQueueRef.current.then(async () => {
      for (let attempt = 0; attempt < 6; attempt++) {
        if (disposedRef.current || mediaWantedRef.current !== connected) return;
        const { error: rpcError } = await supabase.rpc('report_call_media', {
          p_session_id: sessionId,
          p_connected: connected,
        });
        if (!rpcError || isMissingFunction(rpcError)) {
          mediaReportedRef.current = connected;
          return;
        }
        await new Promise((resolve) => setTimeout(resolve, Math.min(1000 * 2 ** attempt, 8000)));
      }
    });
  }, [sessionId]);

  // ------------------------------------------------------- peer connection

  const handleConnectionState = useCallback((pc: RTCPeerConnection) => {
    if (pc !== pcRef.current || disposedRef.current) return;
    const state = pc.connectionState;
    setConnectionState(state);
    setIsConnected(state === 'connected');
    onStateChangeRef.current?.(state);

    if (state === 'connected') {
      clearReconnectTimers();
      const recovered = wasConnectedRef.current && (reconnectAttemptsRef.current > 0 || isReconnectingRef.current);
      wasConnectedRef.current = true;
      reconnectAttemptsRef.current = 0;
      setReconnectAttempt(0);
      setIsReconnecting(false);
      setError(null);
      setNotConnectedSince(null);
      reportMedia(true);
      void tuneSenders(pc);
      if (recovered) toastRef.current({ title: 'Conexão restabelecida' });
      return;
    }

    // A connection closed without anyone ending the call is a failure too.
    if (state === 'disconnected' || state === 'failed' || state === 'closed') {
      if (callEndedByRef.current) return;
      setNotConnectedSince((prev) => prev ?? Date.now());
      setIsReconnecting(true);
      // Short drops recover by themselves; only report "no media" if it lasts.
      if (!mediaReportTimerRef.current) {
        mediaReportTimerRef.current = setTimeout(() => {
          mediaReportTimerRef.current = null;
          if (pcRef.current?.connectionState !== 'connected') reportMedia(false);
        }, 4000);
      }
      if (state === 'failed' || state === 'closed') {
        attemptReconnectRef.current();
      } else if (!graceTimerRef.current) {
        graceTimerRef.current = setTimeout(() => {
          graceTimerRef.current = null;
          const current = pcRef.current;
          if (current && ['disconnected', 'failed'].includes(current.connectionState)) {
            attemptReconnectRef.current();
          }
        }, 3000);
      }
    }
  }, [clearReconnectTimers, reportMedia, tuneSenders]);

  const attachRemoteStream = useCallback((stream: MediaStream) => {
    remoteStreamRef.current = stream;
    setRemoteStream(stream);
    const el = remoteVideoRef.current;
    if (el && el.srcObject !== stream) {
      el.srcObject = stream;
      void Promise.resolve(el.play?.()).catch(() => undefined);
    }
  }, []);

  /** Creates a peer connection carrying our local tracks and the control channel. */
  const buildPeerConnection = useCallback(async (stream: MediaStream) => {
    if (!iceServersRef.current) iceServersRef.current = await getIceServers();
    const pc = new RTCPeerConnection({
      iceServers: iceServersRef.current,
      iceCandidatePoolSize: 4,
      bundlePolicy: 'max-bundle',
      rtcpMuxPolicy: 'require',
    });

    stream.getTracks().forEach((track) => pc.addTrack(track, stream));

    // In-call control channel: CALL_ENDED and camera/mic state, instantly.
    signalChannelRef.current?.close();
    signalChannelRef.current = attachCallSignalChannel(pc as unknown as Parameters<typeof attachCallSignalChannel>[0], (signal) => {
      if (pc !== pcRef.current) return;
      if (signal.type === 'MEDIA_STATE') {
        if (signal.userType === userType) return;
        remoteMediaReceivedAtRef.current = Date.now();
        setIsRemoteMediaStale(false);
        setRemoteMediaState((prev) => {
          if (!prev) return signal;
          if (signal.seq !== prev.seq) return signal.seq > prev.seq ? signal : prev;
          return signal.at >= prev.at ? signal : prev;
        });
        return;
      }
      if (signal.type === 'MEDIA_STATE_REQUEST') {
        if (signal.from === userType) return;
        const payload = localMediaStateRef.current;
        if (payload) signalChannelRef.current?.sendMediaState(payload);
        return;
      }
      if (signal.type !== 'CALL_ENDED') return;
      setCallEndedBy({ userId: '', userType: signal.endedByType });
      trackSosEvent({
        eventType: SOS_EVENTS.CALL_ENDED_SIGNAL_RECEIVED,
        sessionId,
        actorType: userType,
        message: 'CALL_ENDED recebido do peer',
        metadata: { endedByType: signal.endedByType, reason: signal.reason, at: signal.at },
      });
    });

    pc.onconnectionstatechange = () => handleConnectionState(pc);
    // Some browsers keep `connectionState` optimistic while ICE already dropped.
    pc.oniceconnectionstatechange = () => {
      if (pc !== pcRef.current || !isLive()) return;
      if (pc.iceConnectionState === 'failed') {
        setIsReconnecting(true);
        attemptReconnectRef.current();
      } else if (pc.iceConnectionState === 'disconnected' && !graceTimerRef.current) {
        setIsReconnecting(true);
        graceTimerRef.current = setTimeout(() => {
          graceTimerRef.current = null;
          if (pcRef.current === pc && ['disconnected', 'failed'].includes(pc.iceConnectionState)) {
            attemptReconnectRef.current();
          }
        }, 3000);
      }
    };
    pc.onicecandidate = (event) => {
      if (pc !== pcRef.current || !event.candidate) return;
      queueLocalCandidate(event.candidate);
    };
    pc.ontrack = (event) => {
      if (pc !== pcRef.current) return;
      const incoming = event.streams[0] ?? new MediaStream([event.track]);
      attachRemoteStream(incoming);
    };

    await tuneSenders(pc);
    return pc;
  }, [sessionId, userType, handleConnectionState, queueLocalCandidate, attachRemoteStream, tuneSenders]);

  /** Swaps in a brand-new peer connection (keeps camera/mic running). */
  const installPeerConnection = useCallback((pc: RTCPeerConnection) => {
    const old = pcRef.current;
    pcRef.current = pc;
    lastAppliedOfferRef.current = null;
    lastAppliedAnswerRef.current = null;
    publishedOfferRef.current = null;
    publishedAnswerRef.current = null;
    appliedCandidatesRef.current = new Set();
    candidateBufferRef.current = [];
    if (old && old !== pc) {
      old.onconnectionstatechange = null;
      old.oniceconnectionstatechange = null;
      old.onicecandidate = null;
      old.ontrack = null;
      try {
        old.close();
      } catch {
        /* noop */
      }
    }
    setPeerConnection(pc);
    setConnectionState(pc.connectionState);
    setIsConnected(pc.connectionState === 'connected');
  }, []);

  const rebuildPeerConnection = useCallback(async (reason: string) => {
    const stream = localStreamRef.current;
    if (!stream || disposedRef.current) return null;
    console.log(`🔁 Recreating the peer connection (${reason})`);
    trackSosEvent({
      eventType: SOS_EVENTS.CALL_ENDED_SIGNAL_SENT,
      sessionId,
      actorType: userType,
      message: `Conexão recriada: ${reason}`,
    });
    const pc = await buildPeerConnection(stream);
    if (disposedRef.current) {
      pc.close();
      return null;
    }
    installPeerConnection(pc);
    return pc;
  }, [sessionId, userType, buildPeerConnection, installPeerConnection]);

  // ------------------------------------------------------- offer / answer

  const writeOffer = useCallback(async (sdp: string) => {
    const { data: auth } = await getSessionUser();
    const { error: writeError } = await supabase
      .from('webrtc_sessions')
      .update({ offer: { type: 'offer', sdp }, answer: null, psychologist_id: auth.user?.id })
      .eq('id', sessionId);
    if (writeError) throw writeError;
  }, [sessionId]);

  const publishOffer = useCallback(async (pc: RTCPeerConnection, iceRestart: boolean) => {
    if (pc !== pcRef.current || pc.signalingState === 'closed') return;
    // A pending offer that never got an answer is replaced by a fresh one.
    if (pc.signalingState === 'have-local-offer') {
      await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit).catch(() => undefined);
    }
    const offer = await pc.createOffer({ iceRestart });
    await pc.setLocalDescription(offer);
    lastAppliedAnswerRef.current = null;
    appliedCandidatesRef.current = new Set();
    publishedOfferRef.current = offer.sdp ?? null;
    await writeOffer(offer.sdp ?? '');
  }, [writeOffer]);

  const publishAnswer = useCallback(async (answerSdp: string, offerSdp: string) => {
    publishedAnswerRef.current = answerSdp;
    const { data: auth } = await getSessionUser();
    const { error: writeError } = await supabase
      .from('webrtc_sessions')
      .update({
        answer: { type: 'answer', sdp: answerSdp, forOffer: sdpTag(offerSdp) },
        patient_id: auth.user?.id,
      })
      .eq('id', sessionId);
    if (writeError) throw writeError;
  }, [sessionId]);

  const applyCandidates = useCallback(async (pc: RTCPeerConnection, candidates?: RTCIceCandidateInit[]) => {
    if (!Array.isArray(candidates) || pc !== pcRef.current) return;
    if (pc.signalingState === 'closed' || !pc.remoteDescription?.type) return;
    // Only candidates of the CURRENT remote ICE credentials: the row keeps
    // candidates of previous generations, and adding them poisons the checks.
    const remoteUfrags = getUfrags(pc.remoteDescription.sdp);
    for (const candidateData of candidates) {
      if (!candidateData || typeof candidateData !== 'object') continue;
      const ufrag = (candidateData).usernameFragment;
      if (ufrag && remoteUfrags.length > 0 && !remoteUfrags.includes(ufrag)) continue;
      const key = candidateKey(candidateData);
      if (appliedCandidatesRef.current.has(key)) continue;
      appliedCandidatesRef.current.add(key);
      try {
        await pc.addIceCandidate(new RTCIceCandidate(candidateData));
      } catch (err) {
        console.warn('⚠️ Error adding ICE candidate:', err);
      }
    }
  }, []);

  /**
   * Brings this side in line with the row. Idempotent: called on every
   * realtime event and on every poll, so a lost write or event heals itself.
   */
  const reconcile = useCallback(async (row: WebRTCSession) => {
    let pc = pcRef.current;
    if (!pc || !isLive()) return;

    if (userType === 'patient') {
      if (pc.signalingState === 'closed') {
        // Our side died: a fresh connection, and ask the psychologist for a new offer.
        pc = (await rebuildPeerConnection('conexão local fechada')) ?? pc;
        await supabase
          .from('webrtc_sessions')
          .update({ renegotiate_requested_at: new Date().toISOString() })
          .eq('id', sessionId);
        return;
      }
      const offer = row.offer;
      if (offer?.sdp) {
        if (offer.sdp !== lastAppliedOfferRef.current) {
          // The psychologist is on a new connection (reload or rebuild).
          if (pc.remoteDescription && isNewRemotePeer(pc.remoteDescription.sdp, offer.sdp)) {
            pc = (await rebuildPeerConnection('o psicólogo reconectou')) ?? pc;
          }
          if (pc.signalingState === 'have-local-offer') {
            await pc.setLocalDescription({ type: 'rollback' } as RTCSessionDescriptionInit).catch(() => undefined);
          }
          await pc.setRemoteDescription({ type: 'offer', sdp: offer.sdp });
          lastAppliedOfferRef.current = offer.sdp;
          appliedCandidatesRef.current = new Set();
          const answer = await pc.createAnswer();
          await pc.setLocalDescription(answer);
          await publishAnswer(answer.sdp ?? '', offer.sdp);
        } else if (
          pc.signalingState === 'stable' &&
          publishedAnswerRef.current &&
          row.answer?.sdp !== publishedAnswerRef.current
        ) {
          // Our answer never made it (or was wiped by a write race): publish again.
          await publishAnswer(publishedAnswerRef.current, offer.sdp);
        }
      }
    } else {
      // Psychologist: make sure there is a live offer of ours in the row.
      if (!pc.localDescription || pc.signalingState === 'stable' && !pc.remoteDescription) {
        await publishOffer(pc, false);
        return;
      }

      if (isPendingRenegotiation(row.renegotiate_requested_at, lastRenegotiationHandledRef.current, joinedAtRef.current)) {
        lastRenegotiationHandledRef.current = new Date(row.renegotiate_requested_at!).getTime();
        // Always honoured: the patient may see a dead call while our side still
        // looks "connected" (one-way failure).
        const fresh = await rebuildPeerConnection('o paciente pediu uma conexão nova');
        if (fresh) await publishOffer(fresh, false);
        return;
      }

      const answer = row.answer;
      if (pc.signalingState === 'have-local-offer') {
        if (publishedOfferRef.current && row.offer?.sdp !== publishedOfferRef.current) {
          // Our offer write was lost or overwritten: publish it again.
          await writeOffer(publishedOfferRef.current);
          return;
        }
        if (answer?.sdp && answer.sdp !== lastAppliedAnswerRef.current && answerMatchesOffer(answer, pc.localDescription?.sdp)) {
          await pc.setRemoteDescription({ type: 'answer', sdp: answer.sdp });
          lastAppliedAnswerRef.current = answer.sdp;
          appliedCandidatesRef.current = new Set();
        }
      } else if (
        pc.signalingState === 'stable' &&
        answer?.sdp &&
        answer.sdp !== lastAppliedAnswerRef.current &&
        isNewRemotePeer(pc.remoteDescription?.sdp, answer.sdp)
      ) {
        // The patient came back on a new connection: start over with a fresh one.
        const fresh = await rebuildPeerConnection('o paciente reconectou');
        if (fresh) await publishOffer(fresh, false);
        return;
      }
    }

    await applyCandidates(pcRef.current!, row.ice_candidates);
  }, [userType, sessionId, rebuildPeerConnection, publishAnswer, publishOffer, writeOffer, applyCandidates]);

  // ------------------------------------------------------------ reconnect

  const attemptReconnect = useCallback(() => {
    if (!isLive()) return;
    if (reconnectTimerRef.current || settleTimerRef.current) return; // already in progress
    const pc = pcRef.current;
    if (!pc || pc.connectionState === 'connected') return;

    const attempt = reconnectAttemptsRef.current + 1;
    reconnectAttemptsRef.current = attempt;
    setReconnectAttempt(attempt);
    setIsReconnecting(true);
    if (attempt > MAX_RECONNECT_ATTEMPTS) {
      // Never gives up: keeps trying at the slowest pace, and the screen offers
      // the alternatives (try again, call another psychologist, end with refund).
      setError(null);
    }

    reconnectTimerRef.current = setTimeout(async () => {
      reconnectTimerRef.current = null;
      if (!isLive()) return;
      const current = pcRef.current;
      if (!current || current.connectionState === 'connected') return;

      // No point in burning attempts while the device has no network at all.
      if (typeof navigator !== 'undefined' && !navigator.onLine) {
        reconnectAttemptsRef.current = Math.max(0, reconnectAttemptsRef.current - 1);
        settleTimerRef.current = setTimeout(() => {
          settleTimerRef.current = null;
          attemptReconnectRef.current();
        }, 2000);
        return;
      }

      if (userType === 'psychologist') {
        await enqueue(async () => {
          const live = pcRef.current;
          if (!live || live.connectionState === 'connected') return;
          if (reconnectStepFor(attempt) === 'ice-restart' && live.signalingState !== 'closed' && live.remoteDescription) {
            live.restartIce?.();
            await publishOffer(live, true);
          } else {
            const fresh = await rebuildPeerConnection(`reconexão (tentativa ${attempt})`);
            if (fresh) await publishOffer(fresh, false);
          }
        });
      } else if (current.signalingState === 'closed') {
        await enqueue(async () => {
          await rebuildPeerConnection('conexão local fechada');
          await supabase
            .from('webrtc_sessions')
            .update({ renegotiate_requested_at: new Date().toISOString() })
            .eq('id', sessionId);
        });
      } else if (patientShouldRequestRenegotiation(attempt)) {
        await supabase
          .from('webrtc_sessions')
          .update({ renegotiate_requested_at: new Date().toISOString() })
          .eq('id', sessionId);
      }

      // Give the attempt time to settle before trying the next step.
      settleTimerRef.current = setTimeout(() => {
        settleTimerRef.current = null;
        const live = pcRef.current;
        if (isLive() && live && live.connectionState !== 'connected') attemptReconnectRef.current();
      }, 6000);
    }, getReconnectDelay(Math.min(attempt, 4)));
  }, [userType, sessionId, enqueue, publishOffer, rebuildPeerConnection]);

  const attemptReconnectRef = useRef(attemptReconnect);
  attemptReconnectRef.current = attemptReconnect;

  /** Manual retry ("Tentar de novo"): skips straight to a fresh connection. */
  const forceReconnect = useCallback(() => {
    if (!isLive()) return;
    clearReconnectTimers();
    reconnectAttemptsRef.current = 2; // next step = full rebuild
    setReconnectAttempt(2);
    setError(null);
    setIsReconnecting(true);
    if (userType === 'psychologist') {
      void enqueue(async () => {
        const fresh = await rebuildPeerConnection('pedido de quem está na chamada');
        if (fresh) await publishOffer(fresh, false);
      });
    } else {
      // Supabase queries only run when awaited/then'd.
      void (async () => {
        await supabase
          .from('webrtc_sessions')
          .update({ renegotiate_requested_at: new Date().toISOString() })
          .eq('id', sessionId);
      })();
    }
    settleTimerRef.current = setTimeout(() => {
      settleTimerRef.current = null;
      if (pcRef.current?.connectionState !== 'connected') attemptReconnectRef.current();
    }, 6000);
  }, [userType, sessionId, enqueue, clearReconnectTimers, rebuildPeerConnection, publishOffer]);

  // Network lost/back. Losing the network is an involuntary drop: the call
  // stays open and resumes as soon as we are back.
  useEffect(() => {
    const handleOffline = () => {
      setIsNetworkOffline(true);
      if (isLive()) setIsReconnecting(true);
    };
    const handleOnline = () => {
      setIsNetworkOffline(false);
      const pc = pcRef.current;
      if (!pc || !isLive() || pc.connectionState === 'connected') return;
      clearReconnectTimers();
      reconnectAttemptsRef.current = 0;
      setReconnectAttempt(0);
      attemptReconnectRef.current();
    };
    window.addEventListener('offline', handleOffline);
    window.addEventListener('online', handleOnline);
    return () => {
      window.removeEventListener('offline', handleOffline);
      window.removeEventListener('online', handleOnline);
    };
  }, [clearReconnectTimers]);

  // Coming back from a background tab / locked screen often leaves ICE stale.
  useEffect(() => {
    const handleVisibility = () => {
      if (document.visibilityState !== 'visible') return;
      const pc = pcRef.current;
      if (!pc || !isLive()) return;
      if (['disconnected', 'failed'].includes(pc.connectionState)) attemptReconnectRef.current();
      const el = remoteVideoRef.current;
      if (el?.paused && el.srcObject) void Promise.resolve(el.play?.()).catch(() => undefined);
    };
    document.addEventListener('visibilitychange', handleVisibility);
    return () => document.removeEventListener('visibilitychange', handleVisibility);
  }, []);

  // Network quality (like Meet's "sua conexão está instável"): when the link is
  // poor, the video gives way so the voice keeps flowing.
  useEffect(() => {
    if (!isConnected) return;
    let lastLost = 0;
    let lastReceived = 0;
    let poorStreak = 0;
    let goodStreak = 0;
    let relieved = false;
    const timer = setInterval(async () => {
      const pc = pcRef.current;
      if (!pc || pc.connectionState !== 'connected') return;
      try {
        const stats = await pc.getStats();
        let rttMs: number | null = null;
        let lost = 0;
        let received = 0;
        stats.forEach((report: RTCStats & { nominated?: boolean; state?: string; currentRoundTripTime?: number; isRemote?: boolean; packetsLost?: number; packetsReceived?: number }) => {
          if (report.type === 'candidate-pair' && report.nominated && report.state === 'succeeded' && typeof report.currentRoundTripTime === 'number') {
            rttMs = report.currentRoundTripTime * 1000;
          }
          if (report.type === 'inbound-rtp' && !report.isRemote) {
            lost += report.packetsLost ?? 0;
            received += report.packetsReceived ?? 0;
          }
        });
        const dLost = Math.max(0, lost - lastLost);
        const dReceived = Math.max(0, received - lastReceived);
        lastLost = lost;
        lastReceived = received;
        const lossRatio = dLost + dReceived > 0 ? dLost / (dLost + dReceived) : 0;
        const quality = classifyNetworkQuality({ rttMs, lossRatio });
        setNetworkQuality(quality);

        if (quality === 'poor') {
          poorStreak += 1;
          goodStreak = 0;
        } else {
          goodStreak += 1;
          poorStreak = 0;
        }
        if (!relieved && poorStreak >= 3) {
          relieved = true;
          await tuneSenders(pc, true);
        } else if (relieved && goodStreak >= 5) {
          relieved = false;
          await tuneSenders(pc, false);
        }
      } catch {
        /* stats are best effort */
      }
    }, 2000);
    return () => {
      clearInterval(timer);
      setNetworkQuality('good');
    };
  }, [isConnected, tuneSenders]);

  // ------------------------------------------------------- media controls

  const choiceKey = mediaChoiceKey(sessionId, userType);
  const rememberChoice = useCallback(() => {
    writeMediaChoice(choiceKey, { muted: isMutedRef.current, cameraOff: cameraOffRef.current });
  }, [choiceKey]);

  /** Troca o vídeo local (na conexão e na miniatura) sem renegociar. */
  const swapLocalVideoTrack = useCallback(async (oldTrack: MediaStreamTrack | null, newTrack: MediaStreamTrack | null) => {
    const stream = localStreamRef.current;
    if (!stream) return;
    const pc = pcRef.current;
    if (pc && oldTrack) {
      for (const sender of pc.getSenders()) {
        if (sender.track !== oldTrack) continue;
        try {
          await sender.replaceTrack(newTrack);
        } catch (err) {
          console.warn('[WebRTC] replaceTrack failed', err);
        }
      }
    }
    const next = new MediaStream([...stream.getTracks().filter((t) => t !== oldTrack), ...(newTrack ? [newTrack] : [])]);
    localStreamRef.current = next;
    setLocalStream(next);
    if (localVideoRef.current) localVideoRef.current.srcObject = next;
  }, []);

  /** Solta a câmera (luz apagada) e põe o quadro preto no lugar dela. */
  const releaseCamera = useCallback(async () => {
    const real = localStreamRef.current?.getVideoTracks().find((t) => t !== placeholderTrackRef.current) ?? null;
    if (!real) return;
    try {
      cameraDeviceRef.current = real.getSettings?.().deviceId || cameraDeviceRef.current;
    } catch {
      /* noop */
    }
    const placeholder = makePlaceholderVideoTrack();
    if (!placeholder) {
      // Navegador sem quadro substituto: ao menos para de enviar a imagem.
      real.enabled = false;
      return;
    }
    placeholderTrackRef.current = placeholder;
    await swapLocalVideoTrack(real, placeholder);
    real.stop();
  }, [swapLocalVideoTrack]);

  /** Liga a câmera de novo (abre o aparelho e troca o quadro preto pela imagem). */
  const reacquireCamera = useCallback(async (): Promise<boolean> => {
    const current = localStreamRef.current?.getVideoTracks()[0] ?? null;
    if (current && current !== placeholderTrackRef.current) {
      current.enabled = true;
      return true;
    }
    try {
      const deviceId = cameraDeviceRef.current || preferencesRef.current?.camera_device_id || undefined;
      const fresh = await navigator.mediaDevices.getUserMedia({
        video: {
          width: { ideal: 1280 },
          height: { ideal: 720 },
          facingMode: 'user',
          ...(deviceId ? { deviceId: { ideal: deviceId } } : {}),
        },
      });
      const track = fresh.getVideoTracks()[0];
      if (!track) throw new Error('Nenhuma câmera encontrada');
      if (disposedRef.current) {
        track.stop();
        return false;
      }
      try {
        (track).contentHint = 'motion';
      } catch {
        /* noop */
      }
      await swapLocalVideoTrack(current, track);
      if (current) current.stop();
      placeholderTrackRef.current = null;
      return true;
    } catch (err) {
      console.warn('[WebRTC] could not turn the camera back on', err);
      toastRef.current({
        title: 'Não foi possível ligar a câmera',
        description: 'Confira se outro aplicativo está usando a câmera e tente de novo.',
        variant: 'destructive',
      });
      return false;
    }
  }, [swapLocalVideoTrack]);

  /** Liga/desliga o microfone (a escolha fica guardada para recarregar). */
  const setMuted = useCallback((muted: boolean) => {
    isMutedRef.current = muted;
    localStreamRef.current?.getAudioTracks().forEach((track) => {
      track.enabled = !muted;
    });
    setIsMutedState(muted);
    rememberChoice();
    return muted;
  }, [rememberChoice]);

  /** Liga/desliga a câmera; devolve como ficou (religar pode falhar). */
  const setCameraOff = useCallback((off: boolean): Promise<boolean> => {
    const run = async () => {
      if (off) {
        cameraOffRef.current = true;
        setIsCameraOffState(true);
        rememberChoice();
        await releaseCamera();
        return true;
      }
      const ok = await reacquireCamera();
      cameraOffRef.current = !ok;
      setIsCameraOffState(!ok);
      rememberChoice();
      return !ok;
    };
    const next = cameraQueueRef.current.then(run, run);
    cameraQueueRef.current = next.catch(() => undefined);
    return next;
  }, [releaseCamera, reacquireCamera, rememberChoice]);

  const toggleAudio = useCallback(() => setMuted(!isMutedRef.current), [setMuted]);
  const toggleVideo = useCallback(() => setCameraOff(!cameraOffRef.current), [setCameraOff]);

  const sendMediaState = useCallback((payload: Omit<MediaStateSignal, 'type' | 'at' | 'seq'>) => {
    localMediaStateRef.current = payload;
    return signalChannelRef.current?.sendMediaState(payload) ?? false;
  }, []);

  // While audio/video flows, a pulse every 20 s lets the server add up how long
  // BOTH sides were really in the call (a consultation only counts after 5 min).
  useEffect(() => {
    if (!isConnected) return;
    const timer = setInterval(() => {
      if (disposedRef.current || pcRef.current?.connectionState !== 'connected') return;
      mediaQueueRef.current = mediaQueueRef.current.then(async () => {
        await supabase.rpc('report_call_media', { p_session_id: sessionId, p_connected: true });
      }).catch(() => undefined);
    }, 20_000);
    return () => clearInterval(timer);
  }, [isConnected, sessionId]);

  // Re-announce our media state whenever the connection comes up.
  useEffect(() => {
    if (!isConnected) return;
    let attempts = 0;
    const timer = setInterval(() => {
      attempts += 1;
      const payload = localMediaStateRef.current;
      const sent = payload ? signalChannelRef.current?.sendMediaState(payload) : false;
      if (sent || attempts >= 8) clearInterval(timer);
    }, 800);
    return () => clearInterval(timer);
  }, [isConnected]);

  useEffect(() => {
    isNetworkOfflineRef.current = isNetworkOffline;
  }, [isNetworkOffline]);
  useEffect(() => {
    isReconnectingRef.current = isReconnecting;
  }, [isReconnecting]);

  // Staleness watchdog for the remote camera/mic indicators.
  useEffect(() => {
    let wasOpen = false;
    const evaluate = () => {
      const open = signalChannelRef.current?.isOpen() ?? false;
      if (open && !wasOpen) {
        signalChannelRef.current?.requestMediaState(userType);
        const payload = localMediaStateRef.current;
        if (payload) signalChannelRef.current?.sendMediaState(payload);
      }
      wasOpen = open;
      const knowsRemote = remoteMediaReceivedAtRef.current > 0;
      const degraded = !open || isNetworkOfflineRef.current || isReconnectingRef.current;
      setIsRemoteMediaStale(knowsRemote && degraded);
    };
    evaluate();
    const timer = setInterval(evaluate, 1000);
    return () => clearInterval(timer);
  }, [userType]);

  // The remote <video> may mount after the track arrived (or be re-mounted).
  useEffect(() => {
    const el = remoteVideoRef.current;
    if (!el || !remoteStream) return;
    if (el.srcObject !== remoteStream) el.srcObject = remoteStream;
    void Promise.resolve(el.play?.()).catch(() => undefined);
  });

  // ------------------------------------------------------------- teardown

  const cleanup = useCallback(() => {
    if (disposedRef.current && !pcRef.current && !localStreamRef.current) return;
    disposedRef.current = true;
    clearReconnectTimers();
    if (candidateFlushTimerRef.current) clearTimeout(candidateFlushTimerRef.current);
    if (mediaReportTimerRef.current) clearTimeout(mediaReportTimerRef.current);
    candidateFlushTimerRef.current = null;
    mediaReportTimerRef.current = null;

    signalChannelRef.current?.close();
    signalChannelRef.current = null;

    localStreamRef.current?.getTracks().forEach((track) => {
      if (track.readyState !== 'ended') track.stop();
    });
    remoteStreamRef.current?.getTracks().forEach((track) => {
      if (track.readyState !== 'ended') track.stop();
    });
    if (localVideoRef.current) localVideoRef.current.srcObject = null;
    if (remoteVideoRef.current) remoteVideoRef.current.srcObject = null;

    const pc = pcRef.current;
    pcRef.current = null;
    if (pc) {
      pc.onconnectionstatechange = null;
      pc.oniceconnectionstatechange = null;
      pc.onicecandidate = null;
      pc.ontrack = null;
      try {
        pc.getTransceivers().forEach((t) => t.stop?.());
      } catch {
        /* noop */
      }
      try {
        if (pc.signalingState !== 'closed') pc.close();
      } catch {
        /* noop */
      }
    }

    localStreamRef.current = null;
    placeholderTrackRef.current = null;
    remoteStreamRef.current = null;
    setLocalStream(null);
    setRemoteStream(null);
    setPeerConnection(null);
    setIsConnected(false);
    setConnectionState('closed');
    setIsInitializing(false);
    setIsReconnecting(false);
    setReconnectAttempt(0);
    reconnectAttemptsRef.current = 0;
    setWebrtcState('idle');
  }, [clearReconnectTimers]);

  /** Camera/microphone switched in the settings: swap tracks without renegotiating. */
  const updateDeviceStream = useCallback(async (newStream: MediaStream) => {
    const pc = pcRef.current;
    const oldStream = localStreamRef.current;
    if (!pc || !oldStream) return;
    try {
      const placeholder = placeholderTrackRef.current;
      let videoTrack: MediaStreamTrack | undefined = newStream.getVideoTracks()[0];
      const audioTrack = newStream.getAudioTracks()[0];
      // Câmera desligada: a nova câmera fica só lembrada; o quadro preto continua.
      if (cameraOffRef.current && placeholder && videoTrack) {
        try {
          cameraDeviceRef.current = videoTrack.getSettings?.().deviceId || cameraDeviceRef.current;
        } catch {
          /* noop */
        }
        videoTrack.stop();
        newStream.removeTrack(videoTrack);
        newStream.addTrack(placeholder);
        videoTrack = undefined;
      }
      for (const sender of pc.getSenders()) {
        if (!sender.track) continue;
        if (sender.track.kind === 'video' && videoTrack) await sender.replaceTrack(videoTrack);
        else if (sender.track.kind === 'audio' && audioTrack) await sender.replaceTrack(audioTrack);
      }
      // Keep the enabled/disabled state the person had chosen.
      if (videoTrack) videoTrack.enabled = !cameraOffRef.current;
      if (audioTrack) audioTrack.enabled = !isMutedRef.current;
      oldStream.getTracks().forEach((track) => {
        if (track === placeholder) return;
        try {
          track.stop();
        } catch {
          /* noop */
        }
      });
      localStreamRef.current = newStream;
      setLocalStream(newStream);
      if (localVideoRef.current) localVideoRef.current.srcObject = newStream;
    } catch (err) {
      console.error('❌ Error updating device stream:', err);
      toastRef.current({
        title: 'Erro',
        description: 'Erro ao atualizar dispositivos na chamada',
        variant: 'destructive',
      });
    }
  }, []);

  // --------------------------------------------------------------- start

  useEffect(() => {
    if (!sessionId || prefsLoading) return;
    let isMounted = true;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    let pollTimer: ReturnType<typeof setInterval> | null = null;

    disposedRef.current = false;
    joinedAtRef.current = Date.now();
    lastRenegotiationHandledRef.current = Date.now();
    mediaReportedRef.current = null;
    mediaWantedRef.current = null;
    wasConnectedRef.current = false;
    setNotConnectedSince(Date.now());

    const initialize = async () => {
      setMediaChoiceReady(false);
      setWebrtcState('initializing');
      setIsInitializing(true);
      try {
        const stream = await initializeMedia();
        if (!isMounted) {
          stream.getTracks().forEach((t) => t.stop());
          return;
        }

        let roomRow: Record<string, unknown> | null = null;
        // Reopen the session if it carries a stale "completed" state from a
        // previous call/reconnection — otherwise both peers would think the
        // other one hung up. The database refuses it for a finished call.
        try {
          const { data: existing } = await supabase
            .from('webrtc_sessions')
            .select('status, ended_at, ended_by, ended_by_type, patient_muted, patient_camera_off, psychologist_muted, psychologist_camera_off')
            .eq('id', sessionId)
            .maybeSingle();
          roomRow = existing as Record<string, unknown> | null;
          if (existing?.status === 'completed') {
            const { error: reopenError } = await supabase
              .from('webrtc_sessions')
              .update({ status: 'active', ended_at: null, ended_by: null, ended_by_type: null, updated_at: new Date().toISOString() })
              .eq('id', sessionId);
            if (reopenError) {
              setCallEndedBy({ userId: existing.ended_by ?? '', userType: existing.ended_by_type ?? 'system' });
              stream.getTracks().forEach((track) => track.stop());
              setIsInitializing(false);
              return;
            }
          }
        } catch (err) {
          console.warn('Could not verify session state:', err);
        }

        // Câmera/microfone como a pessoa deixou (recarregar a página não liga
        // nada sozinho): primeiro o que este aparelho guardou, senão a sala.
        const choice = readMediaChoice(choiceKey) ?? {
          muted: roomRow?.[`${userType}_muted`] === true,
          cameraOff: roomRow?.[`${userType}_camera_off`] === true,
        };
        setMuted(choice.muted);
        if (choice.cameraOff) await setCameraOff(true);
        if (!isMounted) return;
        setMediaChoiceReady(true);

        const pc = await buildPeerConnection(localStreamRef.current ?? stream);
        if (!isMounted) {
          pc.close();
          (localStreamRef.current ?? stream).getTracks().forEach((t) => t.stop());
          return;
        }
        installPeerConnection(pc);
        // Fresh start (or page reload): no media yet on this side. Clears a
        // stale "connected" left by a previous tab, so the server's fallbacks
        // (call another psychologist, refunds) see the real state.
        reportMedia(false);

        const applyRow = (row: WebRTCSession) => {
          if (!isMounted || !row) return;
          setSession(row);
          window.dispatchEvent(new CustomEvent('webrtc-session-update', { detail: row }));
          if (isRealTermination(row, joinedAtRef.current)) {
            setCallEndedBy({ userId: row.ended_by!, userType: row.ended_by_type! });
            return;
          }
          void enqueue(() => reconcile(row));
        };

        const readRow = async () => {
          const { data, error: readError } = await supabase.from('webrtc_sessions').select('*').eq('id', sessionId).maybeSingle();
          if (!readError && data) applyRow(data as unknown as WebRTCSession);
        };

        channel = supabase
          .channel(`webrtc_session_${sessionId}_${joinedAtRef.current}`)
          .on(
            'postgres_changes',
            { event: 'UPDATE', schema: 'public', table: 'webrtc_sessions', filter: `id=eq.${sessionId}` },
            (payload) => applyRow(payload.new as WebRTCSession)
          )
          .subscribe((status) => {
            // Back from a dropped socket: catch up on whatever was missed.
            if (status === 'SUBSCRIBED') void readRow();
          });

        // Safety net: realtime can silently die after a drop. While the media is
        // not flowing, re-read the row every 3 s; once connected, every 6 s
        // (cheap) so a new peer or a renegotiation request is never missed.
        let tick = 0;
        pollTimer = setInterval(() => {
          tick += 1;
          if (!isMounted || !isLive()) return;
          const connected = pcRef.current?.connectionState === 'connected';
          if (connected && tick % 2 !== 0) return;
          void readRow();
        }, 3000);

        await readRow();
        setIsInitializing(false);
        setWebrtcState('connected');
      } catch (err) {
        console.error('❌ WebRTC initialization failed:', err);
        if (isMounted) {
          setWebrtcState('error');
          setError(getFriendlyErrorMessage(err, 'Erro ao inicializar videochamada.'));
          setIsInitializing(false);
        }
      }
    };

    void initialize();

    return () => {
      isMounted = false;
      if (pollTimer) clearInterval(pollTimer);
      if (channel) supabase.removeChannel(channel);
      cleanup();
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [sessionId, userType, prefsLoading]);

  return {
    localVideoRef,
    remoteVideoRef,
    localStream,
    remoteStream,
    peerConnection,
    connectionState,
    isConnected,
    error,
    session,
    isInitializing,
    webrtcState,
    callEndedBy,
    isReconnecting,
    reconnectAttempt,
    isNetworkOffline,
    /** Since when audio/video is not flowing (null while connected). */
    notConnectedSince,
    /** Link quality while connected (shown as "conexão instável"). */
    networkQuality,
    forceReconnect,
    toggleAudio,
    toggleVideo,
    setMuted,
    setCameraOff,
    isMuted,
    isCameraOff,
    /** A escolha guardada de câmera/microfone já foi aplicada. */
    mediaChoiceReady,
    remoteMediaState,
    /** True when the remote camera/mic indicators may be outdated. */
    isRemoteMediaStale,
    /** Announces the local camera/mic/avatar state to the peer instantly. */
    sendMediaState,
    cleanup,
    updateDeviceStream,
    /** Signals CALL_ENDED to the peer over the data channel (best effort). */
    sendCallEndedSignal: (payload: { endedByType: 'patient' | 'psychologist' | 'system'; reason: string }) =>
      signalChannelRef.current?.sendCallEnded({ ...payload, sessionId }) ?? false,
  };
};

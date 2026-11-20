import { useCallback, useEffect, useRef, useState, type ReactNode } from 'react';
import { useNavigate } from 'react-router-dom';
import {
  AlertTriangle,
  BellRing,
  Camera,
  CameraOff,
  Clock,
  FileText,
  Loader2,
  Mic,
  MicOff,
  Phone,
  PhoneOff,
  RefreshCw,
  Settings,
  ShieldCheck,
  UserRound,
  WifiOff,
  X,
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import NoPrescriptionNotice from '@/components/calls/NoPrescriptionNotice';
import { TooltipProvider } from '@/components/ui/tooltip';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { getSessionUser } from '@/lib/currentUser';
import { useToast } from '@/hooks/use-toast';
import { useWebRTC } from '@/hooks/useWebRTC';
import { useCallPresence } from '@/hooks/useCallPresence';
import { useParticipantHeartbeat } from '@/hooks/useParticipantHeartbeat';
import { useRemoteAbsence } from '@/hooks/useRemoteAbsence';
import { useSharedCallTimer } from '@/hooks/useSharedCallTimer';
import { useCallTranscription } from '@/hooks/useCallTranscription';
import { dismissAppointmentFeedback } from '@/hooks/usePendingCallFeedback';
import { getConnectionBannerState, isRemoteDropInvoluntary } from '@/lib/callBanner';
import { getTerminationMessage } from '@/lib/callTermination';
import { consultationEndedMessage } from '@/lib/consultationWindow';
import { CONSULTATION_ABSENCE_THRESHOLD_SECONDS, SOS_ABSENCE_THRESHOLD_SECONDS } from '@/lib/remoteAbsence';
import { END_REASONS, UNRESOLVED_CRISIS_OPTIONS, completionReasonFor, unresolvedCrisisLabel } from '@/lib/emergencyEndReasons';
import { endEmergencySession } from '@/lib/endEmergencySession';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import { SessionValidationError, validateWebRTCSession } from '@/utils/session-validation';
import RemoteAbsentPanel from '@/components/calls/RemoteAbsentPanel';
import { ControlButton, ParticipantTile, QualityBadge } from '@/components/calls/CallParts';
import PostCrisisPlanDialog from '@/components/calls/PostCrisisPlanDialog';
import { FeedbackModal } from '@/components/sos/FeedbackModal';
import { VideoCallSettingsModal } from '@/components/sos/VideoCallSettingsModal';
import PatientContextPanel from '@/components/sos/PatientContextPanel';
import { PatientSessionHistory } from '@/components/psychologist/PatientSessionHistory';

export type CallKind = 'sos' | 'consultation';

export interface EndCallInfo {
  reason: string;
  endedByType: 'psychologist' | 'patient';
  crisisResolved?: boolean | null;
  notes?: string | null;
}

export interface LeaveResult {
  /** SOS: como o atendimento terminou (a página registra e volta ao início). */
  endInfo?: EndCallInfo;
  /** Consulta: nada a concluir (marcada como interrompida ou a sala não abriu). */
  skipComplete?: boolean;
}

interface VideoCallRoomProps {
  kind: CallKind;
  sessionId: string;
  userType: 'patient' | 'psychologist';
  /** Duração da chamada: SOS 25 min, consulta 50 min (a única diferença visível). */
  timeLimitSeconds: number;
  /** Nome do outro participante, se a página já souber (ex.: psicólogo da consulta). */
  remoteNameHint?: string | null;
  /** SOS: pedido de emergência por trás da sala. */
  requestId?: string | null;
  /** Consulta: a consulta por trás da sala. */
  appointment?: { id: string; scheduledAt: string; patientId?: string | null };
  onLeave: (result: LeaveResult) => void;
}

/** Quanto tempo sem áudio/vídeo (com os dois na sala) até oferecer saídas. */
const MEDIA_FAILURE_THRESHOLD_SECONDS = 45;

/**
 * Psicólogo caiu e não voltou neste tempo (com a chamada já conectada e o
 * paciente na sala): perde a chamada, ela não entra no repasse e o paciente
 * recebe o SOS ou a consulta de volta. O banco confere e encerra
 * (`claim_psychologist_dropped`); a rotina de minuto em minuto também.
 */
const PSYCHOLOGIST_DROP_FORFEIT_SECONDS = 180;
const PSYCHOLOGIST_DROPPED_REASON = END_REASONS.PSYCHOLOGIST_DROPPED;

const formatClock = (seconds: number) => {
  const s = Math.max(0, Math.round(seconds));
  return `${String(Math.floor(s / 60)).padStart(2, '0')}:${String(s % 60).padStart(2, '0')}`;
};

const isShortcut = (event: KeyboardEvent, key: string) =>
  (event.ctrlKey || event.metaKey) && !event.shiftKey && !event.altKey && event.key.toLowerCase() === key;

/**
 * Sala de vídeo única do app, para o SOS e para a consulta agendada (mesmo
 * layout e mesmo funcionamento, no padrão do Google Meet). O que muda entre os
 * dois fica nos pontos marcados com `kind`: a duração, quem encerra como e as
 * saídas oferecidas quando o outro lado some ou a chamada não conecta.
 */
const VideoCallRoom = ({
  kind,
  sessionId,
  userType,
  timeLimitSeconds,
  remoteNameHint,
  requestId: requestIdProp,
  appointment,
  onLeave,
}: VideoCallRoomProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const isSos = kind === 'sos';
  const homeRoute = userType === 'psychologist' ? (isSos ? '/psychologist-dashboard' : '/psicologo/consultas') : isSos ? '/home' : '/appointments';

  const [phase, setPhase] = useState<'call' | 'ended' | 'redirected' | 'forfeited'>('call');
  const [endedMessage, setEndedMessage] = useState<string | null>(null);
  const [sessionProblem, setSessionProblem] = useState<string | null>(null);
  const [initTimedOut, setInitTimedOut] = useState(false);

  const [remoteMuted, setRemoteMuted] = useState(false);
  const [remoteCameraOff, setRemoteCameraOff] = useState(false);
  const lastMediaSignalAtRef = useRef(0);

  const [localName, setLocalName] = useState('');
  const [remoteName, setRemoteName] = useState<string | null>(remoteNameHint ?? null);
  const [requestId, setRequestId] = useState<string | null>(requestIdProp ?? null);

  const [showSettings, setShowSettings] = useState(false);
  const [showContext, setShowContext] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showCrisisStep, setShowCrisisStep] = useState(false);
  const [crisisResolved, setCrisisResolved] = useState<'sim' | 'nao'>('sim');
  const [unresolvedReason, setUnresolvedReason] = useState<string>(UNRESOLVED_CRISIS_OPTIONS[0].value);
  const [endNotes, setEndNotes] = useState('');

  const [absenceSnoozedUntil, setAbsenceSnoozedUntil] = useState(0);
  const [mediaSnoozedUntil, setMediaSnoozedUntil] = useState(0);
  const [busyAction, setBusyAction] = useState<'other' | 'interrupt' | 'notify' | null>(null);
  const [notified, setNotified] = useState(false);
  const [nowTick, setNowTick] = useState(() => Date.now());

  const endedLocallyRef = useRef(false);
  const skipCompleteRef = useRef(false);
  const endInfoRef = useRef<EndCallInfo>({ reason: END_REASONS.OTHER, endedByType: userType });

  const {
    localStream,
    remoteStream,
    peerConnection,
    isConnected,
    error,
    session,
    callEndedBy,
    isReconnecting,
    reconnectAttempt,
    isNetworkOffline,
    notConnectedSince,
    networkQuality,
    forceReconnect,
    toggleAudio,
    toggleVideo,
    isMuted,
    isCameraOff,
    mediaChoiceReady,
    remoteMediaState,
    sendMediaState,
    sendCallEndedSignal,
    cleanup,
    updateDeviceStream,
  } = useWebRTC({ sessionId, userType });

  const inCall = phase === 'call';

  const { remotePresent, remoteLeftAt } = useCallPresence({ sessionId, userType, enabled: inCall });
  // Com o consentimento do paciente, cada lado transcreve a própria voz.
  const { transcriptionEnabled } = useCallTranscription({ sessionId, localStream, active: inCall && isConnected });
  useParticipantHeartbeat({ sessionId, userType, enabled: inCall });

  const absenceSeconds = useRemoteAbsence({
    remotePresent,
    remoteLeftAt,
    enabled: inCall,
    notBefore: appointment ? new Date(appointment.scheduledAt).getTime() : undefined,
  });
  const absenceThreshold = isSos ? SOS_ABSENCE_THRESHOLD_SECONDS : CONSULTATION_ABSENCE_THRESHOLD_SECONDS;
  const showAbsencePanel = inCall && absenceSeconds >= absenceThreshold && nowTick >= absenceSnoozedUntil && !isNetworkOffline;

  useEffect(() => {
    const timer = setInterval(() => setNowTick(Date.now()), 1000);
    return () => clearInterval(timer);
  }, []);
  const mediaDownSeconds = notConnectedSince ? Math.max(0, Math.floor((nowTick - notConnectedSince) / 1000)) : 0;
  const showMediaFailurePanel =
    inCall &&
    remotePresent &&
    !showAbsencePanel &&
    !isNetworkOffline &&
    mediaDownSeconds >= MEDIA_FAILURE_THRESHOLD_SECONDS &&
    nowTick >= mediaSnoozedUntil;

  const banner = getConnectionBannerState({
    isReconnecting,
    isNetworkOffline,
    remoteDroppedInvoluntarily: isRemoteDropInvoluntary(remotePresent, remoteLeftAt, !inCall),
    callTerminated: !inCall,
    reconnectAttempt,
    userType,
  });

  // ---------------------------------------------------------------- dados

  // A sala existe e é desta pessoa? (o banco garante; aqui é para explicar).
  useEffect(() => {
    let cancelled = false;
    validateWebRTCSession(sessionId).catch((err) => {
      if (cancelled) return;
      const message =
        err instanceof SessionValidationError && err.code !== 'DATABASE_ERROR'
          ? err.message
          : 'Não foi possível abrir a sala desta chamada.';
      setSessionProblem(message);
    });
    return () => {
      cancelled = true;
    };
  }, [sessionId]);

  // Nunca deixa a pessoa presa em "preparando a câmera".
  useEffect(() => {
    if (localStream || error) {
      setInitTimedOut(false);
      return;
    }
    const timer = setTimeout(() => setInitTimedOut(true), 45000);
    return () => clearTimeout(timer);
  }, [localStream, error]);

  // Meu nome (anunciado ao outro lado junto com câmera/microfone).
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data } = await getSessionUser();
      const uid = data.user?.id;
      if (!uid) return;
      const { data: psychologist } = await supabase.from('psychologists').select('full_name').eq('user_id', uid).maybeSingle();
      let name = psychologist?.full_name ?? '';
      if (!name) {
        const { data: profile } = await supabase.from('profiles').select('full_name').eq('user_id', uid).maybeSingle();
        name = profile?.full_name ?? '';
      }
      if (!cancelled) setLocalName(name);
    })();
    return () => {
      cancelled = true;
    };
  }, []);

  // SOS: pedido por trás da sala, nome do outro lado e se já foi encaminhado.
  useEffect(() => {
    if (!isSos) return;
    let cancelled = false;
    (async () => {
      let id = requestIdProp ?? null;
      if (!id) {
        const { data } = await supabase.from('webrtc_sessions').select('emergency_request_id').eq('id', sessionId).maybeSingle();
        id = data?.emergency_request_id ?? null;
      }
      if (!id || cancelled) return;
      setRequestId(id);
      const { data: request } = await supabase
        .from('emergency_requests')
        .select('patient_details, accepted_by, end_reason')
        .eq('id', id)
        .maybeSingle();
      if (!request || cancelled) return;
      if (request.end_reason === 'psychologist_unavailable') {
        setPhase('redirected');
        return;
      }
      if (request.end_reason === PSYCHOLOGIST_DROPPED_REASON) {
        setPhase('forfeited');
        return;
      }
      if (userType === 'patient' && request.accepted_by) {
        const { data: psychologist } = await supabase
          .from('psychologists')
          .select('full_name')
          .eq('user_id', request.accepted_by)
          .maybeSingle();
        if (!cancelled && psychologist?.full_name) setRemoteName((prev) => prev ?? psychologist.full_name);
      } else if (userType === 'psychologist') {
        const details = request.patient_details as { full_name?: string } | null;
        if (!cancelled && details?.full_name) setRemoteName((prev) => prev ?? details.full_name ?? null);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [isSos, requestIdProp, sessionId, userType]);

  // Câmera/microfone do outro lado: o canal direto é o caminho rápido; a sala
  // no banco vale quando ainda não chegou nada por ele (entrada, recarregar).
  useEffect(() => {
    if (!remoteMediaState) return;
    lastMediaSignalAtRef.current = Date.now();
    setRemoteMuted(remoteMediaState.muted);
    setRemoteCameraOff(remoteMediaState.cameraOff);
    if (remoteMediaState.displayName) setRemoteName(remoteMediaState.displayName);
  }, [remoteMediaState]);

  useEffect(() => {
    if (!session) return;
    const row = session as unknown as Record<string, unknown>;
    if (isSos && row.end_reason === 'psychologist_unavailable') {
      setPhase('redirected');
      cleanup();
      return;
    }
    if (row.end_reason === PSYCHOLOGIST_DROPPED_REASON) {
      endedLocallyRef.current = true;
      setPhase('forfeited');
      cleanup();
      return;
    }
    if (Date.now() - lastMediaSignalAtRef.current < 5000) return;
    const remoteType = userType === 'patient' ? 'psychologist' : 'patient';
    if (typeof row[`${remoteType}_muted`] === 'boolean') setRemoteMuted(row[`${remoteType}_muted`] as boolean);
    if (typeof row[`${remoteType}_camera_off`] === 'boolean') setRemoteCameraOff(row[`${remoteType}_camera_off`] as boolean);
  }, [session, isSos, userType, cleanup]);

  // Anuncia meu estado (e reanuncia a cada conexão). Só depois de reaplicar a
  // escolha guardada: senão, ao recarregar, o outro lado via "ligado" à toa.
  useEffect(() => {
    if (!mediaChoiceReady) return;
    sendMediaState({ userType, cameraOff: isCameraOff, muted: isMuted, displayName: localName || null, avatarUrl: null });
  }, [sendMediaState, userType, isCameraOff, isMuted, localName, isConnected, mediaChoiceReady]);

  // O outro lado encerrou (ou o sistema: confere se foi a queda do psicólogo).
  useEffect(() => {
    if (!callEndedBy || endedLocallyRef.current || phase !== 'call') return;
    let cancelled = false;
    (async () => {
      if (callEndedBy.userType === 'system') {
        const { data } = await supabase.from('webrtc_sessions').select('end_reason').eq('id', sessionId).maybeSingle();
        if (cancelled) return;
        if (data?.end_reason === PSYCHOLOGIST_DROPPED_REASON) {
          endedLocallyRef.current = true;
          cleanup();
          setPhase('forfeited');
          return;
        }
      }
      setEndedMessage(isSos ? getTerminationMessage(callEndedBy.userType) : consultationEndedMessage(callEndedBy.userType));
      cleanup();
      setPhase('ended');
    })();
    return () => {
      cancelled = true;
    };
  }, [callEndedBy, phase, isSos, cleanup, sessionId]);

  // Psicólogo caiu e não voltou em 3 minutos (com a chamada já conectada).
  const everConnectedRef = useRef(false);
  if (isConnected) everConnectedRef.current = true;
  const psychologistDropSeconds =
    userType === 'patient' && inCall && everConnectedRef.current && !remotePresent && remoteLeftAt
      ? Math.max(0, Math.floor((nowTick - remoteLeftAt) / 1000))
      : 0;
  const psychologistDropDue = psychologistDropSeconds >= PSYCHOLOGIST_DROP_FORFEIT_SECONDS;
  const dropCountdownText = (refund: string) =>
    userType === 'patient' && everConnectedRef.current && remoteLeftAt
      ? psychologistDropDue
        ? `O psicólogo não voltou em 3 minutos: encerrando a chamada e ${refund}. `
        : `Se ele não voltar em ${formatClock(PSYCHOLOGIST_DROP_FORFEIT_SECONDS - psychologistDropSeconds)}, a chamada é encerrada e ${refund}. `
      : '';

  // Paciente: passados os 3 minutos, pede ao banco para encerrar e devolver
  // (de novo a cada 15 s: o banco confere pelo último sinal do psicólogo).
  useEffect(() => {
    if (!psychologistDropDue || !inCall) return;
    let cancelled = false;
    const claim = async () => {
      const { data, error: rpcError } = await supabase.rpc('claim_psychologist_dropped', { p_session_id: sessionId });
      if (cancelled || rpcError) return;
      if ((data as { forfeited?: boolean } | null)?.forfeited) {
        endedLocallyRef.current = true;
        cleanup();
        setPhase('forfeited');
      }
    };
    void claim();
    const timer = setInterval(claim, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [psychologistDropDue, inCall, sessionId, cleanup]);

  // Psicólogo: ao voltar a conexão, confere se a chamada já foi perdida (aí
  // some o "reconectando" e aparece o aviso de que ela foi encerrada).
  useEffect(() => {
    if (userType !== 'psychologist' || !inCall) return;
    let cancelled = false;
    const check = async () => {
      if (typeof navigator !== 'undefined' && navigator.onLine === false) return;
      const { data } = await supabase.from('webrtc_sessions').select('end_reason').eq('id', sessionId).maybeSingle();
      if (cancelled || data?.end_reason !== PSYCHOLOGIST_DROPPED_REASON) return;
      endedLocallyRef.current = true;
      cleanup();
      setPhase('forfeited');
    };
    void check();
    const timer = setInterval(check, 15_000);
    return () => {
      cancelled = true;
      clearInterval(timer);
    };
  }, [userType, inCall, sessionId, cleanup, isNetworkOffline, isReconnecting]);

  // ------------------------------------------------------------- controles

  const persistMediaState = useCallback(
    async (payload: Record<string, boolean>) => {
      const { error: writeError } = await supabase
        .from('webrtc_sessions')
        .update({ ...payload, updated_at: new Date().toISOString() } as never)
        .eq('id', sessionId);
      if (writeError) console.error('Error persisting media state:', writeError);
    },
    [sessionId],
  );

  // A sala no banco acompanha a escolha (vale para quem entra ou recarrega).
  useEffect(() => {
    if (!mediaChoiceReady) return;
    void persistMediaState({ [`${userType}_muted`]: isMuted, [`${userType}_camera_off`]: isCameraOff });
  }, [mediaChoiceReady, isMuted, isCameraOff, userType, persistMediaState]);

  const toggleMic = useCallback(() => {
    toggleAudio();
    lastMediaSignalAtRef.current = Date.now();
  }, [toggleAudio]);

  const toggleCamera = useCallback(() => {
    void toggleVideo();
    lastMediaSignalAtRef.current = Date.now();
  }, [toggleVideo]);

  // Atalhos do Meet: Ctrl/Cmd+D microfone, Ctrl/Cmd+E câmera.
  useEffect(() => {
    if (!inCall) return;
    const onKey = (event: KeyboardEvent) => {
      if (isShortcut(event, 'd')) {
        event.preventDefault();
        toggleMic();
      } else if (isShortcut(event, 'e')) {
        event.preventDefault();
        toggleCamera();
      }
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [inCall, toggleMic, toggleCamera]);

  // ----------------------------------------------------------- encerrar

  const endCall = useCallback(
    async (partial: Partial<EndCallInfo> = {}) => {
      if (endedLocallyRef.current) return;
      endedLocallyRef.current = true;
      setShowEndConfirm(false);
      setShowCrisisStep(false);
      const info: EndCallInfo = {
        reason: partial.reason ?? (isSos ? completionReasonFor(userType) : 'ended_by_participant'),
        endedByType: userType,
        crisisResolved: partial.crisisResolved ?? null,
        notes: partial.notes ?? null,
      };
      endInfoRef.current = info;
      const { data: auth } = await getSessionUser();

      if (isSos) {
        await endEmergencySession({
          requestId,
          sessionId,
          userId: auth.user?.id ?? null,
          endedBy: userType,
          reason: info.reason,
          crisisResolved: info.crisisResolved,
          notes: info.notes,
          sendCallEndedSignal,
          stopMedia: cleanup,
          closeWebRTC: cleanup,
        });
      } else {
        try {
          sendCallEndedSignal({ endedByType: userType, reason: info.reason });
          await supabase
            .from('webrtc_sessions')
            .update({
              status: 'completed',
              ended_by: auth.user?.id,
              ended_by_type: userType,
              ended_at: new Date().toISOString(),
            })
            .eq('id', sessionId);
        } catch (err) {
          console.error('Error ending call:', err);
        } finally {
          cleanup();
        }
      }
      setPhase('ended');
    },
    [isSos, userType, requestId, sessionId, sendCallEndedSignal, cleanup],
  );

  const endCallRef = useRef(endCall);
  endCallRef.current = endCall;

  const confirmEnd = () => {
    setShowEndConfirm(false);
    if (isSos && userType === 'psychologist') {
      setShowCrisisStep(true);
      return;
    }
    void endCall({ reason: isSos ? END_REASONS.COMPLETED_BY_PATIENT : undefined });
  };

  const confirmCrisisOutcome = (closedWithoutAnswer = false) => {
    const resolved = closedWithoutAnswer || crisisResolved === 'sim';
    const notes = closedWithoutAnswer
      ? null
      : [resolved ? null : `Motivo: ${unresolvedCrisisLabel(unresolvedReason)}`, endNotes.trim() || null].filter(Boolean).join(' — ');
    void endCall({ reason: END_REASONS.COMPLETED_BY_PSYCHOLOGIST, crisisResolved: resolved, notes: notes || null });
  };

  const leave = () => {
    if (!isSos && userType === 'patient') dismissAppointmentFeedback(sessionId);
    onLeave({ endInfo: endInfoRef.current, skipComplete: skipCompleteRef.current });
  };

  // ------------------------------------------------------------- tempo

  // Uma fonte só para os dois lados: o tempo que o banco soma com os dois
  // conectados. Qualquer mudança na sala (aviso de mídia, conexão, presença)
  // faz o cronômetro conferir o banco na hora.
  const sessionRow = session as unknown as Record<string, unknown> | null;
  const { timeLeft, isPaused: isTimerPaused, started: timerStarted } = useSharedCallTimer({
    sessionId,
    timeLimit: timeLimitSeconds,
    syncKey: [
      sessionRow?.media_tick_at ?? '',
      sessionRow?.media_seconds ?? '',
      sessionRow?.status ?? '',
      isConnected,
      remotePresent,
    ].join('|'),
    onExpire: useCallback(() => {
      if (isSos) {
        void endCallRef.current({ reason: END_REASONS.TIME_LIMIT });
      } else {
        toast({ title: 'Tempo da consulta esgotado', description: 'Vocês podem se despedir e encerrar quando quiserem.' });
      }
    }, [isSos, toast]),
  });

  const warnedRef = useRef<{ five: boolean; one: boolean }>({ five: false, one: false });
  useEffect(() => {
    if (!inCall || timeLeft <= 0) return;
    if (timeLeft <= 300 && !warnedRef.current.five) {
      warnedRef.current.five = true;
      toast({ title: 'Faltam 5 minutos', description: isSos ? 'A chamada termina sozinha no fim do tempo.' : 'A consulta está chegando ao fim.' });
    }
    if (timeLeft <= 60 && !warnedRef.current.one) {
      warnedRef.current.one = true;
      toast({ title: 'Falta 1 minuto', description: isSos ? 'A chamada termina em 1 minuto.' : 'A consulta está terminando.' });
    }
  }, [timeLeft, inCall, isSos, toast]);

  // ------------------------------------------------------- saídas extras

  const retryMedia = () => {
    forceReconnect();
    setMediaSnoozedUntil(Date.now() + 30 * 1000);
  };

  const requestOtherPsychologist = async () => {
    if (!requestId) return;
    setBusyAction('other');
    try {
      const { error: rpcError } = await supabase.rpc('sos_request_other_psychologist', { p_request_id: requestId });
      if (rpcError) throw rpcError;
      endedLocallyRef.current = true;
      cleanup();
      navigate('/sos', { replace: true });
    } catch (err) {
      toast({
        title: 'Não foi possível chamar outro psicólogo agora',
        description: getFriendlyErrorMessage(err, 'Tente de novo em instantes.'),
        variant: 'destructive',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const markInterrupted = async () => {
    if (!appointment) return;
    setBusyAction('interrupt');
    try {
      const { error: rpcError } = await supabase.rpc('report_consultation_problem', {
        p_appointment_id: appointment.id,
        p_details: 'A chamada não conectou',
      });
      if (rpcError) throw rpcError;
      skipCompleteRef.current = true;
      toast({
        title: 'Consulta marcada como interrompida',
        description: 'A consulta do mês voltou para o paciente, que foi avisado para remarcar.',
      });
      await endCall();
    } catch (err) {
      toast({
        title: 'Não foi possível marcar agora',
        description: getFriendlyErrorMessage(err, 'Tente de novo em instantes.'),
        variant: 'destructive',
      });
    } finally {
      setBusyAction(null);
    }
  };

  const notifyRemote = async () => {
    if (!appointment) return;
    setBusyAction('notify');
    try {
      const { error: rpcError } = await supabase.rpc('notify_consultation_waiting', { p_appointment_id: appointment.id });
      if (rpcError) throw rpcError;
      setNotified(true);
      toast({
        title: userType === 'patient' ? 'Avisamos o psicólogo' : 'Avisamos o paciente',
        description: 'Ele recebe uma notificação no celular para entrar na sala.',
      });
    } catch (err) {
      toast({
        title: 'Não foi possível avisar agora',
        description: getFriendlyErrorMessage(err, 'Tente de novo em instantes.'),
        variant: 'destructive',
      });
    } finally {
      setBusyAction(null);
    }
  };

  // --------------------------------------------------------------- telas

  const remoteRole = userType === 'patient' ? 'O psicólogo' : 'O paciente';
  const remoteLabel = remoteName || (userType === 'patient' ? 'Psicólogo' : 'Paciente');

  if (phase === 'redirected') {
    return (
      <CenteredMessage
        testId="sos-redirected"
        icon={userType === 'patient' ? Loader2 : UserRound}
        spinning={userType === 'patient'}
        title={userType === 'patient' ? 'Chamando outro psicólogo...' : 'Atendimento encaminhado'}
        text={
          userType === 'patient'
            ? 'Seu pedido voltou para a fila. Você não gasta outro SOS.'
            : 'A conexão com você ficou fora por muito tempo e o paciente foi encaminhado para outro psicólogo. Este atendimento não conta no repasse.'
        }
        action={
          userType === 'psychologist' ? (
            <Button className="w-full" onClick={() => navigate('/psychologist-dashboard', { replace: true })}>
              Voltar ao painel
            </Button>
          ) : null
        }
      />
    );
  }

  if (phase === 'forfeited') {
    const patientRoute = isSos ? '/sos' : '/appointments';
    return (
      <CenteredMessage
        testId="call-forfeited"
        icon={PhoneOff}
        title={
          userType === 'patient'
            ? isSos
              ? 'Seu SOS foi devolvido'
              : 'Sua consulta foi devolvida'
            : isSos
              ? 'Você perdeu este atendimento'
              : 'Você perdeu esta consulta'
        }
        text={
          userType === 'patient'
            ? isSos
              ? 'O psicólogo perdeu a conexão e não voltou em 3 minutos. O atendimento foi encerrado e o SOS voltou para você: você pode pedir ajuda de novo agora. Se precisar de ajuda imediata, ligue para o CVV (188) ou o SAMU (192).'
              : 'O psicólogo perdeu a conexão e não voltou em 3 minutos. A consulta foi encerrada e voltou para você: você pode agendar outro horário.'
            : `Sua conexão ficou fora por mais de 3 minutos e ${isSos ? 'o atendimento' : 'a consulta'} foi encerrad${isSos ? 'o' : 'a'}. Não entra no seu repasse e foi devolvid${isSos ? 'o' : 'a'} ao paciente.`
        }
        action={
          <div className="flex w-full flex-col gap-2">
            {userType === 'patient' ? (
              <>
                <Button className="w-full" onClick={() => navigate(patientRoute, { replace: true })}>
                  {isSos ? 'Pedir ajuda de novo' : 'Agendar outro horário'}
                </Button>
                {isSos && (
                  <Button variant="outline" className="w-full" asChild>
                    <a href="tel:188">
                      <Phone className="h-4 w-4" /> Ligar para o CVV (188)
                    </a>
                  </Button>
                )}
              </>
            ) : (
              <Button className="w-full" onClick={() => navigate(homeRoute, { replace: true })}>
                Voltar ao painel
              </Button>
            )}
          </div>
        }
      />
    );
  }

  if (phase === 'ended') {
    return (
      <div className="min-h-screen bg-background">
        <CenteredMessage
          testId="call-ended"
          icon={PhoneOff}
          title={isSos ? 'Atendimento encerrado' : 'Consulta encerrada'}
          text={endedMessage ?? (isSos ? 'Obrigado por usar o SOS.' : 'Obrigado pela consulta.')}
        />
        <FeedbackModal
          isOpen
          required={isSos}
          onClose={leave}
          onRedirect={leave}
          userType={userType}
          sessionId={sessionId}
          partnerName={remoteName ?? undefined}
        />
      </div>
    );
  }

  const blockingProblem = sessionProblem ?? (error && !localStream ? error : null) ?? (initTimedOut ? 'Verifique se o navegador tem permissão para usar a câmera e o microfone e feche outros apps que possam estar usando esses dispositivos.' : null);
  if (blockingProblem) {
    return (
      <CenteredMessage
        testId="call-error"
        icon={AlertTriangle}
        title={sessionProblem ? 'Não foi possível abrir a sala' : 'Não conseguimos iniciar a chamada'}
        text={blockingProblem}
        action={
          <div className="flex w-full flex-col gap-2">
            <Button className="w-full" onClick={() => window.location.reload()}>
              <RefreshCw className="h-4 w-4" /> Tentar de novo
            </Button>
            <Button
              variant="outline"
              className="w-full"
              onClick={() => {
                cleanup();
                if (isSos) navigate(homeRoute);
                else onLeave({ skipComplete: true });
              }}
            >
              Voltar
            </Button>
          </div>
        }
      />
    );
  }

  const waitingText = isReconnecting
    ? 'Reconectando...'
    : !remotePresent && !remoteLeftAt
      ? `Aguardando ${remoteRole.toLowerCase()} entrar na sala...`
      : !remotePresent
        ? `${remoteRole} saiu da sala. Aguardando voltar...`
        : 'Conectando...';

  const canShowContext = userType === 'psychologist' && (isSos ? Boolean(requestId) : Boolean(appointment?.patientId));
  // Plano pós-crise: só o psicólogo, no SOS e na consulta.
  const planSourceId = userType === 'psychologist' ? (isSos ? requestId : appointment?.id ?? null) : null;

  return (
    <TooltipProvider delayDuration={300}>
      <div className="fixed inset-0 z-50 flex flex-col bg-zinc-950 text-white" data-testid="video-call-room" data-kind={kind}>
        <main className="flex min-h-0 flex-1 flex-col gap-3 p-3 md:flex-row md:p-4">
          {showContext && canShowContext && (
            <aside
              aria-label="Contexto do paciente"
              className="order-2 flex min-h-0 flex-1 flex-col overflow-hidden rounded-2xl border border-border bg-card text-foreground md:order-1 md:w-[380px] md:flex-none lg:w-[420px]"
            >
              <header className="flex items-center justify-between gap-2 border-b border-border px-4 py-3">
                <div className="flex items-center gap-2">
                  <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
                    <UserRound className="h-4 w-4" />
                  </span>
                  <div>
                    <h2 className="text-sm font-semibold">Contexto do paciente</h2>
                    <p className="text-xs text-muted-foreground">{isSos ? 'Triagem do SOS' : 'Consultas anteriores'}</p>
                  </div>
                </div>
                <Button variant="ghost" size="icon" className="h-9 w-9" onClick={() => setShowContext(false)} aria-label="Fechar contexto do paciente">
                  <X className="h-4 w-4" />
                </Button>
              </header>
              <div className="min-h-0 flex-1 overflow-y-auto p-4">
                {isSos ? <PatientContextPanel requestId={requestId} /> : <PatientSessionHistory patientId={appointment?.patientId ?? null} />}
              </div>
            </aside>
          )}

          <section
            className={cn(
              'relative order-1 min-h-0 md:order-2 md:flex-1',
              showContext && canShowContext ? 'h-[42%] shrink-0 md:h-auto' : 'flex-1',
            )}
          >
            <ParticipantTile
              testId="remote-tile"
              className="absolute inset-0"
              name={remoteLabel}
              stream={remoteStream}
              cameraOff={remoteCameraOff}
              muted={remoteMuted}
              placeholder={!isConnected ? (
                <span className="flex flex-col items-center gap-3">
                  <span className="inline-flex items-center gap-2">
                    <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    {waitingText}
                  </span>
                  {/* Antes de a chamada começar, o lembrete de que não há receita de remédios. */}
                  <NoPrescriptionNotice userType={userType} className="max-w-xs text-left text-zinc-300" />
                </span>
              ) : remoteCameraOff ? `${remoteLabel} desligou a câmera` : undefined}
              topRight={isConnected ? <QualityBadge quality={networkQuality} /> : null}
            />

            {/* Tempo restante */}
            <div
              data-testid="call-timer"
              className={cn(
                'absolute left-3 top-3 z-10 flex items-center gap-1.5 rounded-full px-3 py-1 text-sm font-medium tabular-nums',
                timeLeft <= 60 && !isTimerPaused ? 'bg-destructive text-white' : 'bg-zinc-900/75 text-white',
              )}
              title={
                !timerStarted
                  ? 'O tempo começa quando vocês dois estiverem conectados'
                  : isTimerPaused
                    ? 'Tempo pausado enquanto alguém está fora da chamada'
                    : 'Tempo restante'
              }
            >
              <Clock className="h-3.5 w-3.5" aria-hidden="true" />
              {timeLeft > 0 ? formatClock(timeLeft) : 'Tempo esgotado'}
              {timeLeft > 0 && isTimerPaused && (
                <span className="text-zinc-300">· {timerStarted ? 'pausado' : 'aguardando'}</span>
              )}
            </div>

            {transcriptionEnabled && (
              <div
                data-testid="transcription-indicator"
                role="status"
                className="absolute left-3 top-12 z-10 flex items-center gap-1.5 rounded-full bg-zinc-900/75 px-3 py-1 text-xs font-medium text-white"
                title="O paciente consentiu: o áudio da chamada é transcrito em texto (o áudio não fica guardado)"
              >
                <FileText className="h-3.5 w-3.5" aria-hidden="true" />
                Chamada sendo transcrita
              </div>
            )}

            {banner.visible && (
              <div data-testid="connection-banner" role="status" className="absolute left-1/2 top-14 z-20 w-[92%] max-w-md -translate-x-1/2">
                <div className="flex flex-col items-center gap-2 rounded-2xl bg-zinc-900/90 px-4 py-3 text-center shadow-lg">
                  <div className="flex items-center gap-2 text-sm font-medium">
                    {banner.variant === 'offline' ? (
                      <WifiOff className="h-4 w-4" aria-hidden="true" />
                    ) : (
                      <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                    )}
                    {banner.title}
                  </div>
                  <span className="text-xs text-zinc-300">{banner.description}</span>
                  {banner.showRetry && (
                    <Button size="sm" variant="secondary" className="h-8 text-xs" onClick={forceReconnect}>
                      <RefreshCw className="h-3 w-3" /> Tentar reconectar
                    </Button>
                  )}
                </div>
              </div>
            )}

            {/* Minha imagem: o vídeo fica sempre montado (a câmera volta na hora). */}
            <ParticipantTile
              self
              compact
              testId="self-tile"
              className={cn(
                'absolute bottom-3 right-3 z-20 aspect-[3/4] shadow-lg ring-zinc-700 sm:aspect-video md:w-56',
                showContext && canShowContext ? 'w-16 sm:w-32' : 'w-24 sm:w-44',
              )}
              name="Você"
              avatarName={localName || 'Você'}
              stream={localStream}
              cameraOff={isCameraOff}
              muted={isMuted}
            />

            {showAbsencePanel &&
              (isSos ? (
                userType === 'patient' ? (
                  <RemoteAbsentPanel
                    icon={Clock}
                    title={remoteLeftAt ? 'O psicólogo perdeu a conexão' : 'O psicólogo ainda não entrou'}
                    description={`${dropCountdownText('o SOS volta para você')}Você pode esperar mais um pouco ou chamar outro psicólogo agora, sem gastar outro SOS. Se precisar de ajuda imediata, ligue para o CVV (188) ou o SAMU (192).`}
                    actions={[
                      { label: 'Chamar outro psicólogo', icon: UserRound, variant: 'default', loading: busyAction === 'other', onClick: requestOtherPsychologist },
                      { label: 'Continuar esperando', onClick: () => setAbsenceSnoozedUntil(Date.now() + 2 * 60 * 1000) },
                      { label: 'Ligar para o CVV (188)', icon: Phone, variant: 'ghost', href: 'tel:188' },
                    ]}
                  />
                ) : (
                  <RemoteAbsentPanel
                    icon={Clock}
                    title={remoteLeftAt ? 'O paciente perdeu a conexão' : 'O paciente ainda não entrou'}
                    description="A sala continua aberta e ele pode voltar a qualquer momento. Se ele não voltar, encerre o atendimento e registre o que aconteceu."
                    actions={[
                      { label: 'Continuar aguardando', variant: 'default', onClick: () => setAbsenceSnoozedUntil(Date.now() + 3 * 60 * 1000) },
                      { label: 'Encerrar atendimento', icon: PhoneOff, onClick: () => setShowEndConfirm(true) },
                    ]}
                  />
                )
              ) : (
                <RemoteAbsentPanel
                  icon={Clock}
                  title={remoteLeftAt ? `${remoteRole} saiu da sala` : `${remoteRole} ainda não entrou`}
                  description={
                    userType === 'patient'
                      ? `${dropCountdownText('a consulta volta para você')}Você pode avisá-lo pelo celular. Se a consulta não acontecer, ela fica como não realizada e a consulta do mês volta para você automaticamente.`
                      : 'Você pode avisá-lo pelo celular. Se ele não entrar, a consulta fica como não realizada automaticamente, sem descontar do plano dele.'
                  }
                  actions={[
                    {
                      label: notified ? 'Avisar de novo' : `Avisar ${remoteRole.toLowerCase()}`,
                      icon: BellRing,
                      variant: 'default',
                      loading: busyAction === 'notify',
                      onClick: notifyRemote,
                    },
                    { label: 'Continuar esperando', onClick: () => setAbsenceSnoozedUntil(Date.now() + 3 * 60 * 1000) },
                  ]}
                />
              ))}

            {showMediaFailurePanel && (
              <RemoteAbsentPanel
                icon={WifiOff}
                title="A chamada não está conectando"
                description={
                  isSos
                    ? userType === 'patient'
                      ? 'Vocês dois estão na sala, mas o áudio e o vídeo não chegam. Tente de novo ou chame outro psicólogo agora, sem gastar outro SOS. Se precisar de ajuda imediata, ligue para o CVV (188) ou o SAMU (192).'
                      : 'Vocês dois estão na sala, mas o áudio e o vídeo não chegam. Tente de novo; se não resolver, encerre por falha de conexão e o SOS volta para o paciente.'
                    : userType === 'patient'
                      ? 'Vocês dois estão na sala, mas o áudio e o vídeo não chegam. Tente de novo. Se a chamada não voltar e vocês não conversarem pelo menos 5 minutos, a consulta do mês volta para você automaticamente.'
                      : 'Vocês dois estão na sala, mas o áudio e o vídeo não chegam. Tente de novo; se não resolver, marque como interrompida: a consulta do mês volta para o paciente, que é avisado para remarcar.'
                }
                actions={[
                  { label: 'Tentar de novo', icon: RefreshCw, variant: 'default', onClick: retryMedia },
                  ...(isSos && userType === 'patient'
                    ? [
                        { label: 'Chamar outro psicólogo', icon: UserRound, loading: busyAction === 'other', onClick: requestOtherPsychologist },
                        { label: 'Ligar para o CVV (188)', icon: Phone, variant: 'ghost' as const, href: 'tel:188' },
                      ]
                    : isSos
                      ? [
                          {
                            label: 'Encerrar por falha de conexão',
                            icon: PhoneOff,
                            onClick: () => void endCall({ reason: END_REASONS.CONNECTION_FAILURE, crisisResolved: false, notes: 'A chamada não conectou' }),
                          },
                        ]
                      : userType === 'psychologist'
                        ? [{ label: 'Marcar como interrompida', icon: PhoneOff, loading: busyAction === 'interrupt', onClick: markInterrupted }]
                        : [{ label: 'Continuar esperando', onClick: () => setMediaSnoozedUntil(Date.now() + 2 * 60 * 1000) }]),
                ]}
              />
            )}
          </section>
        </main>

        <footer className="flex shrink-0 items-center justify-between gap-3 px-4 pb-[max(1rem,env(safe-area-inset-bottom))] pt-1 md:px-6">
          <div className="hidden min-w-0 flex-1 md:block">
            <p className="truncate text-sm font-medium text-white">{remoteLabel}</p>
            <p className="text-xs text-zinc-400">
              {isSos ? 'Atendimento SOS' : 'Consulta agendada'} · {Math.round(timeLimitSeconds / 60)} min
            </p>
          </div>

          <div className="flex flex-1 items-center justify-center gap-3 md:flex-none">
            <ControlButton
              icon={isMuted ? MicOff : Mic}
              label={isMuted ? 'Ativar microfone' : 'Desativar microfone'}
              shortcut="Ctrl+D"
              off={isMuted}
              onClick={toggleMic}
            />
            <ControlButton
              icon={isCameraOff ? CameraOff : Camera}
              label={isCameraOff ? 'Ativar câmera' : 'Desativar câmera'}
              shortcut="Ctrl+E"
              off={isCameraOff}
              onClick={toggleCamera}
            />
            <ControlButton icon={Settings} label="Câmera, microfone e alto-falante" onClick={() => setShowSettings(true)} />
            {canShowContext && (
              <ControlButton
                icon={UserRound}
                label="Contexto do paciente"
                active={showContext}
                onClick={() => setShowContext((v) => !v)}
              />
            )}
            {planSourceId && (
              <ControlButton icon={ShieldCheck} label="Plano pós-crise" active={showPlan} onClick={() => setShowPlan(true)} />
            )}
            <button
              type="button"
              onClick={() => setShowEndConfirm(true)}
              aria-label={isSos ? 'Encerrar atendimento' : 'Encerrar consulta'}
              className="flex h-12 w-16 items-center justify-center rounded-full bg-destructive text-white transition-colors hover:bg-destructive/90 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-destructive focus-visible:ring-offset-2 focus-visible:ring-offset-zinc-950"
            >
              <PhoneOff className="h-5 w-5" aria-hidden="true" />
            </button>
          </div>

          <div className="hidden flex-1 md:block" />
        </footer>

        {planSourceId && (
          <PostCrisisPlanDialog
            open={showPlan}
            onOpenChange={setShowPlan}
            sourceType={isSos ? 'sos' : 'appointment'}
            sourceId={planSourceId}
          />
        )}

        <VideoCallSettingsModal
          isOpen={showSettings}
          onClose={() => setShowSettings(false)}
          localStream={localStream}
          peerConnection={peerConnection}
          onDeviceStreamUpdate={updateDeviceStream}
        />

        <AlertDialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>{isSos ? 'Encerrar o atendimento?' : 'Encerrar a consulta?'}</AlertDialogTitle>
              <AlertDialogDescription>
                A chamada termina para os dois. Se a sua conexão caiu, não é preciso encerrar: a chamada volta sozinha.
              </AlertDialogDescription>
            </AlertDialogHeader>
            {planSourceId && (
              <Button
                variant="outline"
                className="w-full"
                onClick={() => {
                  setShowEndConfirm(false);
                  setShowPlan(true);
                }}
              >
                <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                Deixar um plano pós-crise
              </Button>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel>Continuar na chamada</AlertDialogCancel>
              <AlertDialogAction onClick={confirmEnd} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
                Encerrar
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>

        {/* SOS, psicólogo: desfecho do atendimento. */}
        <AlertDialog open={showCrisisStep} onOpenChange={(open) => !open && showCrisisStep && confirmCrisisOutcome(true)}>
          <AlertDialogContent>
            <AlertDialogHeader>
              <AlertDialogTitle>A crise do paciente foi resolvida?</AlertDialogTitle>
              <AlertDialogDescription>Essa informação fica registrada no histórico do atendimento.</AlertDialogDescription>
            </AlertDialogHeader>
            <RadioGroup value={crisisResolved} onValueChange={(v) => setCrisisResolved(v as 'sim' | 'nao')} className="grid grid-cols-2 gap-2">
              {(['sim', 'nao'] as const).map((v) => (
                <div key={v} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <RadioGroupItem value={v} id={`crisis-${v}`} />
                  <Label htmlFor={`crisis-${v}`} className="cursor-pointer text-sm font-normal">
                    {v === 'sim' ? 'Sim' : 'Não'}
                  </Label>
                </div>
              ))}
            </RadioGroup>
            {crisisResolved === 'nao' && (
              <div className="space-y-2">
                <Label className="text-sm">Qual foi o motivo principal?</Label>
                <RadioGroup value={unresolvedReason} onValueChange={setUnresolvedReason} className="max-h-52 gap-2 overflow-y-auto">
                  {UNRESOLVED_CRISIS_OPTIONS.map((o) => (
                    <div key={o.value} className="flex items-center gap-3 rounded-lg border border-border p-3">
                      <RadioGroupItem value={o.value} id={`unresolved-${o.value}`} />
                      <Label htmlFor={`unresolved-${o.value}`} className="cursor-pointer text-sm font-normal">
                        {o.label}
                      </Label>
                    </div>
                  ))}
                </RadioGroup>
              </div>
            )}
            <div className="space-y-2">
              <Label htmlFor="end-notes" className="text-sm">
                Observações (opcional)
              </Label>
              <Textarea
                id="end-notes"
                value={endNotes}
                onChange={(e) => setEndNotes(e.target.value)}
                placeholder="Registre observações relevantes do atendimento"
                rows={3}
              />
            </div>
            {planSourceId && (
              <Button variant="outline" className="w-full" onClick={() => setShowPlan(true)}>
                <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
                Deixar um plano pós-crise
              </Button>
            )}
            <AlertDialogFooter>
              <AlertDialogAction onClick={() => confirmCrisisOutcome()} className="w-full sm:w-auto">
                Finalizar atendimento
              </AlertDialogAction>
            </AlertDialogFooter>
          </AlertDialogContent>
        </AlertDialog>
      </div>
    </TooltipProvider>
  );
};

function CenteredMessage({
  icon: Icon,
  title,
  text,
  action,
  spinning,
  testId,
}: {
  icon: typeof PhoneOff;
  title: string;
  text: string;
  action?: ReactNode;
  spinning?: boolean;
  testId?: string;
}) {
  return (
    <div className="flex min-h-screen items-center justify-center bg-background p-6" data-testid={testId}>
      <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6 text-center">
        <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
          <Icon className={cn('h-6 w-6', spinning && 'animate-spin motion-reduce:animate-none')} />
        </span>
        <div className="space-y-1.5">
          <h2 className="text-lg font-semibold text-foreground">{title}</h2>
          <p className="text-sm text-muted-foreground">{text}</p>
        </div>
        {action}
      </div>
    </div>
  );
}

export default VideoCallRoom;

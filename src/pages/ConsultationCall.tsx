import { useCallback, useEffect, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { AlertTriangle, FileText, Loader2, RefreshCw } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { useAppointmentVideoCall } from '@/hooks/useAppointmentVideoCall';
import { useAuth } from '@/contexts/AuthContext';
import { Button } from '@/components/ui/button';
import VideoCallRoom from '@/components/calls/VideoCallRoom';
import RouteSkeleton from '@/components/skeletons/RouteSkeleton';
import { consultationDurationMinutes } from '@/lib/consultationWindow';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import TranscriptionConsentCheckbox from '@/components/calls/TranscriptionConsentCheckbox';
import { TRANSCRIPTION_CONSENT_VERSION } from '@/lib/callTranscription';

interface ConsultationData {
  id: string;
  scheduled_at: string;
  duration: number | null;
  patient_id: string;
  psychologistName: string;
  transcriptionConsentAt: string | null;
}

/**
 * Sala da consulta agendada. A página carrega a consulta e abre a sala
 * (`get_or_create_appointment_webrtc_session`, a mesma para os dois lados);
 * a chamada em si é a mesma sala do SOS (`VideoCallRoom`).
 *
 * Antes de entrar, o paciente consente com a gravação e transcrição da
 * consulta (uma vez por consulta, gravado em `appointments`).
 */
const ConsultationCall = () => {
  const { appointmentId } = useParams<{ appointmentId: string }>();
  const navigate = useNavigate();
  const { userType: authUserType } = useAuth();
  const userType: 'patient' | 'psychologist' = authUserType === 'psychologist' ? 'psychologist' : 'patient';
  const { endConsultation } = useAppointmentVideoCall();
  const homeRoute = userType === 'psychologist' ? '/psicologo/consultas' : '/appointments';

  const [appointment, setAppointment] = useState<ConsultationData | null>(null);
  const [loading, setLoading] = useState(true);
  const [sessionId, setSessionId] = useState<string | null>(null);
  const [roomError, setRoomError] = useState<string | null>(null);
  const [openingRoom, setOpeningRoom] = useState(false);
  const [consentChecked, setConsentChecked] = useState(false);
  const [savingConsent, setSavingConsent] = useState(false);
  const [consentError, setConsentError] = useState<string | null>(null);

  useEffect(() => {
    document.title = 'Consulta | Soliv';
  }, []);

  useEffect(() => {
    if (!appointmentId) {
      navigate(homeRoute);
      return;
    }
    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('appointments')
        .select('id, scheduled_at, duration, patient_id, transcription_consent_at, psychologists!psychologist_id(full_name)')
        .eq('id', appointmentId)
        .maybeSingle();
      if (cancelled) return;
      if (error || !data) {
        navigate(homeRoute);
        return;
      }
      const psychologist = data.psychologists as { full_name?: string } | null;
      setAppointment({
        id: data.id,
        scheduled_at: data.scheduled_at,
        duration: data.duration,
        patient_id: data.patient_id,
        psychologistName: psychologist?.full_name ?? 'Psicólogo',
        transcriptionConsentAt: (data as { transcription_consent_at?: string | null }).transcription_consent_at ?? null,
      });
      setLoading(false);
    })();
    return () => {
      cancelled = true;
    };
  }, [appointmentId, navigate, homeRoute]);

  // Os dois lados caem na mesma sala da consulta (não uma por aba).
  const openRoom = useCallback(async () => {
    if (!appointmentId) return;
    setOpeningRoom(true);
    setRoomError(null);
    try {
      const { data: roomId, error } = await supabase.rpc('get_or_create_appointment_webrtc_session', {
        p_appointment_id: appointmentId,
      });
      if (error) throw error;
      setSessionId(roomId as string);
    } catch (error) {
      setRoomError(getFriendlyErrorMessage(error, 'Verifique sua conexão e tente entrar de novo.'));
    } finally {
      setOpeningRoom(false);
    }
  }, [appointmentId]);

  // O paciente só entra depois de consentir; o psicólogo entra direto.
  const awaitingConsent = userType === 'patient' && !!appointment && !appointment.transcriptionConsentAt;

  useEffect(() => {
    if (appointment && !awaitingConsent) void openRoom();
  }, [appointment, awaitingConsent, openRoom]);

  const acceptConsent = async () => {
    if (!appointment || !consentChecked) return;
    setSavingConsent(true);
    setConsentError(null);
    try {
      const { data, error } = await supabase.rpc('give_appointment_transcription_consent', {
        p_appointment_id: appointment.id,
        p_version: TRANSCRIPTION_CONSENT_VERSION,
      });
      if (error) throw error;
      setAppointment({ ...appointment, transcriptionConsentAt: (data as string | null) ?? new Date().toISOString() });
    } catch (error) {
      setConsentError(getFriendlyErrorMessage(error, 'Não foi possível registrar o consentimento. Tente de novo.'));
    } finally {
      setSavingConsent(false);
    }
  };

  const handleLeave = async ({ skipComplete }: { skipComplete?: boolean }) => {
    // Marcada como interrompida ou a sala nem abriu: não há o que concluir.
    if (appointmentId && !skipComplete) {
      try {
        await endConsultation(appointmentId);
      } catch (error) {
        console.error('Error ending consultation:', error);
      }
    }
    navigate(homeRoute);
  };

  if (loading || !appointment) return <RouteSkeleton />;

  if (awaitingConsent) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6" data-testid="consultation-consent">
        <div className="w-full max-w-sm space-y-5 rounded-2xl border border-border bg-card p-6">
          <div className="space-y-2 text-center">
            <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
              <FileText className="h-6 w-6" />
            </span>
            <h1 className="text-lg font-semibold text-foreground">Antes de entrar na consulta</h1>
            <p className="text-sm text-muted-foreground">
              A consulta com {appointment.psychologistName} é gravada e transcrita em texto, para ficar no seu registro de atendimento.
            </p>
          </div>
          <TranscriptionConsentCheckbox
            id="consultation-transcription-consent"
            checked={consentChecked}
            onCheckedChange={setConsentChecked}
          />
          {consentError && (
            <p role="alert" className="text-center text-sm text-destructive">{consentError}</p>
          )}
          <div className="flex flex-col gap-2">
            <Button className="h-12 w-full" disabled={!consentChecked || savingConsent} onClick={() => void acceptConsent()}>
              {savingConsent ? <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" /> : null}
              Concordar e entrar
            </Button>
            <Button variant="ghost" className="w-full" onClick={() => navigate(homeRoute)}>
              Voltar
            </Button>
          </div>
        </div>
      </div>
    );
  }

  if (!sessionId) {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6" data-testid="consultation-room-error">
        <div className="w-full max-w-sm space-y-4 rounded-2xl border border-border bg-card p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
            {roomError ? <AlertTriangle className="h-6 w-6" /> : <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none" />}
          </span>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold text-foreground">{roomError ? 'Não foi possível abrir a sala' : 'Abrindo a sala...'}</h2>
            {roomError && <p className="text-sm text-muted-foreground">{roomError}</p>}
          </div>
          {roomError && (
            <div className="flex flex-col gap-2">
              <Button className="w-full" onClick={() => void openRoom()} disabled={openingRoom}>
                <RefreshCw className="h-4 w-4" /> Tentar de novo
              </Button>
              <Button variant="outline" className="w-full" onClick={() => navigate(homeRoute)}>
                Voltar
              </Button>
            </div>
          )}
        </div>
      </div>
    );
  }

  return (
    <VideoCallRoom
      kind="consultation"
      sessionId={sessionId}
      userType={userType}
      timeLimitSeconds={consultationDurationMinutes(appointment) * 60}
      remoteNameHint={userType === 'patient' ? appointment.psychologistName : null}
      appointment={{ id: appointment.id, scheduledAt: appointment.scheduled_at, patientId: appointment.patient_id }}
      onLeave={handleLeave}
    />
  );
};

export default ConsultationCall;

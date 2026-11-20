import { useCallback, useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { AlertTriangle, Check, CheckCheck, Clock, Loader2, MessageSquareText, Phone, RefreshCw, Send, ShieldCheck, UserRound } from 'lucide-react';
import { Button } from '@/components/ui/button';
import NoPrescriptionNotice from '@/components/calls/NoPrescriptionNotice';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import { Sheet, SheetContent, SheetHeader, SheetTitle } from '@/components/ui/sheet';
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
import { cn } from '@/lib/utils';
import { supabase } from '@/integrations/supabase/client';
import { getSessionUser } from '@/lib/currentUser';
import { useToast } from '@/hooks/use-toast';
import { useSosChat } from '@/hooks/useSosChat';
import {
  SOS_TEXT_MAX_LENGTH,
  isChatActive,
  isPatientUnanswered,
  isPsychologistAway,
  isSeenBy,
  secondsLeft,
} from '@/lib/sosTextChat';
import { END_REASONS, UNRESOLVED_CRISIS_OPTIONS, completionReasonFor, unresolvedCrisisLabel } from '@/lib/emergencyEndReasons';
import { endEmergencySession } from '@/lib/endEmergencySession';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import PostCrisisPlanDialog from '@/components/calls/PostCrisisPlanDialog';
import PatientContextPanel from '@/components/sos/PatientContextPanel';
import { FeedbackModal } from '@/components/sos/FeedbackModal';
import type { EndCallInfo, LeaveResult } from '@/components/calls/VideoCallRoom';

const formatClock = (seconds: number) =>
  `${String(Math.floor(seconds / 60)).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;

const formatTime = (iso: string) => new Date(iso).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' });

/**
 * SOS por mensagem: conversa em tela cheia entre o paciente e o psicólogo que
 * aceitou. Mesmas regras do SOS por vídeo (25 min, encerrar, desfecho da crise,
 * chamar outro psicólogo), com presença medida pela conversa aberta na tela.
 */
const SosTextChatRoom = ({
  requestId,
  sessionId,
  userType,
  onLeave,
}: {
  requestId: string;
  sessionId: string;
  userType: 'patient' | 'psychologist';
  onLeave: (result: LeaveResult) => void;
}) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { messages, loading, state, clockOffset, remoteTyping, send, retry, notifyTyping } = useSosChat({ requestId, userType });
  const isPsychologist = userType === 'psychologist';

  const [phase, setPhase] = useState<'chat' | 'ended' | 'redirected'>('chat');
  const [endedMessage, setEndedMessage] = useState<string | null>(null);
  const [draft, setDraft] = useState('');
  const [remoteName, setRemoteName] = useState<string | null>(null);
  const [now, setNow] = useState(() => Date.now());
  const [showEndConfirm, setShowEndConfirm] = useState(false);
  const [showCrisisStep, setShowCrisisStep] = useState(false);
  const [crisisResolved, setCrisisResolved] = useState<'sim' | 'nao'>('sim');
  const [unresolvedReason, setUnresolvedReason] = useState<string>(UNRESOLVED_CRISIS_OPTIONS[0].value);
  const [endNotes, setEndNotes] = useState('');
  const [showContext, setShowContext] = useState(false);
  const [showPlan, setShowPlan] = useState(false);
  const [callingOther, setCallingOther] = useState(false);
  const endedLocallyRef = useRef(false);
  const endInfoRef = useRef<EndCallInfo | undefined>(undefined);
  const listEndRef = useRef<HTMLDivElement | null>(null);

  const serverNow = now + clockOffset;
  const active = phase === 'chat' && (state.status === null || isChatActive(state));

  // Relógio da tela (tempo restante e "pode ter se afastado").
  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 1000);
    return () => window.clearInterval(t);
  }, []);

  // Nome de quem está do outro lado.
  useEffect(() => {
    let cancelled = false;
    (async () => {
      const { data: request } = await supabase
        .from('emergency_requests')
        .select('patient_details, accepted_by')
        .eq('id', requestId)
        .maybeSingle();
      if (!request || cancelled) return;
      if (isPsychologist) {
        const details = request.patient_details as { full_name?: string } | null;
        if (details?.full_name) setRemoteName(details.full_name);
      } else if (request.accepted_by) {
        const { data } = await supabase.from('psychologists').select('full_name').eq('user_id', request.accepted_by).maybeSingle();
        if (!cancelled && data?.full_name) setRemoteName(data.full_name);
      }
    })();
    return () => {
      cancelled = true;
    };
  }, [requestId, isPsychologist]);

  // Tela acesa durante a conversa (o celular não apaga no meio do atendimento).
  useEffect(() => {
    if (phase !== 'chat') return;
    const nav = navigator as Navigator & { wakeLock?: { request: (type: 'screen') => Promise<{ release: () => Promise<void> }> } };
    if (!nav.wakeLock) return;
    let lock: { release: () => Promise<void> } | null = null;
    let cancelled = false;
    const acquire = () => {
      if (document.visibilityState !== 'visible') return;
      nav.wakeLock!
        .request('screen')
        .then((l) => {
          if (cancelled) void l.release();
          else lock = l;
        })
        .catch(() => undefined);
    };
    acquire();
    document.addEventListener('visibilitychange', acquire);
    return () => {
      cancelled = true;
      document.removeEventListener('visibilitychange', acquire);
      if (lock) void lock.release().catch(() => undefined);
    };
  }, [phase]);

  // Fechar a aba ou recarregar no meio do atendimento: o navegador pergunta.
  useEffect(() => {
    if (phase !== 'chat') return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [phase]);

  // Mensagem nova: rola para o fim.
  useEffect(() => {
    listEndRef.current?.scrollIntoView?.({ block: 'end' });
  }, [messages.length, remoteTyping]);

  // O atendimento terminou do outro lado (ou pelo sistema).
  const sawActiveRef = useRef(false);
  useEffect(() => {
    if (isChatActive(state)) sawActiveRef.current = true;
    if (phase !== 'chat' || endedLocallyRef.current || !state.status || isChatActive(state)) return;
    // Link antigo de um atendimento que já tinha terminado: volta ao início.
    if (!sawActiveRef.current) {
      endedLocallyRef.current = true;
      toast({ title: 'Atendimento encerrado', description: 'Esta conversa do SOS já foi finalizada.' });
      navigate(isPsychologist ? '/psychologist-dashboard' : '/home', { replace: true });
      return;
    }
    if (state.endReason === 'psychologist_unavailable') {
      setPhase('redirected');
      return;
    }
    setEndedMessage(
      state.endedByType === 'system' || state.endReason === END_REASONS.TIME_LIMIT
        ? 'O tempo do atendimento terminou.'
        : state.endedByType === 'psychologist'
          ? 'O psicólogo encerrou a conversa.'
          : state.endedByType === 'patient'
            ? 'O paciente encerrou a conversa.'
            : 'A conversa foi encerrada.',
    );
    setPhase('ended');
  }, [state, phase, toast, navigate, isPsychologist]);

  const endChat = useCallback(
    async (partial: Partial<EndCallInfo> = {}) => {
      if (endedLocallyRef.current) return;
      endedLocallyRef.current = true;
      setShowEndConfirm(false);
      setShowCrisisStep(false);
      const info: EndCallInfo = {
        reason: partial.reason ?? completionReasonFor(userType),
        endedByType: userType,
        crisisResolved: partial.crisisResolved ?? null,
        notes: partial.notes ?? null,
      };
      endInfoRef.current = info;
      const { data: auth } = await getSessionUser();
      await endEmergencySession({
        requestId,
        sessionId,
        userId: auth.user?.id ?? null,
        endedBy: userType,
        reason: info.reason,
        crisisResolved: info.crisisResolved,
        notes: info.notes,
      });
      setPhase('ended');
    },
    [requestId, sessionId, userType],
  );

  // 25 minutos a partir da 1ª resposta do psicólogo.
  const left = secondsLeft(state, serverNow);
  const endChatRef = useRef(endChat);
  endChatRef.current = endChat;
  useEffect(() => {
    if (left === 0 && phase === 'chat') void endChatRef.current({ reason: END_REASONS.TIME_LIMIT });
  }, [left, phase]);
  const warnedRef = useRef({ five: false, one: false });
  useEffect(() => {
    if (left === null || phase !== 'chat') return;
    if (left <= 300 && left > 60 && !warnedRef.current.five) {
      warnedRef.current.five = true;
      toast({ title: 'Faltam 5 minutos', description: 'A conversa termina sozinha no fim do tempo.' });
    }
    if (left <= 60 && left > 0 && !warnedRef.current.one) {
      warnedRef.current.one = true;
      toast({ title: 'Falta 1 minuto', description: 'A conversa termina em 1 minuto.' });
    }
  }, [left, phase, toast]);

  const confirmEnd = () => {
    setShowEndConfirm(false);
    if (isPsychologist) {
      setShowCrisisStep(true);
      return;
    }
    void endChat({ reason: END_REASONS.COMPLETED_BY_PATIENT });
  };

  const confirmCrisisOutcome = (closedWithoutAnswer = false) => {
    const resolved = closedWithoutAnswer || crisisResolved === 'sim';
    const notes = closedWithoutAnswer
      ? null
      : [resolved ? null : `Motivo: ${unresolvedCrisisLabel(unresolvedReason)}`, endNotes.trim() || null].filter(Boolean).join(' — ');
    void endChat({ reason: END_REASONS.COMPLETED_BY_PSYCHOLOGIST, crisisResolved: resolved, notes: notes || null });
  };

  const requestOtherPsychologist = async () => {
    setCallingOther(true);
    try {
      const { error } = await supabase.rpc('sos_request_other_psychologist', { p_request_id: requestId });
      if (error) throw error;
      endedLocallyRef.current = true;
      navigate('/sos', { replace: true });
    } catch (err) {
      toast({
        title: 'Não foi possível chamar outro psicólogo agora',
        description: getFriendlyErrorMessage(err, 'Tente de novo em instantes.'),
        variant: 'destructive',
      });
    } finally {
      setCallingOther(false);
    }
  };

  const submit = async () => {
    const text = draft.trim();
    if (!text || !active) return;
    setDraft('');
    const ok = await send(text);
    if (!ok) {
      toast({ title: 'A mensagem não foi enviada', description: 'Toque em "Tentar de novo" na mensagem.', variant: 'destructive' });
    }
  };

  const leave = () => onLeave({ endInfo: endInfoRef.current });

  // ------------------------------------------------------------------ telas
  if (phase === 'redirected') {
    return (
      <div className="flex min-h-screen items-center justify-center bg-background p-6" data-testid="sos-redirected">
        <div className="w-full max-w-sm space-y-4 rounded-2xl border bg-card p-6 text-center">
          <span className="mx-auto flex h-12 w-12 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
            {isPsychologist ? <UserRound className="h-6 w-6" /> : <Loader2 className="h-6 w-6 animate-spin motion-reduce:animate-none" />}
          </span>
          <h2 className="text-lg font-semibold text-foreground">
            {isPsychologist ? 'Atendimento encaminhado' : 'Chamando outro psicólogo...'}
          </h2>
          <p className="text-sm text-muted-foreground">
            {isPsychologist
              ? 'O paciente ficou sem resposta na conversa e foi encaminhado para outro psicólogo. Este atendimento não conta no repasse.'
              : 'Seu pedido voltou para a fila. Você não gasta outro SOS.'}
          </p>
          {isPsychologist && (
            <Button className="w-full" onClick={() => navigate('/psychologist-dashboard', { replace: true })}>
              Voltar ao painel
            </Button>
          )}
        </div>
      </div>
    );
  }

  if (phase === 'ended') {
    return (
      <div className="min-h-screen bg-background" data-testid="call-ended">
        <div className="flex min-h-screen items-center justify-center p-6">
          <div className="w-full max-w-sm space-y-2 rounded-2xl border bg-card p-6 text-center">
            <h2 className="text-lg font-semibold text-foreground">Atendimento encerrado</h2>
            <p className="text-sm text-muted-foreground">{endedMessage ?? 'Obrigado por usar o SOS.'}</p>
          </div>
        </div>
        <FeedbackModal
          isOpen
          required
          onClose={leave}
          onRedirect={leave}
          userType={userType}
          sessionId={sessionId}
          partnerName={remoteName ?? undefined}
        />
      </div>
    );
  }

  const away = !isPsychologist && isPsychologistAway(state, serverNow);
  const unanswered = !isPsychologist && isPatientUnanswered(state, serverNow);
  const remoteLabel = remoteName ?? (isPsychologist ? 'Paciente' : 'Psicólogo');
  const otherReadAt = isPsychologist ? state.patientReadAt : state.psychologistReadAt;
  const lastMine = [...messages].reverse().find((m) => m.senderType === userType && !m.pending);
  const statusLine = remoteTyping
    ? 'digitando…'
    : away
      ? 'pode ter se afastado'
      : isPsychologist
        ? 'na conversa'
        : state.startedAt
          ? 'na conversa'
          : 'entrou na conversa';

  return (
    <div className="flex h-dvh flex-col bg-background" data-testid="sos-text-chat">
      <header className="flex items-center gap-3 border-b bg-card px-4 py-3">
        <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
          <MessageSquareText className="h-5 w-5" />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-semibold text-foreground">{remoteLabel}</p>
          <p className={cn('text-xs', remoteTyping ? 'text-primary' : 'text-muted-foreground')} aria-live="polite">
            {statusLine}
          </p>
        </div>
        <div className="flex items-center gap-1 text-sm tabular-nums text-muted-foreground" aria-label="Tempo restante">
          <Clock className="h-4 w-4" aria-hidden="true" />
          {left === null ? '25:00' : formatClock(left)}
        </div>
        {isPsychologist && (
          <>
            <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="Contexto do paciente" onClick={() => setShowContext(true)}>
              <UserRound className="h-5 w-5" />
            </Button>
            <Button variant="ghost" size="icon" className="h-10 w-10" aria-label="Plano pós-crise" onClick={() => setShowPlan(true)}>
              <ShieldCheck className="h-5 w-5" />
            </Button>
          </>
        )}
        <Button variant="destructive" size="sm" onClick={() => setShowEndConfirm(true)}>
          Encerrar
        </Button>
      </header>

      <NoPrescriptionNotice variant="banner" userType={userType} />

      {isPsychologist && (
        <p className="border-b bg-muted/40 px-4 py-2 text-xs text-muted-foreground">
          {state.startedAt
            ? 'Mantenha esta conversa aberta até encerrar. Fora dela por mais de 1 minuto, o paciente pode chamar outro psicólogo.'
            : 'O atendimento (e o tempo de 25 min) começa quando você enviar a primeira mensagem.'}
        </p>
      )}

      {(away || unanswered) && (
        <div role="alert" className="space-y-2 border-b bg-card px-4 py-3">
          <div className="flex items-start gap-2">
            <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-destructive" aria-hidden="true" />
            <p className="text-sm text-foreground">
              {away ? 'O psicólogo pode ter se afastado da conversa.' : 'O psicólogo ainda não respondeu.'} Avisamos ele. Se
              preferir, chame outro psicólogo: você não gasta outro SOS.
            </p>
          </div>
          <div className="grid grid-cols-2 gap-2">
            <Button className="min-h-11" onClick={requestOtherPsychologist} disabled={callingOther}>
              {callingOther ? 'Chamando...' : 'Chamar outro psicólogo'}
            </Button>
            <Button asChild variant="outline" className="min-h-11">
              <a href="tel:188">
                <Phone className="h-4 w-4" /> CVV 188
              </a>
            </Button>
          </div>
        </div>
      )}

      <main className="flex-1 space-y-2 overflow-y-auto px-4 py-4" aria-live="polite" aria-label="Mensagens">
        {!isPsychologist && messages.length === 0 && !loading && (
          <p className="mx-auto max-w-sm rounded-xl border bg-card p-3 text-center text-sm text-muted-foreground">
            {remoteName ? `${remoteName} está com você.` : 'Um psicólogo está com você.'} Escreva o que está acontecendo, no seu
            ritmo.
          </p>
        )}
        {isPsychologist && messages.length === 0 && !loading && (
          <p className="mx-auto max-w-sm rounded-xl border bg-card p-3 text-center text-sm text-muted-foreground">
            O paciente escolheu conversar por mensagem. Comece se apresentando.
          </p>
        )}
        {messages.map((m) => {
          const mine = m.senderType === userType;
          return (
            <div key={m.clientId} className={cn('flex flex-col', mine ? 'items-end' : 'items-start')}>
              <div
                className={cn(
                  'max-w-[85%] whitespace-pre-wrap break-words rounded-2xl px-3 py-2 text-sm',
                  mine ? 'bg-primary text-primary-foreground' : 'border bg-card text-foreground',
                )}
              >
                {m.body}
              </div>
              <span className="mt-0.5 flex items-center gap-1 text-[11px] text-muted-foreground">
                {m.pending === 'failed' ? (
                  <button type="button" className="inline-flex items-center gap-1 text-destructive" onClick={() => retry(m.clientId)}>
                    <RefreshCw className="h-3 w-3" aria-hidden="true" /> Não enviada. Tentar de novo
                  </button>
                ) : m.pending === 'sending' ? (
                  'Enviando...'
                ) : (
                  <>
                    {formatTime(m.createdAt)}
                    {mine && m.clientId === lastMine?.clientId && (
                      isSeenBy(otherReadAt, m.createdAt) ? (
                        <span className="inline-flex items-center gap-0.5 text-primary">
                          <CheckCheck className="h-3 w-3" aria-hidden="true" /> Visto
                        </span>
                      ) : (
                        <Check className="h-3 w-3" aria-label="Enviada" />
                      )
                    )}
                  </>
                )}
              </span>
            </div>
          );
        })}
        {remoteTyping && <p className="text-xs text-muted-foreground">{remoteLabel} está digitando…</p>}
        <div ref={listEndRef} />
      </main>

      <form
        className="flex items-end gap-2 border-t bg-card px-3 py-3"
        onSubmit={(e) => {
          e.preventDefault();
          void submit();
        }}
      >
        <Textarea
          value={draft}
          onChange={(e) => {
            setDraft(e.target.value);
            notifyTyping();
          }}
          onKeyDown={(e) => {
            if (e.key === 'Enter' && !e.shiftKey && !e.nativeEvent.isComposing) {
              e.preventDefault();
              void submit();
            }
          }}
          placeholder="Escreva sua mensagem"
          aria-label="Escreva sua mensagem"
          rows={1}
          maxLength={SOS_TEXT_MAX_LENGTH}
          disabled={!active}
          className="max-h-32 min-h-11 resize-none"
        />
        <Button type="submit" size="icon" className="h-11 w-11 shrink-0" disabled={!active || !draft.trim()} aria-label="Enviar">
          <Send className="h-5 w-5" />
        </Button>
      </form>

      {isPsychologist && (
        <>
          <Sheet open={showContext} onOpenChange={setShowContext}>
            <SheetContent side="right" className="w-full overflow-y-auto sm:max-w-md">
              <SheetHeader>
                <SheetTitle>Contexto do paciente</SheetTitle>
              </SheetHeader>
              <div className="mt-4">
                <PatientContextPanel requestId={requestId} />
              </div>
            </SheetContent>
          </Sheet>
          <PostCrisisPlanDialog open={showPlan} onOpenChange={setShowPlan} sourceType="sos" sourceId={requestId} />
        </>
      )}

      <AlertDialog open={showEndConfirm} onOpenChange={setShowEndConfirm}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Encerrar o atendimento?</AlertDialogTitle>
            <AlertDialogDescription>A conversa termina para os dois.</AlertDialogDescription>
          </AlertDialogHeader>
          {isPsychologist && (
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
            <AlertDialogCancel>Continuar na conversa</AlertDialogCancel>
            <AlertDialogAction onClick={confirmEnd} className="bg-destructive text-destructive-foreground hover:bg-destructive/90">
              Encerrar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <AlertDialog open={showCrisisStep} onOpenChange={(open) => !open && showCrisisStep && confirmCrisisOutcome(true)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>A crise do paciente foi resolvida?</AlertDialogTitle>
            <AlertDialogDescription>Essa informação fica registrada no histórico do atendimento.</AlertDialogDescription>
          </AlertDialogHeader>
          <RadioGroup value={crisisResolved} onValueChange={(v) => setCrisisResolved(v as 'sim' | 'nao')} className="grid grid-cols-2 gap-2">
            {(['sim', 'nao'] as const).map((v) => (
              <div key={v} className="flex items-center gap-3 rounded-lg border border-border p-3">
                <RadioGroupItem value={v} id={`texto-crise-${v}`} />
                <Label htmlFor={`texto-crise-${v}`} className="cursor-pointer text-sm font-normal">
                  {v === 'sim' ? 'Sim' : 'Não'}
                </Label>
              </div>
            ))}
          </RadioGroup>
          {crisisResolved === 'nao' && (
            <RadioGroup value={unresolvedReason} onValueChange={setUnresolvedReason} className="max-h-52 gap-2 overflow-y-auto">
              {UNRESOLVED_CRISIS_OPTIONS.map((o) => (
                <div key={o.value} className="flex items-center gap-3 rounded-lg border border-border p-3">
                  <RadioGroupItem value={o.value} id={`texto-motivo-${o.value}`} />
                  <Label htmlFor={`texto-motivo-${o.value}`} className="cursor-pointer text-sm font-normal">
                    {o.label}
                  </Label>
                </div>
              ))}
            </RadioGroup>
          )}
          <div className="space-y-2">
            <Label htmlFor="texto-observacoes" className="text-sm">
              Observações (opcional)
            </Label>
            <Textarea
              id="texto-observacoes"
              value={endNotes}
              onChange={(e) => setEndNotes(e.target.value)}
              placeholder="Registre observações relevantes do atendimento"
              rows={3}
            />
          </div>
          <Button variant="outline" className="w-full" onClick={() => setShowPlan(true)}>
            <ShieldCheck className="mr-2 h-4 w-4" aria-hidden="true" />
            Deixar um plano pós-crise
          </Button>
          <AlertDialogFooter>
            <AlertDialogAction onClick={() => confirmCrisisOutcome()} className="w-full sm:w-auto">
              Finalizar atendimento
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

export default SosTextChatRoom;

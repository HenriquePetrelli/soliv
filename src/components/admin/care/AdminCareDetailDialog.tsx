import { useEffect, useState, type ReactNode } from 'react';
import { format } from 'date-fns';
import { FileText, Loader2, ShieldCheck, Star } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { ErrorState } from '@/components/ErrorState';
import { SkeletonList } from '@/components/skeletons/Skeletons';
import { describeEndReason, endedByLabel, formatDateTime, formatDuration } from '@/lib/sosHistory';
import { SAFETY_PLAN_SECTIONS } from '@/lib/safetyPlan';
import { triageLabel } from '@/lib/sosTriage';
import { groupTranscript, type TranscriptSegment } from '@/lib/callTranscription';
import { COMPLAINT_OPTIONS, FELT_HEARD_OPTIONS, RESOLUTION_OPTIONS } from '@/components/sos/patientFeedbackOptions';
import {
  CARE_TONE_CLASS,
  adminSpeakerLabel,
  careKindLabel,
  careStatusLabel,
  careStatusTone,
  fetchCareDetail,
  fetchCareSafetyPlans,
  fetchCareTranscript,
  type AdminSafetyPlan,
  type CareDetail,
  type CareFeedback,
  type CareKind,
} from '@/lib/adminCare';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';

interface AdminCareDetailDialogProps {
  kind: CareKind;
  /** Atendimento aberto; null fecha. */
  id: string | null;
  onClose: () => void;
}

const optionLabel = (options: { value: string; label: string }[], value: string | null) =>
  (value && options.find((o) => o.value === value)?.label) || null;

const Field = ({ label, children }: { label: string; children: ReactNode }) => (
  <div className="min-w-0">
    <dt className="text-xs text-muted-foreground">{label}</dt>
    <dd className="break-words text-sm text-foreground">{children ?? '—'}</dd>
  </div>
);

const Section = ({ title, children }: { title: string; children: ReactNode }) => (
  <section className="space-y-2 rounded-lg border p-3">
    <h3 className="text-sm font-semibold text-foreground">{title}</h3>
    {children}
  </section>
);

const Stars = ({ value }: { value: number | null }) =>
  value ? (
    <span className="inline-flex items-center gap-1" aria-label={`${value} de 5 estrelas`}>
      {[1, 2, 3, 4, 5].map((n) => (
        <Star key={n} className={n <= value ? 'h-4 w-4 fill-yellow-400 text-warning' : 'h-4 w-4 text-muted-foreground'} aria-hidden="true" />
      ))}
    </span>
  ) : (
    <span className="text-sm text-muted-foreground">Sem avaliação</span>
  );

const FeedbackBlock = ({ who, feedback }: { who: 'patient' | 'psychologist'; feedback: CareFeedback | undefined }) => {
  if (!feedback) {
    return <p className="text-sm text-muted-foreground">{who === 'patient' ? 'O paciente não avaliou.' : 'O psicólogo não avaliou.'}</p>;
  }
  const complaints = (feedback.complaint_categories ?? [])
    .map((c) => COMPLAINT_OPTIONS.find((o) => o.value === c)?.label ?? c);
  return (
    <div className="space-y-2">
      <Stars value={feedback.rating} />
      <dl className="grid grid-cols-1 gap-2 sm:grid-cols-2">
        {who === 'patient' ? (
          <>
            <Field label="O atendimento ajudou?">
              {optionLabel(RESOLUTION_OPTIONS, feedback.resolution_status) ?? optionLabel(FELT_HEARD_OPTIONS, feedback.problem_resolved)}
            </Field>
            <Field label="Se sentiu ouvido?">{optionLabel(FELT_HEARD_OPTIONS, feedback.felt_heard)}</Field>
          </>
        ) : (
          <Field label="Sintomas apresentados">{feedback.symptoms?.length ? feedback.symptoms.join(', ') : null}</Field>
        )}
      </dl>
      {feedback.comment && (
        <Field label="Comentário">
          <span className="whitespace-pre-wrap">{feedback.comment}</span>
        </Field>
      )}
      {who === 'psychologist' && feedback.clinical_notes && (
        <Field label="Anotações clínicas">
          <span className="whitespace-pre-wrap">{feedback.clinical_notes}</span>
        </Field>
      )}
      {who === 'patient' && feedback.has_complaint && (
        <div className="rounded-md border border-destructive/30 bg-destructive/5 p-2 text-sm">
          <p className="font-medium text-destructive">
            Reclamação{feedback.requires_admin_review ? ' (pede revisão do admin)' : ''}
          </p>
          {complaints.length > 0 && <p className="text-foreground">{complaints.join('; ')}</p>}
          {feedback.complaint_description && <p className="whitespace-pre-wrap text-foreground">{feedback.complaint_description}</p>}
        </div>
      )}
    </div>
  );
};

const SafetyPlans = ({ plans }: { plans: AdminSafetyPlan[] }) =>
  plans.length === 0 ? (
    <p className="text-sm text-muted-foreground">O paciente não tem plano de segurança cadastrado.</p>
  ) : (
    <div className="space-y-3" data-testid="admin-safety-plans">
      {plans.map((plan) => (
        <div key={`${plan.title}-${plan.updated_at}`} className="space-y-2 rounded-md bg-muted p-3">
          <p className="text-sm font-medium text-foreground">
            {plan.title} <span className="font-normal text-muted-foreground">· atualizado em {formatDateTime(plan.updated_at)}</span>
          </p>
          {SAFETY_PLAN_SECTIONS.map((section) =>
            plan[section.key]?.length ? (
              <div key={section.key}>
                <p className="text-xs font-medium text-muted-foreground">{section.title}</p>
                <ul className="list-disc pl-5 text-sm text-foreground">
                  {plan[section.key].map((item) => (
                    <li key={item}>{item}</li>
                  ))}
                </ul>
              </div>
            ) : null,
          )}
          {plan.contacts.length > 0 && (
            <div>
              <p className="text-xs font-medium text-muted-foreground">Contatos de emergência</p>
              <ul className="text-sm text-foreground">
                {plan.contacts.map((c) => (
                  <li key={`${c.name}-${c.phone}`}>
                    {c.name}
                    {c.relationship ? ` (${c.relationship})` : ''} · {c.phone}
                    {c.is_primary ? ' · principal' : ''}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ))}
    </div>
  );

type SpeakerFilter = 'all' | 'patient' | 'psychologist';

/** Transcrição com as falas dos dois lados; dá para ver só um deles. */
const TranscriptDialog = ({ kind, id, open, onClose }: { kind: CareKind; id: string; open: boolean; onClose: () => void }) => {
  const [segments, setSegments] = useState<TranscriptSegment[] | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [filter, setFilter] = useState<SpeakerFilter>('all');

  useEffect(() => {
    if (!open) return;
    let cancelled = false;
    setSegments(null);
    setError(null);
    setFilter('all');
    fetchCareTranscript(kind, id)
      .then((data) => !cancelled && setSegments(data))
      .catch((err) => !cancelled && setError(getFriendlyErrorMessage(err, 'Não foi possível carregar a transcrição.')));
    return () => {
      cancelled = true;
    };
  }, [open, kind, id]);

  const visible = segments ? groupTranscript(filter === 'all' ? segments : segments.filter((s) => s.speaker_role === filter)) : [];

  return (
    <Dialog open={open} onOpenChange={(v) => !v && onClose()}>
      <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Transcrição da chamada</DialogTitle>
          <DialogDescription>Falas do paciente e do psicólogo, em ordem. Esta leitura fica registrada na Auditoria.</DialogDescription>
        </DialogHeader>
        <Tabs value={filter} onValueChange={(v) => setFilter(v as SpeakerFilter)}>
          <TabsList className="grid w-full grid-cols-3">
            <TabsTrigger value="all">Os dois</TabsTrigger>
            <TabsTrigger value="patient">Paciente</TabsTrigger>
            <TabsTrigger value="psychologist">Psicólogo</TabsTrigger>
          </TabsList>
        </Tabs>
        {error ? (
          <ErrorState description={error} />
        ) : segments === null ? (
          <p className="flex items-center gap-2 text-sm text-muted-foreground">
            <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Carregando...
          </p>
        ) : visible.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nenhuma fala transcrita{filter === 'all' ? '' : ' deste lado'}.</p>
        ) : (
          <ol className="space-y-2 rounded-md bg-muted p-3 text-sm" data-testid="admin-transcript">
            {visible.map((seg) => (
              <li key={`${seg.speaker_role}-${seg.started_at}`}>
                <span className="font-medium text-foreground">{adminSpeakerLabel(seg.speaker_role)}</span>{' '}
                <span className="text-xs tabular-nums text-muted-foreground">{format(new Date(seg.started_at), 'HH:mm')}</span>
                <p className="whitespace-pre-wrap text-foreground">{seg.content}</p>
              </li>
            ))}
          </ol>
        )}
      </DialogContent>
    </Dialog>
  );
};

/** Detalhes de uma consulta agendada ou de um SOS, para o admin. */
const AdminCareDetailDialog = ({ kind, id, onClose }: AdminCareDetailDialogProps) => {
  const [detail, setDetail] = useState<CareDetail | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [plans, setPlans] = useState<AdminSafetyPlan[] | null>(null);
  const [plansLoading, setPlansLoading] = useState(false);
  const [plansError, setPlansError] = useState<string | null>(null);
  const [transcriptOpen, setTranscriptOpen] = useState(false);

  useEffect(() => {
    if (!id) return;
    let cancelled = false;
    setDetail(null);
    setError(null);
    setPlans(null);
    setPlansError(null);
    setTranscriptOpen(false);
    fetchCareDetail(kind, id)
      .then((data) => !cancelled && setDetail(data))
      .catch((err) => !cancelled && setError(getFriendlyErrorMessage(err, 'Não foi possível carregar os detalhes.')));
    return () => {
      cancelled = true;
    };
  }, [kind, id]);

  const openPlans = async () => {
    if (!id) return;
    setPlansLoading(true);
    setPlansError(null);
    try {
      setPlans(await fetchCareSafetyPlans(kind, id));
    } catch (err) {
      setPlansError(getFriendlyErrorMessage(err, 'Não foi possível carregar o plano de segurança.'));
    } finally {
      setPlansLoading(false);
    }
  };

  const care = detail?.care;
  const patientFeedback = detail?.feedback.find((f) => f.user_type === 'patient');
  const psychologistFeedback = detail?.feedback.find((f) => f.user_type === 'psychologist');
  const seconds = care ? (kind === 'appointment' ? care.call_seconds : care.duration_seconds) : null;

  return (
    <>
      <Dialog open={!!id} onOpenChange={(v) => !v && onClose()}>
        <DialogContent className="max-h-[90vh] max-w-2xl overflow-y-auto" data-testid="admin-care-detail">
          <DialogHeader>
            <DialogTitle>Detalhes · {careKindLabel(kind)}</DialogTitle>
            <DialogDescription>
              {care ? formatDateTime(kind === 'appointment' ? care.scheduled_at : care.created_at) : 'Carregando...'}
            </DialogDescription>
          </DialogHeader>

          {error ? (
            <ErrorState description={error} />
          ) : !detail || !care ? (
            <SkeletonList count={4} />
          ) : (
            <div className="space-y-3">
              <div className="flex flex-wrap items-center gap-2">
                <Badge variant="outline" className={CARE_TONE_CLASS[careStatusTone(care.status)]}>
                  {careStatusLabel(kind, care.status)}
                </Badge>
                {kind === 'sos' && care.channel && (
                  <Badge variant="outline" className="font-normal">{care.channel === 'text' ? 'Por mensagem' : 'Por vídeo'}</Badge>
                )}
                {care.transcription_consent_at && (
                  <Badge variant="outline" className="font-normal">Consentiu com a transcrição</Badge>
                )}
              </div>

              <Section title="Pessoas">
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  <Field label="Paciente">
                    {detail.patient?.full_name || care.patient_name_fallback || 'Paciente'}
                    {detail.patient?.email && <span className="block text-xs text-muted-foreground">{detail.patient.email}</span>}
                    {detail.patient?.phone && <span className="block text-xs text-muted-foreground">{detail.patient.phone}</span>}
                  </Field>
                  <Field label="Psicólogo">
                    {detail.psychologist?.full_name || care.psychologist_name_fallback || (kind === 'sos' ? 'Ninguém atendeu' : '—')}
                    {detail.psychologist?.crp_number && (
                      <span className="block text-xs text-muted-foreground">CRP {detail.psychologist.crp_number}</span>
                    )}
                    {detail.psychologist?.email && <span className="block text-xs text-muted-foreground">{detail.psychologist.email}</span>}
                  </Field>
                </dl>
              </Section>

              <Section title="Atendimento">
                <dl className="grid grid-cols-1 gap-3 sm:grid-cols-2">
                  {kind === 'appointment' ? (
                    <>
                      <Field label="Marcada para">{formatDateTime(care.scheduled_at)}</Field>
                      <Field label="Duração prevista">{care.planned_minutes ? `${care.planned_minutes} min` : null}</Field>
                      <Field label="Chamada conectou">{care.connected_at ? formatDateTime(care.connected_at) : null}</Field>
                      <Field label="Tempo com os dois na chamada">{formatDuration(seconds)}</Field>
                      <Field label="Terminou">{care.ended_at ? formatDateTime(care.ended_at) : null}</Field>
                      <Field label="Encerrada por">{endedByLabel(care.ended_by_type)}</Field>
                      {care.status === 'cancelled' && (
                        <Field label="Cancelamento">
                          {[care.cancelled_at && formatDateTime(care.cancelled_at), care.cancellation_reason].filter(Boolean).join(' · ') || null}
                        </Field>
                      )}
                    </>
                  ) : (
                    <>
                      <Field label="Pedido">{formatDateTime(care.created_at)}</Field>
                      <Field label="Aceito">{care.accepted_at ? formatDateTime(care.accepted_at) : null}</Field>
                      <Field label="Duração">{formatDuration(seconds)}</Field>
                      <Field label="Terminou">{care.ended_at ? formatDateTime(care.ended_at) : null}</Field>
                      <Field label="Encerrado por">{endedByLabel(care.ended_by_type)}</Field>
                      <Field label="Motivo">{describeEndReason(care.end_reason)}</Field>
                      <Field label="Crise resolvida?">
                        {care.crisis_resolved == null ? null : care.crisis_resolved ? 'Sim' : 'Não'}
                      </Field>
                      <Field label="Triagem">{care.triage?.length ? care.triage.map(triageLabel).join(', ') : null}</Field>
                    </>
                  )}
                </dl>
                {(care.notes || care.session_summary || care.end_notes) && (
                  <dl className="space-y-2 pt-1">
                    {care.notes && <Field label="Notas da consulta"><span className="whitespace-pre-wrap">{care.notes}</span></Field>}
                    {care.session_summary && (
                      <Field label="Resumo da sessão"><span className="whitespace-pre-wrap">{care.session_summary}</span></Field>
                    )}
                    {care.end_notes && <Field label="Notas de encerramento"><span className="whitespace-pre-wrap">{care.end_notes}</span></Field>}
                  </dl>
                )}
              </Section>

              <Section title="Avaliação do paciente">
                <FeedbackBlock who="patient" feedback={patientFeedback} />
              </Section>

              <Section title="Avaliação do psicólogo">
                <FeedbackBlock who="psychologist" feedback={psychologistFeedback} />
              </Section>

              <Section title="Plano de segurança">
                {detail.safety_plan_count === 0 ? (
                  <p className="text-sm text-muted-foreground">O paciente não tem plano de segurança cadastrado.</p>
                ) : plans ? (
                  <SafetyPlans plans={plans} />
                ) : (
                  <div className="space-y-2">
                    <p className="text-sm text-foreground">
                      {detail.safety_plan_count === 1 ? '1 plano cadastrado.' : `${detail.safety_plan_count} planos cadastrados.`}
                    </p>
                    {plansError && <p className="text-sm text-destructive">{plansError}</p>}
                    <Button variant="outline" size="sm" onClick={() => void openPlans()} disabled={plansLoading}>
                      {plansLoading ? (
                        <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" />
                      ) : (
                        <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                      )}
                      Ver plano de segurança
                    </Button>
                  </div>
                )}
              </Section>

              <Section title="Transcrição">
                {detail.transcript_segments === 0 ? (
                  <p className="text-sm text-muted-foreground">
                    {care.transcription_consent_at
                      ? 'O paciente consentiu, mas não há falas transcritas.'
                      : kind === 'sos' && care.channel === 'text'
                        ? 'SOS por mensagem: não há chamada para transcrever.'
                        : 'Sem transcrição: o paciente não consentiu.'}
                  </p>
                ) : (
                  <Button size="sm" onClick={() => setTranscriptOpen(true)}>
                    <FileText className="h-4 w-4" aria-hidden="true" />
                    Abrir transcrição do paciente e do psicólogo
                  </Button>
                )}
              </Section>

              <p className="text-xs text-muted-foreground">
                Abrir estes detalhes, o plano de segurança e a transcrição fica registrado na Auditoria.
              </p>
            </div>
          )}
        </DialogContent>
      </Dialog>
      {id && <TranscriptDialog kind={kind} id={id} open={transcriptOpen} onClose={() => setTranscriptOpen(false)} />}
    </>
  );
};

export default AdminCareDetailDialog;

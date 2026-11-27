import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Input } from '@/components/ui/input';
import { Badge } from '@/components/ui/badge';
import { Checkbox } from '@/components/ui/checkbox';
import { ScrollArea } from '@/components/ui/scroll-area';
import { Star, Search, ArrowLeft, ShieldCheck } from 'lucide-react';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import { getSessionUser } from '@/lib/currentUser';
import { usePatientStatistics } from '@/hooks/usePatientStatistics';
import { sosLog } from '@/lib/sosLogger';
import { SINTOMAS } from '@/data/sintomas';
import {
  COMPLAINT_OPTIONS,
  FELT_HEARD_OPTIONS,
  RESOLUTION_OPTIONS,
  hasConductComplaint,
  legacyProblemResolved,
  type FeltHeard,
  type ResolutionStatus,
} from '@/components/sos/patientFeedbackOptions';

interface FeedbackModalProps {
  isOpen: boolean;
  onClose: () => void;
  userType: 'patient' | 'psychologist';
  sessionId: string;
  partnerName?: string;
  onRedirect?: () => void;
  /** Mandatory evaluation: no skip, no dismiss — only submitting closes it. */
  required?: boolean;
}

export const FeedbackModal = ({ isOpen, onClose, userType, sessionId, partnerName, onRedirect, required = false }: FeedbackModalProps) => {
  const [rating, setRating] = useState<number>(0);
  const [comment, setComment] = useState('');

  // Patient structured flow
  const [step, setStep] = useState(1);
  const [resolution, setResolution] = useState<ResolutionStatus | ''>('');
  const [feltHeard, setFeltHeard] = useState<FeltHeard | ''>('');
  const [complaints, setComplaints] = useState<string[]>([]);
  const [complaintDescription, setComplaintDescription] = useState('');

  // Psychologist clinical record
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [symptomQuery, setSymptomQuery] = useState('');
  const [clinicalNotes, setClinicalNotes] = useState('');

  const [isSubmitting, setIsSubmitting] = useState(false);
  const [alreadySent, setAlreadySent] = useState(false);
  const { toast } = useToast();
  const { addActivity } = usePatientStatistics({ load: false });

  const isPsychologist = userType === 'psychologist';
  const needsInvestigation = resolution === 'partially_resolved' || resolution === 'not_resolved';
  const conductFlagged = hasConductComplaint(complaints);
  const totalSteps = needsInvestigation ? (conductFlagged ? 4 : 3) : 2;

  const filteredSymptoms = useMemo(() => {
    const q = symptomQuery.trim().toLowerCase();
    const list = [...SINTOMAS] as string[];
    return q ? list.filter((s) => s.toLowerCase().includes(q)) : list;
  }, [symptomQuery]);

  const toggleSymptom = (symptom: string) =>
    setSymptoms((prev) => (prev.includes(symptom) ? prev.filter((s) => s !== symptom) : [...prev, symptom]));

  const toggleComplaint = (value: string) =>
    setComplaints((prev) => (prev.includes(value) ? prev.filter((c) => c !== value) : [...prev, value]));

  // Idempotency: one feedback per user per session. Reloading the page after
  // finishing must never create a second row nor block the user here.
  useEffect(() => {
    if (!isOpen || !sessionId) return;
    let cancelled = false;

    const checkExisting = async () => {
      const { data: { user } } = await getSessionUser();
      if (!user || cancelled) return;

      const { data } = await supabase
        .from('session_feedback')
        .select('id')
        .eq('session_id', sessionId)
        .eq('user_id', user.id)
        .maybeSingle();

      if (!cancelled && data) {
        sosLog('SESSION', 'feedback already registered — skipping modal', { sessionId });
        setAlreadySent(true);
      }
    };

    checkExisting();
    return () => {
      cancelled = true;
    };
  }, [isOpen, sessionId]);

  useEffect(() => {
    if (alreadySent) handleClose();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [alreadySent]);

  const handleSubmit = async () => {
    if (isSubmitting) return; // double-click guard

    if (!isPsychologist && !resolution) {
      toast({ title: 'Resposta obrigatória', description: 'Conte se o atendimento conseguiu te ajudar.', variant: 'destructive' });
      setStep(1);
      return;
    }

    if (rating === 0) {
      toast({
        title: 'Avaliação obrigatória',
        description: 'Selecione uma avaliação de 1 a 5 estrelas.',
        variant: 'destructive',
      });
      if (!isPsychologist) setStep(2);
      return;
    }

    setIsSubmitting(true);
    try {
      const { data: { user } } = await getSessionUser();
      if (!user) throw new Error('User not authenticated');

      // Resolve the related emergency request (if any) so the feedback stays
      // linked even if the webrtc session row is cleaned up later.
      const { data: emergencyRow } = await supabase
        .from('emergency_requests')
        .select('id, accepted_by')
        .eq('video_room_id', sessionId)
        .maybeSingle();

      const requiresAdminReview = !isPsychologist && conductFlagged;

      const { error: feedbackError } = await supabase.from('session_feedback').upsert(
        {
          session_id: sessionId,
          user_id: user.id,
          user_type: userType,
          rating,
          problem_resolved: isPsychologist ? null : legacyProblemResolved(resolution),
          resolution_status: isPsychologist ? null : (resolution || null),
          felt_heard: isPsychologist ? null : (feltHeard || null),
          has_complaint: !isPsychologist && complaints.length > 0,
          complaint_categories: isPsychologist ? [] : complaints,
          complaint_description: !isPsychologist && complaintDescription.trim() ? complaintDescription.trim() : null,
          requires_admin_review: requiresAdminReview,
          psychologist_id: emergencyRow?.accepted_by ?? null,
          comment: comment.trim() || null,
          symptoms: isPsychologist ? symptoms : [],
          clinical_notes: isPsychologist ? clinicalNotes.trim() || null : null,
          emergency_request_id: emergencyRow?.id ?? null,
        },
        { onConflict: 'session_id,user_id' }
      );

      if (feedbackError) throw feedbackError;

      // The psychologist average rating is recalculated server-side by a
      // database trigger on session_feedback (no client-side update needed).

      toast({ title: 'Obrigado pelo seu feedback!' });

      if (userType === 'patient') {
        addActivity(emergencyRow ? 'SOS de Emergência' : 'Consulta com Psicólogo');
      }

      handleClose();
    } catch (error) {
      console.error('Error submitting feedback:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao enviar avaliação. Tente novamente.',
        variant: 'destructive',
      });
    } finally {
      setIsSubmitting(false);
    }
  };

  const handleClose = () => {
    onClose();
    if (onRedirect) {
      setTimeout(onRedirect, 100);
    }
  };

  const goNext = () => {
    if (step === 2 && !needsInvestigation) {
      handleSubmit();
      return;
    }
    if (step === 3 && !conductFlagged) {
      handleSubmit();
      return;
    }
    setStep((s) => s + 1);
  };

  const renderStars = () => (
    <div className="flex justify-center gap-2">
      {[1, 2, 3, 4, 5].map((star) => (
        <button
          key={star}
          type="button"
          aria-label={`${star} estrela${star > 1 ? 's' : ''}`}
          onClick={() => setRating(star)}
          className="transition-transform duration-200 hover:scale-110 active:scale-95"
        >
          <Star
            className={`h-10 w-10 transition-colors ${
              star <= rating ? 'fill-yellow-400 text-warning' : 'text-muted-foreground hover:text-yellow-300'
            }`}
          />
        </button>
      ))}
    </div>
  );

  const patientBody = (
    <div className="space-y-6">
      {/* Progress */}
      <div className="flex items-center gap-1.5">
        {Array.from({ length: totalSteps }).map((_, i) => (
          <span
            key={i}
            className={`h-1.5 flex-1 rounded-full transition-colors duration-300 ${
              i < step ? 'bg-primary' : 'bg-muted'
            }`}
          />
        ))}
      </div>

      <div key={step} className="animate-fade-in space-y-5">
        {step === 1 && (
          <div className="space-y-3">
            <p className="text-center font-medium">O atendimento conseguiu te ajudar?</p>
            {RESOLUTION_OPTIONS.map((opt) => (
              <Button
                key={opt.value}
                variant={resolution === opt.value ? 'default' : 'outline'}
                className="h-auto w-full whitespace-normal py-3 text-base"
                onClick={() => {
                  setResolution(opt.value);
                  setStep(2);
                }}
              >
                {opt.label}
              </Button>
            ))}
          </div>
        )}

        {step === 2 && (
          <div className="space-y-6">
            <div className="space-y-3 text-center">
              <p className="font-medium">Como você avalia o atendimento do psicólogo?</p>
              {renderStars()}
            </div>

            <div className="space-y-2">
              <Label className="font-medium">Durante o atendimento, você se sentiu ouvido e acolhido?</Label>
              <div className="grid grid-cols-3 gap-2">
                {FELT_HEARD_OPTIONS.map((opt) => (
                  <Button
                    key={opt.value}
                    type="button"
                    variant={feltHeard === opt.value ? 'default' : 'outline'}
                    className="h-auto whitespace-normal py-2 text-sm"
                    onClick={() => setFeltHeard(opt.value)}
                  >
                    {opt.label}
                  </Button>
                ))}
              </div>
            </div>

            <div className="space-y-2">
              <Label htmlFor="feedback-comment" className="font-medium">
                Conte como foi sua experiência (opcional)
              </Label>
              <Textarea
                id="feedback-comment"
                value={comment}
                onChange={(e) => setComment(e.target.value)}
                rows={3}
                maxLength={1000}
                placeholder="Compartilhe o que achou do atendimento"
              />
            </div>
          </div>
        )}

        {step === 3 && (
          <div className="space-y-3">
            <p className="font-medium">Queremos entender melhor. O que aconteceu durante o atendimento?</p>
            <p className="text-sm text-muted-foreground">Você pode selecionar mais de uma opção.</p>
            <div className="space-y-2.5">
              {COMPLAINT_OPTIONS.map((opt) => (
                <div key={opt.value} className="flex items-start gap-2.5">
                  <Checkbox
                    id={`complaint-${opt.value}`}
                    checked={complaints.includes(opt.value)}
                    onCheckedChange={() => toggleComplaint(opt.value)}
                    className="mt-0.5"
                  />
                  <Label htmlFor={`complaint-${opt.value}`} className="cursor-pointer text-sm font-normal leading-snug">
                    {opt.label}
                  </Label>
                </div>
              ))}
            </div>
          </div>
        )}

        {step === 4 && (
          <div className="space-y-3">
            <Label htmlFor="complaint-description" className="font-medium">
              O que aconteceu?
            </Label>
            <Textarea
              id="complaint-description"
              value={complaintDescription}
              onChange={(e) => setComplaintDescription(e.target.value)}
              rows={5}
              maxLength={2000}
              placeholder="Conte, se quiser, o que aconteceu durante o atendimento."
            />
            <div className="flex items-start gap-2 rounded-lg bg-muted p-3 text-sm text-muted-foreground">
              <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0" />
              <span>
                Seu relato será analisado pela equipe Soliv e poderá ser utilizado para melhorar a qualidade e a
                segurança dos atendimentos.
              </span>
            </div>
          </div>
        )}
      </div>

      {step > 1 && (
        <div className="flex gap-3">
          <Button variant="outline" onClick={() => setStep((s) => s - 1)} disabled={isSubmitting} className="gap-1">
            <ArrowLeft className="h-4 w-4" />
            Voltar
          </Button>
          {!required && (
            <Button variant="ghost" onClick={handleClose} disabled={isSubmitting}>
              Pular
            </Button>
          )}
          <Button className="flex-1" onClick={goNext} disabled={isSubmitting}>
            {isSubmitting ? 'Enviando...' : step === totalSteps ? 'Enviar' : 'Continuar'}
          </Button>
        </div>
      )}

      {step === 1 && !required && (
        <Button variant="ghost" className="w-full" onClick={handleClose} disabled={isSubmitting}>
          Pular
        </Button>
      )}
    </div>
  );

  const psychologistBody = (
    <div className="space-y-6">
      <div className="space-y-2 text-center">
        <p className="font-medium">Como foi o atendimento com o paciente?</p>
        {renderStars()}
      </div>

      <div className="space-y-3">
        <div className="flex items-center justify-between gap-2">
          <Label className="font-medium">Sintomas apresentados</Label>
          <Badge variant="outline">{symptoms.length} selecionado(s)</Badge>
        </div>

        {symptoms.length > 0 && (
          <div className="flex flex-wrap gap-1.5">
            {symptoms.map((s) => (
              <Badge
                key={s}
                variant="secondary"
                className="max-w-full cursor-pointer truncate font-normal"
                onClick={() => toggleSymptom(s)}
                title="Remover"
              >
                {s}
              </Badge>
            ))}
          </div>
        )}

        <div className="relative">
          <Search className="absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" />
          <Input
            value={symptomQuery}
            onChange={(e) => setSymptomQuery(e.target.value)}
            placeholder="Buscar sintoma..."
            className="pl-9"
          />
        </div>

        <ScrollArea className="h-52 rounded-md border p-3">
          <div className="space-y-2.5">
            {filteredSymptoms.length === 0 && (
              <p className="text-sm text-muted-foreground">Nenhum sintoma encontrado.</p>
            )}
            {filteredSymptoms.map((symptom) => (
              <div key={symptom} className="flex items-start gap-2.5">
                <Checkbox
                  id={`symptom-${symptom}`}
                  checked={symptoms.includes(symptom)}
                  onCheckedChange={() => toggleSymptom(symptom)}
                  className="mt-0.5"
                />
                <Label htmlFor={`symptom-${symptom}`} className="cursor-pointer text-sm font-normal leading-snug">
                  {symptom}
                </Label>
              </div>
            ))}
          </div>
        </ScrollArea>
      </div>

      <div className="space-y-2">
        <Label htmlFor="clinical-notes" className="font-medium">
          Anotações do atendimento
        </Label>
        <Textarea
          id="clinical-notes"
          value={clinicalNotes}
          onChange={(e) => setClinicalNotes(e.target.value)}
          rows={4}
          placeholder="Registre condutas, encaminhamentos e observações clínicas do atendimento"
        />
      </div>

      <div className="space-y-2">
        <Label htmlFor="psy-comment" className="font-medium">
          Observações gerais (opcional)
        </Label>
        <Textarea
          id="psy-comment"
          value={comment}
          onChange={(e) => setComment(e.target.value)}
          rows={3}
          placeholder="Registre observações sobre o atendimento"
        />
      </div>

      <div className="flex gap-3">
        {!required && (
          <Button variant="outline" className="flex-1" onClick={handleClose} disabled={isSubmitting}>
            Pular
          </Button>
        )}
        <Button className="flex-1" onClick={handleSubmit} disabled={isSubmitting}>
          {isSubmitting ? 'Enviando...' : 'Enviar'}
        </Button>
      </div>
    </div>
  );

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && !required) onClose(); }}>
      <DialogContent
        className={`${isPsychologist ? 'sm:max-w-lg' : 'sm:max-w-md'} max-h-[90vh] overflow-y-auto ${required ? '[&>button]:hidden' : ''}`}
        onPointerDownOutside={(e) => { if (required) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (required) e.preventDefault(); }}
        onInteractOutside={(e) => { if (required) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle className="text-center">
            {isPsychologist ? 'Registro do atendimento' : 'Como foi seu atendimento?'}
          </DialogTitle>
          <DialogDescription className="text-center">
            {isPsychologist
              ? 'Registre os dados clínicos do atendimento.'
              : 'Sua avaliação nos ajuda a melhorar a qualidade dos atendimentos do Soliv.'}
          </DialogDescription>
        </DialogHeader>

        <Card>
          <CardContent className="space-y-6 p-6">
            {partnerName && (
              <p className="text-center text-muted-foreground">
                {isPsychologist ? `Paciente: ${partnerName}` : `Psicólogo: ${partnerName}`}
              </p>
            )}
            {isPsychologist ? psychologistBody : patientBody}
          </CardContent>
        </Card>
      </DialogContent>
    </Dialog>
  );
};

import { useEffect, useState } from 'react';
import { format } from 'date-fns';
import { ChevronDown, ChevronUp, FileText, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { groupTranscript, type TranscriptSegment } from '@/lib/callTranscription';

interface CallTranscriptSectionProps {
  kind: 'appointment' | 'sos';
  sourceId: string;
  /** Como chamar cada lado (o psicólogo vê "Você" para a própria fala). */
  viewer: 'patient' | 'psychologist';
}

const speakerLabel = (role: TranscriptSegment['speaker_role'], viewer: CallTranscriptSectionProps['viewer']) =>
  role === viewer ? 'Você' : role === 'patient' ? 'Paciente' : 'Psicólogo';

/** Transcrição da chamada (só existe se o paciente consentiu antes de entrar). */
const CallTranscriptSection = ({ kind, sourceId, viewer }: CallTranscriptSectionProps) => {
  const [segments, setSegments] = useState<TranscriptSegment[] | null>(null);
  const [failed, setFailed] = useState(false);
  const [expanded, setExpanded] = useState(false);

  useEffect(() => {
    let cancelled = false;
    setSegments(null);
    setFailed(false);
    void (async () => {
      const { data, error } = await supabase.rpc('get_call_transcript', kind === 'appointment'
        ? { p_appointment_id: sourceId }
        : { p_emergency_request_id: sourceId });
      if (cancelled) return;
      if (error) {
        console.error('Transcrição: falha ao carregar', error);
        setFailed(true);
        return;
      }
      setSegments(groupTranscript((data ?? []) as TranscriptSegment[]));
    })();
    return () => {
      cancelled = true;
    };
  }, [kind, sourceId]);

  const visible = expanded ? segments ?? [] : (segments ?? []).slice(0, 4);

  return (
    <section className="space-y-2" data-testid="call-transcript">
      <Label className="flex items-center gap-1.5 font-medium">
        <FileText className="h-4 w-4 text-primary" aria-hidden="true" />
        Transcrição da chamada
      </Label>
      {segments === null && !failed ? (
        <p className="flex items-center gap-2 text-sm text-muted-foreground">
          <Loader2 className="h-4 w-4 animate-spin motion-reduce:animate-none" aria-hidden="true" /> Carregando...
        </p>
      ) : failed ? (
        <p className="text-sm text-muted-foreground">Não foi possível carregar a transcrição.</p>
      ) : segments!.length === 0 ? (
        <p className="text-sm text-muted-foreground">Sem transcrição para este atendimento.</p>
      ) : (
        <>
          <ol className="max-h-80 space-y-2 overflow-y-auto rounded-md bg-muted p-3 text-sm">
            {visible.map((seg) => (
              <li key={`${seg.speaker_role}-${seg.started_at}`}>
                <span className="font-medium text-foreground">{speakerLabel(seg.speaker_role, viewer)}</span>{' '}
                <span className="text-xs text-muted-foreground tabular-nums">{format(new Date(seg.started_at), 'HH:mm')}</span>
                <p className="whitespace-pre-wrap text-foreground">{seg.content}</p>
              </li>
            ))}
          </ol>
          {segments!.length > 4 && (
            <Button variant="ghost" size="sm" onClick={() => setExpanded((v) => !v)}>
              {expanded ? <ChevronUp className="h-4 w-4" /> : <ChevronDown className="h-4 w-4" />}
              {expanded ? 'Mostrar menos' : `Ver tudo (${segments!.length} falas)`}
            </Button>
          )}
        </>
      )}
    </section>
  );
};

export default CallTranscriptSection;

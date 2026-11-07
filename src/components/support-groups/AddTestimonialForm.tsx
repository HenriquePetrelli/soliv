import { useState } from 'react';
import { Button } from '@/components/ui/button';
import { useNavigate } from 'react-router-dom';
import { mentionsCrisis } from '@/lib/crisisLanguage';
import { Textarea } from '@/components/ui/textarea';
import { Switch } from '@/components/ui/switch';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Card, CardContent } from '@/components/ui/card';
import { useGroupTestimonials, useGroupSymptoms } from '@/hooks/useSupportGroups';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { usePatientStatistics } from '@/hooks/usePatientStatistics';
import { Loader2 } from 'lucide-react';
import { JOURNAL_MOODS, DEFAULT_JOURNAL_MOOD } from '@/components/journal/journalMoods';
import { cn } from '@/lib/utils';
import { hasPaidPlan } from '@/lib/plans';

interface AddTestimonialFormProps {
  groupId: string;
  groupName: string;
  onSuccess: () => void;
  onCancel?: () => void;
}

const AddTestimonialForm = ({ groupId, groupName, onSuccess, onCancel }: AddTestimonialFormProps) => {
  const [isAnonymous, setIsAnonymous] = useState(false);
  const [selectedSymptom, setSelectedSymptom] = useState<string>('');
  const [mood, setMood] = useState<number>(DEFAULT_JOURNAL_MOOD);
  const [text, setText] = useState('');
  const [isSubmitting, setIsSubmitting] = useState(false);
  const navigate = useNavigate();
  // O mesmo id em todas as tentativas deste depoimento (sem publicar em dobro).
  const [submissionId] = useState(() =>
    typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : undefined,
  );
  const showCrisisSupport = mentionsCrisis(text);

  const { addTestimonial } = useGroupTestimonials(groupId);
  const { symptoms, symptomId } = useGroupSymptoms(groupName);
  const { subscribed, subscriptionTier } = useSubscription();
  const { addActivity } = usePatientStatistics();

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    
    if (!text.trim()) {
      return;
    }

    // Check subscription (additional frontend check)
    if (!hasPaidPlan(subscribed, subscriptionTier)) {
      return; // This should not happen as the modal should be blocked already
    }

    setIsSubmitting(true);

    // The Select offers each individual symptom string from the group's
    // symptom list, but sintoma_id only references the group-level row —
    // it can't tell WHICH symptom was picked. Store the picked symptom's
    // text directly so it's not lost.
    const selectedIndex = selectedSymptom && selectedSymptom !== 'none'
      ? parseInt(selectedSymptom.split('-').pop() || '-1', 10)
      : -1;
    const sintomaTexto = selectedIndex >= 0 ? symptoms[selectedIndex] ?? null : null;

    const success = await addTestimonial({
      anonimo: isAnonymous,
      sintoma_id: sintomaTexto ? symptomId : null,
      sintoma_texto: sintomaTexto,
      humor: mood,
      texto: text.trim()
    }, submissionId);

    if (success) {
      addActivity(`Grupo de Apoio: ${groupName}`);
      onSuccess();
    }

    setIsSubmitting(false);
  };

  return (
    <form onSubmit={handleSubmit} className="space-y-6">
      {/* Anonymous Toggle */}
      <div className="flex items-center space-x-2">
        <Switch
          id="anonymous"
          checked={isAnonymous}
          onCheckedChange={setIsAnonymous}
        />
        <Label htmlFor="anonymous">Publicar como Anônimo</Label>
      </div>

      {/* Symptom Selection */}
      {symptoms.length > 0 && (
        <div className="space-y-2">
          <Label>Sintoma relacionado (opcional)</Label>
          <Select value={selectedSymptom} onValueChange={setSelectedSymptom}>
            <SelectTrigger>
              <SelectValue placeholder="Selecione um sintoma..." />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="none">Nenhum sintoma específico</SelectItem>
              {symptoms.map((symptom, index) => (
                <SelectItem key={index} value={`${symptomId}-${index}`}>
                  {symptom}
                </SelectItem>
              ))}
            </SelectContent>
          </Select>
        </div>
      )}

      {/* Mood Selection */}
      <div className="space-y-3">
        <Label>Como está se sentindo hoje?</Label>
        <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2">
          {JOURNAL_MOODS.map((m) => {
            const Icon = m.Icon;
            const isSelected = mood === m.value;
            return (
              <button
                key={m.value}
                type="button"
                onClick={() => setMood(m.value)}
                className={cn(
                  'flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 bg-background',
                  isSelected ? `${m.borderClass} ${m.bgClass}` : 'border-border hover:border-foreground/20'
                )}
              >
                <Icon className={cn('w-7 h-7', isSelected ? m.colorClass : 'text-muted-foreground')} />
                <span className={cn('text-sm font-medium', isSelected ? m.colorClass : 'text-muted-foreground')}>
                  {m.label}
                </span>
              </button>
            );
          })}
        </div>
      </div>

      {/* Text Area */}
      <div className="space-y-2">
        <Label htmlFor="testimonial">Seu depoimento *</Label>
        <Textarea
          id="testimonial"
          placeholder="Compartilhe sua experiência, sentimentos ou qualquer coisa que possa ajudar outras pessoas..."
          value={text}
          onChange={(e) => setText(e.target.value)}
          onFocus={(e) => {
            setTimeout(() => {
              e.target.scrollIntoView({ behavior: 'smooth', block: 'center' });
            }, 300);
          }}
          rows={4}
          maxLength={500}
          required
        />
        <div className="text-xs text-muted-foreground">
          {text.length}/500 caracteres
        </div>
        {/* Escreveu sobre se ferir ou não querer viver: ajuda na hora (não bloqueia). */}
        {showCrisisSupport && (
          <div className="space-y-3 rounded-xl border border-destructive/40 bg-destructive/5 p-3" role="alert" data-testid="crisis-support">
            <p className="text-sm text-foreground">
              Parece que você está passando por um momento muito difícil. Você não precisa enfrentar isso sozinho(a): o CVV
              atende 24 horas, de graça, pelo 188. No app, o SOS conecta você a um psicólogo agora.
            </p>
            <div className="grid grid-cols-2 gap-2">
              <Button asChild variant="outline" className="min-h-11">
                <a href="tel:188">Ligar 188</a>
              </Button>
              <Button type="button" variant="destructive" className="min-h-11" onClick={() => navigate('/sos')}>
                Abrir o SOS
              </Button>
            </div>
          </div>
        )}
      </div>

      {/* Action Buttons */}
      <div className="flex justify-end">
        <Button
          type="submit"
          disabled={!text.trim() || text.length > 500 || isSubmitting}
          className="w-full sm:w-auto bg-primary hover:bg-primary/90 text-primary-foreground"
        >
          {isSubmitting ? (
            <>
              <Loader2 className="w-4 h-4 mr-2 animate-spin" />
              Salvando...
            </>
          ) : (
            'Salvar Depoimento'
          )}
        </Button>
      </div>
    </form>
  );
};

export default AddTestimonialForm;
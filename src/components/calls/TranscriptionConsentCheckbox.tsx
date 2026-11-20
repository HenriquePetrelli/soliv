import { FileText } from 'lucide-react';
import { Checkbox } from '@/components/ui/checkbox';
import { cn } from '@/lib/utils';
import { TRANSCRIPTION_CONSENT_DETAILS, TRANSCRIPTION_CONSENT_LABEL } from '@/lib/callTranscription';

interface TranscriptionConsentCheckboxProps {
  id: string;
  checked: boolean;
  onCheckedChange: (checked: boolean) => void;
  className?: string;
}

/** Consentimento com a gravação e transcrição, mostrado antes de entrar na chamada. */
const TranscriptionConsentCheckbox = ({ id, checked, onCheckedChange, className }: TranscriptionConsentCheckboxProps) => (
  <div
    className={cn(
      'flex items-start gap-3 rounded-2xl border p-4 text-left transition-colors',
      checked ? 'border-primary bg-primary/5' : 'border-border bg-card',
      className,
    )}
    data-testid="transcription-consent"
  >
    <Checkbox
      id={id}
      checked={checked}
      onCheckedChange={(value) => onCheckedChange(value === true)}
      className="mt-0.5 h-5 w-5"
      aria-describedby={`${id}-details`}
    />
    <div className="space-y-1">
      <label htmlFor={id} className="flex cursor-pointer items-center gap-1.5 text-sm font-medium text-foreground">
        <FileText className="h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
        {TRANSCRIPTION_CONSENT_LABEL}
      </label>
      <p id={`${id}-details`} className="text-xs text-muted-foreground">
        {TRANSCRIPTION_CONSENT_DETAILS}
      </p>
    </div>
  </div>
);

export default TranscriptionConsentCheckbox;

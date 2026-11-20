import { Pill } from 'lucide-react';
import { cn } from '@/lib/utils';
import { NO_PRESCRIPTION_TEXT } from '@/lib/noPrescription';

/** Aviso "o Soliv não receita medicamentos" (texto em `@/lib/noPrescription`). */
interface NoPrescriptionNoticeProps {
  userType: 'patient' | 'psychologist';
  /** "banner": faixa no topo do chat; "inline": texto pequeno em cartões e telas. */
  variant?: 'banner' | 'inline';
  className?: string;
}

const NoPrescriptionNotice = ({ userType, variant = 'inline', className }: NoPrescriptionNoticeProps) => (
  <p
    role="note"
    data-testid="no-prescription-notice"
    className={cn(
      'flex items-start gap-2 text-xs',
      variant === 'banner' ? 'border-b border-border bg-muted/40 px-4 py-2 text-muted-foreground' : 'text-muted-foreground',
      className,
    )}
  >
    <Pill className="mt-0.5 h-3.5 w-3.5 shrink-0" aria-hidden="true" />
    <span>{NO_PRESCRIPTION_TEXT[userType]}</span>
  </p>
);

export default NoPrescriptionNotice;

import { useEffect, useState } from 'react';
import { MessageSquareOff } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import BlockDurationPicker from '@/components/admin/BlockDurationPicker';
import {
  describeBlockDuration,
  EMPTY_BLOCK_DURATION,
  toBlockChoice,
  type BlockDurationChoice,
} from '@/utils/psychologistBlock';

interface Props {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  authorName: string;
  /** Abriu logo depois de excluir um depoimento do autor. */
  afterDelete?: boolean;
  saving?: boolean;
  onConfirm: (choice: BlockDurationChoice, reason: string) => Promise<boolean>;
}

/**
 * Impede o paciente de criar depoimentos por um período. Ele continua lendo
 * os depoimentos; ao tentar criar, vê um aviso genérico com a data do fim.
 */
const BlockTestimonialsModal = ({ open, onOpenChange, authorName, afterDelete, saving, onConfirm }: Props) => {
  const [duration, setDuration] = useState(EMPTY_BLOCK_DURATION);
  const [reason, setReason] = useState('');
  const choice = toBlockChoice(duration);

  useEffect(() => {
    if (open) {
      setDuration(EMPTY_BLOCK_DURATION);
      setReason('');
    }
  }, [open]);

  const confirm = async () => {
    if (!choice) return;
    const ok = await onConfirm(choice, reason);
    if (ok) onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <MessageSquareOff className="h-4 w-4" />
            Bloquear novos depoimentos?
          </DialogTitle>
          <DialogDescription>
            {afterDelete ? 'Depoimento excluído. ' : ''}
            Se quiser, impeça {authorName} de criar depoimentos por um tempo. A pessoa continua lendo os depoimentos
            dos grupos; ao tentar criar, vê um aviso de que o depoimento fugiu dos padrões do app e até quando vale o
            bloqueio.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <BlockDurationPicker value={duration} onChange={setDuration} />
          <div className="space-y-2">
            <Label htmlFor="testimonial-block-reason">Anotação interna (opcional)</Label>
            <Textarea
              id="testimonial-block-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="Ex.: palavrões e conteúdo fora do contexto do grupo. O paciente não vê este texto."
              maxLength={2000}
              rows={3}
            />
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            {afterDelete ? 'Não bloquear' : 'Cancelar'}
          </Button>
          <Button variant="destructive" onClick={confirm} disabled={!choice || saving}>
            {saving
              ? 'Bloqueando...'
              : `Bloquear${choice ? ` (${describeBlockDuration(choice)?.toLowerCase()})` : ''}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default BlockTestimonialsModal;

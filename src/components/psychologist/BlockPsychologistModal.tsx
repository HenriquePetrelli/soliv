import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Ban, Unlock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import {
  blockDurationBody,
  describeBlockDuration,
  EMPTY_BLOCK_DURATION,
  formatBlockPeriod,
  formatRemainingTime,
  toBlockChoice,
  type BlockInfo,
} from '@/utils/psychologistBlock';
import BlockDurationPicker from '@/components/admin/BlockDurationPicker';
import type { PsychologistData } from '@/hooks/usePsychologistManagement';

interface BlockPsychologistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  psychologistId: string;
  psychologistName: string;
  mode: 'block' | 'unblock';
  blockInfo?: BlockInfo | null;
  onDone: (updated?: PsychologistData) => void;
}

export const BlockPsychologistModal = ({
  open,
  onOpenChange,
  psychologistId,
  psychologistName,
  mode,
  blockInfo,
  onDone,
}: BlockPsychologistModalProps) => {
  const [duration, setDuration] = useState(EMPTY_BLOCK_DURATION);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const choice = toBlockChoice(duration);

  const submit = async () => {
    if (mode === 'block') {
      if (!choice) return toast.error('Escolha um período de bloqueio válido');
      if (reason.trim().length < 3) return toast.error('Descreva o motivo do bloqueio');
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-block-psychologist', {
        body: {
          psychologist_id: psychologistId,
          action: mode,
          ...(mode === 'block' && choice ? blockDurationBody(choice) : {}),
          reason: mode === 'block' ? reason.trim() : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.message || 'Operação concluída');
      setDuration(EMPTY_BLOCK_DURATION);
      setReason('');
      onOpenChange(false);
      onDone(data?.data);
    } catch (err: unknown) {
      toast.error(getFriendlyErrorMessage(err, 'Erro ao processar solicitação'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-md">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            {mode === 'block' ? <Ban className="h-4 w-4" /> : <Unlock className="h-4 w-4" />}
            {mode === 'block' ? 'Bloquear psicólogo' : 'Desbloquear psicólogo'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'block'
              ? `A pessoa sai da conta na hora e não consegue entrar até o fim do bloqueio. Defina o período e o motivo para ${psychologistName}.`
              : `Confirme o desbloqueio de ${psychologistName}.`}
          </DialogDescription>
        </DialogHeader>

        {mode === 'block' ? (
          <div className="space-y-4">
            <BlockDurationPicker value={duration} onChange={setDuration} />
            <div className="space-y-2">
              <Label>Motivo do bloqueio</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Descreva o motivo do bloqueio (a pessoa verá este texto)"
                maxLength={2000}
                rows={4}
              />
            </div>
          </div>
        ) : (
          <div className="space-y-3 text-sm">
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Motivo do bloqueio</p>
              <p className="mt-1">{blockInfo?.blocked_reason || 'Não informado'}</p>
            </div>
            <div className="rounded-lg border p-3 bg-muted/30">
              <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tempo restante</p>
              <p className="mt-1">
                {blockInfo?.blocked_until
                  ? `${formatBlockPeriod(blockInfo)} (${formatRemainingTime(blockInfo.blocked_until)})`
                  : 'Tempo indeterminado'}
              </p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving} variant={mode === 'block' ? 'destructive' : 'default'}>
            {saving
              ? 'Processando...'
              : mode === 'block'
                ? `Bloquear${choice ? ` (${describeBlockDuration(choice)?.toLowerCase()})` : ''}`
                : 'Confirmar desbloqueio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

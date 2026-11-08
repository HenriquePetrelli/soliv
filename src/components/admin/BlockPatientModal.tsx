import { useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Ban, Unlock } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import { BLOCK_DURATIONS, formatRemainingTime, type BlockInfo } from '@/utils/psychologistBlock';

interface BlockPatientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patientId: string;
  patientName: string;
  mode: 'block' | 'unblock';
  blockInfo?: BlockInfo | null;
  onDone: (updated?: unknown) => void;
}

export const BlockPatientModal = ({
  open,
  onOpenChange,
  patientId,
  patientName,
  mode,
  blockInfo,
  onDone,
}: BlockPatientModalProps) => {
  const [duration, setDuration] = useState('');
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const submit = async () => {
    if (mode === 'block') {
      if (!duration) return toast.error('Selecione o período de bloqueio');
      if (reason.trim().length < 3) return toast.error('Descreva o motivo do bloqueio');
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-block-patient', {
        body: {
          patient_id: patientId,
          action: mode,
          duration: mode === 'block' ? duration : undefined,
          reason: mode === 'block' ? reason.trim() : undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.message || 'Operação concluída');
      setDuration('');
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
            {mode === 'block' ? 'Bloquear paciente' : 'Desbloquear paciente'}
          </DialogTitle>
          <DialogDescription>
            {mode === 'block'
              ? `Defina o período e o motivo do bloqueio de ${patientName}.`
              : `Confirme o desbloqueio de ${patientName}.`}
          </DialogDescription>
        </DialogHeader>

        {mode === 'block' ? (
          <div className="space-y-4">
            <div className="space-y-2">
              <Label>Período de bloqueio</Label>
              <Select value={duration} onValueChange={setDuration}>
                <SelectTrigger>
                  <SelectValue placeholder="Selecione o período" />
                </SelectTrigger>
                <SelectContent>
                  {BLOCK_DURATIONS.map((d) => (
                    <SelectItem key={d.value} value={d.value}>{d.label}</SelectItem>
                  ))}
                </SelectContent>
              </Select>
            </div>
            <div className="space-y-2">
              <Label>Motivo do bloqueio</Label>
              <Textarea
                value={reason}
                onChange={(e) => setReason(e.target.value)}
                placeholder="Descreva o motivo do bloqueio"
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
              <p className="mt-1">{formatRemainingTime(blockInfo?.blocked_until)}</p>
            </div>
          </div>
        )}

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving} variant={mode === 'block' ? 'destructive' : 'default'}>
            {saving ? 'Processando...' : mode === 'block' ? 'Confirmar bloqueio' : 'Confirmar desbloqueio'}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

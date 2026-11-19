import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Textarea } from '@/components/ui/textarea';
import { Progress } from '@/components/ui/progress';
import { BadgeCheck, ExternalLink, ImageOff, Loader2, SkipForward, Square, XCircle } from 'lucide-react';
import { toast } from 'sonner';
import { supabase } from '@/integrations/supabase/client';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import type { AdminPatient } from '@/hooks/usePatientManagement';
import { IDENTITY_BUCKET, parseIdentityStatus } from '@/lib/identityVerification';
import { IdentityStatusBadge } from './IdentityStatusBadge';

interface IdentityVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: AdminPatient;
  onReviewed: (patientId: string, approved: boolean) => void;
  /** Verificação em fila: posição e como pular ou encerrar. */
  routine?: { position: number; total: number; onSkip: () => void; onStop: () => void };
}

/** O que o admin confere antes de aprovar (todos obrigatórios). */
const CHECKS = [
  { key: 'legivel', label: 'A foto está nítida e o documento aparece inteiro' },
  { key: 'oficial', label: 'É um documento oficial com foto (RG, CNH, passaporte, carteira profissional)' },
  { key: 'nome', label: 'O nome no documento é o mesmo do cadastro' },
  { key: 'cpf', label: 'O CPF (quando aparece no documento) é o mesmo do cadastro' },
] as const;

const REJECTION_REASONS = [
  'A foto está ilegível ou cortada.',
  'O documento enviado não é um documento oficial com foto.',
  'O nome no documento é diferente do nome do cadastro.',
  'O CPF do documento é diferente do CPF do cadastro.',
  'O documento está vencido.',
];

const formatDateTime = (iso?: string | null) => (iso ? new Date(iso).toLocaleString('pt-BR') : '—');

const Field = ({ label, value }: { label: string; value?: string | null }) => (
  <div>
    <p className="text-xs font-medium uppercase tracking-wide text-muted-foreground">{label}</p>
    <p className="mt-0.5 text-sm break-words">{value || 'Não informado'}</p>
  </div>
);

export const IdentityVerificationDialog = ({ open, onOpenChange, patient, onReviewed, routine }: IdentityVerificationDialogProps) => {
  const [imageUrl, setImageUrl] = useState<string | null>(null);
  const [imageLoading, setImageLoading] = useState(false);
  const [checked, setChecked] = useState<Record<string, boolean>>({});
  const [rejecting, setRejecting] = useState(false);
  const [reason, setReason] = useState('');
  const [saving, setSaving] = useState(false);

  const status = parseIdentityStatus(patient.identity_status);
  const hasDocument = Boolean(patient.identity_document_path);

  // Limpa ao abrir e ao passar para o próximo da fila.
  useEffect(() => {
    setChecked({});
    setRejecting(false);
    setReason('');
  }, [open, patient.id]);

  // Link assinado e curto para a foto (o bucket é privado).
  useEffect(() => {
    let cancelled = false;
    setImageUrl(null);
    if (!open || !patient.identity_document_path) return;
    setImageLoading(true);
    supabase.storage
      .from(IDENTITY_BUCKET)
      .createSignedUrl(patient.identity_document_path, 600)
      .then(({ data, error }) => {
        if (cancelled) return;
        if (error) console.error('[identidade] erro ao abrir documento:', error);
        setImageUrl(data?.signedUrl ?? null);
      })
      .finally(() => {
        if (!cancelled) setImageLoading(false);
      });
    return () => {
      cancelled = true;
    };
  }, [open, patient.identity_document_path]);

  const allChecked = CHECKS.every((c) => checked[c.key]);

  const review = async (approve: boolean) => {
    if (saving) return;
    if (!approve && !reason.trim()) {
      toast.error('Escolha ou escreva o motivo da recusa.');
      return;
    }
    setSaving(true);
    try {
      const { error } = await supabase.rpc('review_patient_identity', {
        p_patient_id: patient.id,
        p_approve: approve,
        p_reason: approve ? undefined : reason.trim(),
      });
      if (error) throw error;
      toast.success(approve ? `Identidade de ${patient.full_name} confirmada` : `Identidade de ${patient.full_name} recusada`);
      onReviewed(patient.id, approve);
    } catch (err) {
      toast.error(getFriendlyErrorMessage(err, 'Não foi possível salvar a verificação.'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!saving) onOpenChange(o); }}>
      <DialogContent className="max-w-3xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Verificar identidade do paciente</DialogTitle>
          <DialogDescription>
            Compare a foto do documento com os dados do cadastro. Aprovada, a pessoa passa a usar o SOS e o agendamento.
          </DialogDescription>
        </DialogHeader>

        {routine && (
          <div className="space-y-2 rounded-lg border bg-muted/20 p-3">
            <div className="flex items-center justify-between gap-2 text-sm">
              <span className="font-medium">Fila de verificação: {routine.position} de {routine.total}</span>
              <div className="flex gap-2">
                <Button size="sm" variant="ghost" onClick={routine.onSkip} disabled={saving}>
                  <SkipForward className="mr-1 h-4 w-4" /> Pular
                </Button>
                <Button size="sm" variant="ghost" onClick={routine.onStop} disabled={saving}>
                  <Square className="mr-1 h-4 w-4" /> Encerrar
                </Button>
              </div>
            </div>
            <Progress value={((routine.position - 1) / Math.max(routine.total, 1)) * 100} />
          </div>
        )}

        <div className="grid gap-4 md:grid-cols-2">
          {/* Documento */}
          <div className="space-y-2">
            <p className="text-sm font-medium">Documento enviado</p>
            <div className="flex min-h-[220px] items-center justify-center overflow-hidden rounded-lg border bg-muted/30">
              {imageLoading ? (
                <Loader2 className="h-6 w-6 animate-spin text-muted-foreground" />
              ) : imageUrl ? (
                <a href={imageUrl} target="_blank" rel="noopener noreferrer" title="Abrir em tamanho real">
                  <img src={imageUrl} alt={`Documento de ${patient.full_name}`} className="max-h-[360px] w-auto object-contain" />
                </a>
              ) : (
                <div className="flex flex-col items-center gap-2 p-6 text-center text-sm text-muted-foreground">
                  <ImageOff className="h-6 w-6" />
                  {hasDocument ? 'Não foi possível abrir a imagem.' : 'O paciente ainda não enviou o documento.'}
                </div>
              )}
            </div>
            {imageUrl && (
              <Button asChild variant="link" size="sm" className="px-0">
                <a href={imageUrl} target="_blank" rel="noopener noreferrer">
                  <ExternalLink className="mr-1 h-3.5 w-3.5" /> Abrir em tamanho real
                </a>
              </Button>
            )}
          </div>

          {/* Cadastro */}
          <div className="space-y-4">
            <div className="flex items-center justify-between gap-2">
              <p className="text-sm font-medium">Dados do cadastro</p>
              <IdentityStatusBadge patient={patient} />
            </div>
            <div className="grid grid-cols-1 gap-3 rounded-lg border p-3 sm:grid-cols-2">
              <Field label="Nome completo" value={patient.full_name} />
              <Field label="CPF" value={patient.cpf} />
              <Field label="E-mail" value={patient.email} />
              <Field label="Telefone" value={patient.phone} />
              <Field label="Cidade" value={[patient.city, patient.state].filter(Boolean).join(' - ')} />
              <Field label="Enviado em" value={formatDateTime(patient.identity_submitted_at)} />
            </div>
            {status === 'recusado' && patient.identity_rejection_reason && (
              <p className="rounded-md border border-destructive/30 bg-destructive/10 p-2 text-xs">
                Última recusa: {patient.identity_rejection_reason}
              </p>
            )}
          </div>
        </div>

        {hasDocument && !rejecting && (
          <div className="space-y-3 rounded-lg border p-3">
            <p className="text-sm font-medium">Antes de aprovar, confira:</p>
            {CHECKS.map((c) => (
              <label key={c.key} className="flex cursor-pointer items-start gap-2 text-sm">
                <Checkbox
                  checked={!!checked[c.key]}
                  onCheckedChange={(v) => setChecked((prev) => ({ ...prev, [c.key]: v === true }))}
                  className="mt-0.5"
                />
                <span>{c.label}</span>
              </label>
            ))}
          </div>
        )}

        {rejecting && (
          <div className="space-y-3 rounded-lg border border-destructive/30 p-3">
            <p className="text-sm font-medium">Motivo da recusa (o paciente verá esta mensagem)</p>
            <div className="flex flex-wrap gap-2">
              {REJECTION_REASONS.map((r) => (
                <Button key={r} type="button" size="sm" variant={reason === r ? 'default' : 'outline'} className="h-auto whitespace-normal py-1 text-left text-xs" onClick={() => setReason(r)}>
                  {r}
                </Button>
              ))}
            </div>
            <Textarea value={reason} onChange={(e) => setReason(e.target.value.slice(0, 500))} placeholder="Ou escreva o motivo" rows={3} />
          </div>
        )}

        <div className="flex flex-col gap-2 border-t pt-4 sm:flex-row">
          {rejecting ? (
            <>
              <Button variant="outline" className="flex-1" onClick={() => setRejecting(false)} disabled={saving}>
                Voltar
              </Button>
              <Button variant="destructive" className="flex-1" onClick={() => review(false)} disabled={saving || !reason.trim()}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <XCircle className="mr-2 h-4 w-4" />}
                Confirmar recusa
              </Button>
            </>
          ) : (
            <>
              <Button variant="outline" className="flex-1" onClick={() => setRejecting(true)} disabled={saving || !hasDocument}>
                <XCircle className="mr-2 h-4 w-4" /> Recusar
              </Button>
              <Button className="flex-1 bg-success text-success-foreground hover:bg-success/90" onClick={() => review(true)} disabled={saving || !hasDocument || !allChecked}>
                {saving ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <BadgeCheck className="mr-2 h-4 w-4" />}
                {status === 'aprovado' ? 'Confirmar de novo' : 'Aprovar identidade'}
              </Button>
            </>
          )}
        </div>
        {hasDocument && !rejecting && !allChecked && (
          <p className="text-center text-xs text-muted-foreground">Marque todos os itens acima para aprovar.</p>
        )}
      </DialogContent>
    </Dialog>
  );
};

import { useEffect, useRef, useState } from 'react';
import { AlertTriangle, CheckCircle2, Clock, IdCard, ImagePlus, Loader2, Phone, ShieldCheck } from 'lucide-react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import {
  IDENTITY_BUCKET,
  identityDocumentPath,
  validateIdentityFile,
  type IdentityPromptReason,
  type IdentityStatus,
} from '@/lib/identityVerification';

interface IdentityVerificationModalProps {
  open: boolean;
  reason: IdentityPromptReason;
  status: IdentityStatus;
  rejectionReason: string | null;
  userId: string;
  onSubmitted: () => Promise<void> | void;
  onClose: () => void;
}

const TITLES: Record<IdentityPromptReason, string> = {
  first_login: 'Confirme sua identidade',
  first_plan: 'Seu plano está ativo: confirme sua identidade',
  sos: 'Confirme sua identidade para usar o SOS',
  appointment: 'Confirme sua identidade para agendar consultas',
  manual: 'Confirme sua identidade',
};

const IdentityVerificationModal = ({ open, reason, status, rejectionReason, userId, onSubmitted, onClose }: IdentityVerificationModalProps) => {
  const [file, setFile] = useState<File | null>(null);
  const [preview, setPreview] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [sending, setSending] = useState(false);
  const [sent, setSent] = useState(false);
  const inputRef = useRef<HTMLInputElement>(null);

  useEffect(() => {
    if (!file) {
      setPreview(null);
      return;
    }
    const url = URL.createObjectURL(file);
    setPreview(url);
    return () => URL.revokeObjectURL(url);
  }, [file]);

  const handlePick = (picked: File | undefined) => {
    setError(null);
    if (!picked) return;
    const problem = validateIdentityFile(picked);
    if (problem) {
      setFile(null);
      setError(problem);
      return;
    }
    setFile(picked);
  };

  const handleSubmit = async () => {
    if (!file || sending) return;
    setSending(true);
    setError(null);
    try {
      const path = identityDocumentPath(userId, file);
      const { error: uploadError } = await supabase.storage
        .from(IDENTITY_BUCKET)
        .upload(path, file, { contentType: file.type || 'image/jpeg', upsert: false });
      if (uploadError) throw uploadError;
      const { error: rpcError } = await supabase.rpc('submit_patient_identity', { p_document_path: path });
      if (rpcError) throw rpcError;
      setSent(true);
      await onSubmitted();
    } catch (err) {
      console.error('[identidade] erro ao enviar documento:', err);
      setError(getFriendlyErrorMessage(err, 'Não foi possível enviar o documento. Tente de novo.'));
    } finally {
      setSending(false);
    }
  };

  const blockedAction = reason === 'sos' || reason === 'appointment';
  const showPending = sent || status === 'pendente';
  const showApproved = !sent && status === 'aprovado';

  return (
    <Dialog open={open} onOpenChange={(o) => { if (!o && !sending) onClose(); }}>
      <DialogContent className="max-w-md max-h-[90vh] overflow-y-auto">
        {showPending ? (
          <>
            <DialogHeader>
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden="true">
                {sent ? <CheckCircle2 className="h-7 w-7" /> : <Clock className="h-7 w-7" />}
              </div>
              <DialogTitle className="text-center">
                {sent ? 'Documento enviado!' : 'Sua identidade está em análise'}
              </DialogTitle>
              <DialogDescription className="text-center">
                Verificaremos sua identidade em até 24 horas. Você receberá uma notificação assim que ela for confirmada,
                e então poderá usar o SOS e o agendamento de consultas normalmente.
              </DialogDescription>
            </DialogHeader>
            {blockedAction && reason === 'sos' && <CrisisHelp />}
            <DialogFooter>
              <Button className="w-full" onClick={onClose}>Entendi</Button>
            </DialogFooter>
          </>
        ) : showApproved ? (
          <>
            <DialogHeader>
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-success/15 text-success" aria-hidden="true">
                <ShieldCheck className="h-7 w-7" />
              </div>
              <DialogTitle className="text-center">Identidade confirmada</DialogTitle>
              <DialogDescription className="text-center">O SOS e o agendamento de consultas estão liberados.</DialogDescription>
            </DialogHeader>
            <DialogFooter>
              <Button className="w-full" onClick={onClose}>Fechar</Button>
            </DialogFooter>
          </>
        ) : (
          <>
            <DialogHeader>
              <div className="mx-auto mb-2 flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden="true">
                <IdCard className="h-7 w-7" />
              </div>
              <DialogTitle className="text-center">{TITLES[reason]}</DialogTitle>
              <DialogDescription className="text-center">
                Envie uma foto do seu documento com foto (RG, CNH ou outro documento oficial). Isso protege você e os
                psicólogos que atendem na Soliv.
              </DialogDescription>
            </DialogHeader>

            <div className="flex gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm" role="alert">
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-warning" aria-hidden="true" />
              <p>
                <strong>Atenção:</strong> você só conseguirá usar o <strong>SOS</strong> e o{' '}
                <strong>agendamento de consultas</strong> depois que sua identidade for autenticada.
              </p>
            </div>

            {status === 'recusado' && (
              <div className="rounded-lg border border-destructive/30 bg-destructive/10 p-3 text-sm">
                <p className="font-medium text-destructive">Não conseguimos confirmar o documento enviado.</p>
                {rejectionReason && <p className="mt-1 text-muted-foreground">Motivo: {rejectionReason}</p>}
                <p className="mt-1 text-muted-foreground">Envie uma nova foto, por favor.</p>
              </div>
            )}

            <input
              ref={inputRef}
              type="file"
              accept="image/*"
              className="hidden"
              onChange={(e) => {
                handlePick(e.target.files?.[0]);
                e.target.value = '';
              }}
            />

            <button
              type="button"
              onClick={() => inputRef.current?.click()}
              disabled={sending}
              className="flex w-full flex-col items-center justify-center gap-2 rounded-xl border-2 border-dashed border-border bg-muted/30 p-4 text-sm text-muted-foreground transition-colors hover:bg-muted/50"
            >
              {preview ? (
                <img src={preview} alt="Prévia do documento" className="max-h-48 w-auto rounded-md object-contain" />
              ) : (
                <>
                  <ImagePlus className="h-8 w-8" aria-hidden="true" />
                  <span className="font-medium text-foreground">Anexar foto do documento</span>
                  <span className="text-xs">JPG, PNG, WEBP ou HEIC, até 10 MB</span>
                </>
              )}
            </button>
            {preview && (
              <Button variant="link" size="sm" className="-mt-2 self-center" onClick={() => inputRef.current?.click()} disabled={sending}>
                Trocar imagem
              </Button>
            )}

            {error && <p className="text-sm text-destructive" role="alert">{error}</p>}

            {reason === 'sos' && <CrisisHelp />}

            <DialogFooter className="flex-col gap-2 sm:flex-col sm:space-x-0">
              <Button className="w-full" onClick={handleSubmit} disabled={!file || sending}>
                {sending ? <Loader2 className="mr-2 h-4 w-4 animate-spin" /> : <ShieldCheck className="mr-2 h-4 w-4" />}
                {sending ? 'Enviando...' : 'Enviar para verificação'}
              </Button>
              <Button variant="ghost" className="w-full text-muted-foreground" onClick={onClose} disabled={sending}>
                Não autenticar agora
              </Button>
            </DialogFooter>
          </>
        )}
      </DialogContent>
    </Dialog>
  );
};

/** No SOS, a pessoa pode estar em crise: a ajuda gratuita fica à mão. */
const CrisisHelp = () => (
  <div className="rounded-lg border bg-muted/30 p-3 text-sm">
    <p className="text-muted-foreground">Precisa de ajuda agora? Estas linhas são gratuitas e funcionam 24 horas:</p>
    <div className="mt-2 grid gap-2">
      <Button asChild variant="outline" className="w-full">
        <a href="tel:188">
          <Phone className="h-4 w-4" />
          Ligar para o CVV (188)
        </a>
      </Button>
      <p className="text-center text-xs text-muted-foreground">
        Em risco imediato de vida, ligue para o{' '}
        <a href="tel:192" className="font-medium text-primary underline-offset-2 hover:underline">SAMU 192</a>.
      </p>
    </div>
  </div>
);

export default IdentityVerificationModal;

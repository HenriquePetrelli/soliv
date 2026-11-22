import { useState } from 'react';
import { Download, Trash2 } from 'lucide-react';
import { collectMyData, downloadJson } from '@/lib/exportMyData';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import {
  AlertDialog,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getFriendlyErrorMessage, getFunctionErrorMessage } from '@/utils/errorMessage';

const CONFIRMATION_WORD = 'EXCLUIR';

/**
 * Self-service account deletion (LGPD art. 18, VI; required by both app
 * stores). Requires the current password — a live session alone (stolen
 * token, unlocked shared phone) must not be enough to erase someone — and
 * typing EXCLUIR. The work happens in the delete-own-account edge function,
 * which cancels any subscription before deleting anything.
 */
export const DeleteAccountCard = ({ email }: { email: string }) => {
  const { toast } = useToast();
  const [open, setOpen] = useState(false);
  const [password, setPassword] = useState('');
  const [confirmation, setConfirmation] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [deleting, setDeleting] = useState(false);
  const [exporting, setExporting] = useState(false);

  const handleExport = async () => {
    setExporting(true);
    try {
      const { data: { user } } = await supabase.auth.getUser();
      if (!user) return;
      const payload = await collectMyData(user.id, user.email ?? null);
      downloadJson(`soliv-meus-dados-${new Date().toISOString().slice(0, 10)}.json`, payload);
    } catch (e) {
      console.error('Erro ao exportar dados:', e);
      toast({ title: 'Não foi possível gerar o arquivo', description: 'Tente de novo em instantes.', variant: 'destructive' });
    } finally {
      setExporting(false);
    }
  };

  const reset = () => {
    setPassword('');
    setConfirmation('');
    setError(null);
  };

  const handleDelete = async () => {
    setError(null);
    setDeleting(true);
    try {
      const { error: reauthError } = await supabase.auth.signInWithPassword({ email, password });
      if (reauthError) {
        setError('Senha incorreta.');
        return;
      }

      const { data, error: fnError } = await supabase.functions.invoke('delete-own-account', {
        body: { confirmation: confirmation.trim().toUpperCase() },
      });
      if (fnError || !data?.success) {
        const fallback = 'Não foi possível excluir a conta agora. Tente de novo em instantes.';
        setError(
          fnError
            ? await getFunctionErrorMessage(fnError, fallback)
            : getFriendlyErrorMessage(data?.error, fallback),
        );
        return;
      }

      try {
        localStorage.clear();
      } catch {
        // nothing else to clean
      }
      await supabase.auth.signOut().catch(() => {});
      toast({ title: 'Conta excluída', description: 'Seus dados foram apagados.' });
      window.location.href = '/';
    } finally {
      setDeleting(false);
    }
  };

  return (
    <Card className="border-destructive/30">
      <CardHeader>
        <CardTitle>Seus dados</CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        <p className="text-sm text-muted-foreground">
          Baixe uma cópia de tudo o que você registrou no Soliv, num arquivo que outros serviços conseguem ler.
        </p>
        <Button variant="outline" className="w-full" onClick={handleExport} disabled={exporting}>
          <Download size={16} className="mr-2" />
          {exporting ? 'Gerando arquivo...' : 'Baixar meus dados'}
        </Button>

        <div className="border-t pt-4" />
        <h3 className="font-semibold text-destructive">Excluir conta</h3>
        <p className="text-sm text-muted-foreground">
          Apaga definitivamente sua conta e seus dados: diário, humor, plano de segurança, depoimentos, conversas,
          histórico de consultas e de SOS. Se você tiver uma assinatura ativa, ela é cancelada. Não dá para desfazer.
        </p>
        <Button variant="outline" className="w-full border-destructive/40 text-destructive hover:bg-destructive/5" onClick={() => setOpen(true)}>
          <Trash2 size={16} className="mr-2" />
          Excluir minha conta
        </Button>
      </CardContent>

      <AlertDialog
        open={open}
        onOpenChange={(next) => {
          if (deleting) return;
          setOpen(next);
          if (!next) reset();
        }}
      >
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir sua conta de vez?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os seus dados serão apagados e a assinatura, se houver, será cancelada. Essa ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>

          <form
            className="space-y-3"
            onSubmit={(e) => {
              e.preventDefault();
              void handleDelete();
            }}
          >
            <div className="space-y-1.5">
              <Label htmlFor="delete-password">Sua senha</Label>
              <Input
                id="delete-password"
                type="password"
                autoComplete="current-password"
                value={password}
                onChange={(e) => setPassword(e.target.value)}
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="delete-confirmation">Digite {CONFIRMATION_WORD} para confirmar</Label>
              <Input
                id="delete-confirmation"
                value={confirmation}
                onChange={(e) => setConfirmation(e.target.value)}
                autoCapitalize="characters"
                autoComplete="off"
              />
            </div>
            {error && (
              <p role="alert" className="text-sm text-destructive">
                {error}
              </p>
            )}
            <AlertDialogFooter>
              <AlertDialogCancel type="button" disabled={deleting}>
                Cancelar
              </AlertDialogCancel>
              <Button
                type="submit"
                variant="destructive"
                disabled={deleting || !password || confirmation.trim().toUpperCase() !== CONFIRMATION_WORD}
              >
                {deleting ? 'Excluindo...' : 'Excluir conta'}
              </Button>
            </AlertDialogFooter>
          </form>
        </AlertDialogContent>
      </AlertDialog>
    </Card>
  );
};

export default DeleteAccountCard;

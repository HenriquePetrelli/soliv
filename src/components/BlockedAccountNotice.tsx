import { useEffect, useState } from 'react';
import { Ban } from 'lucide-react';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import {
  dismissBlockedNotice,
  formatRemainingTime,
  getBlockedNotice,
  subscribeBlockedNotice,
  type BlockInfo,
} from '@/utils/psychologistBlock';

/**
 * Aviso de conta bloqueada pelo admin: por quanto tempo e o motivo. Aparece
 * na tela de login (ao tentar entrar) e quando a pessoa é tirada da conta com
 * o app aberto; fica aberto até ela fechar.
 */
const BlockedAccountNotice = () => {
  const [notice, setNotice] = useState<BlockInfo | null>(getBlockedNotice);

  useEffect(() => subscribeBlockedNotice(setNotice), []);

  const until = notice?.blocked_until ? new Date(notice.blocked_until) : null;

  return (
    <AlertDialog open={!!notice} onOpenChange={(open) => !open && dismissBlockedNotice()}>
      <AlertDialogContent className="max-w-md">
        <AlertDialogHeader>
          <AlertDialogTitle className="flex items-center gap-2">
            <Ban className="h-5 w-5 text-destructive" aria-hidden />
            Conta bloqueada
          </AlertDialogTitle>
          <AlertDialogDescription>
            Sua conta foi bloqueada pela equipe do Soliv e não pode ser usada durante o bloqueio.
          </AlertDialogDescription>
        </AlertDialogHeader>
        <div className="space-y-3 text-sm">
          <div className="rounded-lg border p-3 bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tempo de bloqueio</p>
            {until ? (
              <p className="mt-1" data-testid="blocked-notice-period">
                Até {until.toLocaleString('pt-BR', { dateStyle: 'long', timeStyle: 'short' })}{' '}
                <span className="text-muted-foreground">({formatRemainingTime(notice?.blocked_until)} restantes)</span>
              </p>
            ) : (
              <p className="mt-1" data-testid="blocked-notice-period">Por tempo indeterminado</p>
            )}
          </div>
          <div className="rounded-lg border p-3 bg-muted/30">
            <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Motivo</p>
            <p className="mt-1 whitespace-pre-wrap break-words" data-testid="blocked-notice-reason">
              {notice?.blocked_reason || 'Não informado'}
            </p>
          </div>
          <p className="text-muted-foreground">Se achar que é um engano, fale com o suporte.</p>
        </div>
        <AlertDialogFooter>
          <AlertDialogAction onClick={dismissBlockedNotice}>Entendi</AlertDialogAction>
        </AlertDialogFooter>
      </AlertDialogContent>
    </AlertDialog>
  );
};

export default BlockedAccountNotice;

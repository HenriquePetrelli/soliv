import { useEffect, useState } from 'react';
import { canSellSubscriptionsHere } from '@/lib/storePolicy';
import { useNavigate } from 'react-router-dom';
import { CreditCard, Sparkles } from 'lucide-react';
import { Button } from '@/components/ui/button';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { EXTRA_DETAILS, EXTRA_NAMES, formatCents, hasPaidPlan, type ExtraKind } from '@/lib/plans';

interface ExtraPurchaseDialogProps {
  kind: ExtraKind;
  open: boolean;
  onOpenChange: (open: boolean) => void;
  /** Por que a cota não está disponível (ex.: "Você já usou a consulta do mês"). */
  reason?: string | null;
  /** Compra aprovada no cartão salvo: o crédito já está disponível. */
  onPurchased: () => void;
}

const newRequestId = () =>
  typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : undefined;

/**
 * Oferece o atendimento avulso (ou um plano) quando a cota acabou ou não
 * existe. Com cartão salvo no Stripe, cobra na hora; sem cartão, abre a página
 * de pagamento do Stripe uma vez (o cartão fica salvo para as próximas).
 */
const ExtraPurchaseDialog = ({ kind, open, onOpenChange, reason, onPurchased }: ExtraPurchaseDialogProps) => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const { subscribed, subscriptionTier, extraPrices, checkSubscription } = useSubscription();
  const [buying, setBuying] = useState(false);
  // Um id por compra: dois toques (ou rede ruim) não cobram duas vezes.
  const [requestId, setRequestId] = useState(newRequestId);
  useEffect(() => {
    if (open) setRequestId(newRequestId());
  }, [open]);

  const paid = hasPaidPlan(subscribed, subscriptionTier);
  const price = formatCents(extraPrices[kind]);

  const buy = async () => {
    setBuying(true);
    try {
      const { data, error } = await supabase.functions.invoke('buy-extra', {
        body: { action: 'buy', kind, request_id: requestId },
      });
      if (error) throw error;
      if (data?.url) {
        window.location.href = data.url;
        return;
      }
      if (data?.ok) {
        await checkSubscription();
        toast({ title: `${EXTRA_NAMES[kind]} comprado`, description: `Cobramos ${price} no seu cartão.` });
        onOpenChange(false);
        onPurchased();
        return;
      }
      if (data?.error_code === 'blocked') {
        toast({ title: 'Conta bloqueada para SOS', description: 'Fale com o suporte.', variant: 'destructive' });
        return;
      }
      throw new Error(data?.error ?? 'Falha na compra');
    } catch (err) {
      console.error('Erro ao comprar avulso', err);
      toast({ title: 'Não foi possível concluir a compra', description: 'Nada foi cobrado. Tente de novo.', variant: 'destructive' });
    } finally {
      setBuying(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle>{kind === 'sos' ? 'SOS indisponível no seu plano' : 'Consulta indisponível no seu plano'}</DialogTitle>
          <DialogDescription>
            {reason ??
              (paid
                ? 'Você já usou o que o seu plano inclui neste mês.'
                : 'Você está no Plano Grátis, que não inclui atendimento com psicólogo.')}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-3">
          <div className="rounded-xl border border-primary/30 bg-primary/5 p-4">
            <div className="flex items-baseline justify-between gap-3">
              <span className="font-semibold text-foreground">{EXTRA_NAMES[kind]}</span>
              <span className="text-lg font-bold text-foreground" data-testid="extra-price">{price}</span>
            </div>
            <p className="mt-1 text-sm text-muted-foreground">{EXTRA_DETAILS[kind]}</p>
            <p className="mt-2 text-xs text-muted-foreground">
              {paid ? 'Preço de assinante.' : 'Assinantes pagam menos no avulso.'} A cobrança é feita na hora no cartão
              cadastrado; se não houver cartão, abrimos a página de pagamento.
            </p>
          </div>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button
            variant="outline"
            onClick={() => {
              onOpenChange(false);
              navigate('/subscription-plans');
            }}
          >
            <Sparkles className="mr-2 h-4 w-4" />
            {paid || !canSellSubscriptionsHere() ? 'Ver planos' : 'Assinar um plano'}
          </Button>
          <Button onClick={buy} disabled={buying}>
            <CreditCard className="mr-2 h-4 w-4" />
            {buying ? 'Processando...' : `Comprar por ${price}`}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default ExtraPurchaseDialog;

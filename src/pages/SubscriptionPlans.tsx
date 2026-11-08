import { EXTRA_NAMES, EXTRA_PRICES_CENTS, PLAN_LIST, formatCents, planTierRank as tierRank } from "@/lib/plans";
import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/dialog";
import { Check, AlertTriangle, Crown, CreditCard } from "lucide-react";
import PageHeader from "@/components/PageHeader";
import { supabase } from "@/integrations/supabase/client";
import { useToast } from "@/hooks/use-toast";
import { useSubscription } from "@/contexts/SubscriptionContext";

const formatBRL = (cents: number) =>
  (cents / 100).toLocaleString("pt-BR", { style: "currency", currency: "BRL" });
import { cancelledPlanLabel, formatBrazilDate } from "@/lib/subscriptionStatus";
const formatDay = (iso: string | null) => (iso ? new Date(iso).toLocaleDateString("pt-BR") : "");

/**
 * Checkout e portal do Stripe não abrem dentro de iframe (pré-visualização da
 * Lovable): ali abre em outra aba. No app, na mesma aba — o Safari do iPhone
 * bloqueia window.open depois de uma chamada assíncrona.
 */
const goToStripe = (url: string) => {
  if (window.self !== window.top) window.open(url, "_blank");
  else window.location.assign(url);
};

interface ChangePreview {
  direction: "upgrade" | "downgrade";
  amount_due?: number;
  proration_date?: number;
  renews_on?: string;
  effective_on?: string;
}

const SubscriptionPlans = () => {
  const navigate = useNavigate();
  const { toast } = useToast();
  const {
    subscribed,
    subscriptionTier,
    subscriptionEnd,
    checkSubscription,
    entitlementSource,
    organizationName,
    personalSubscriptionTier,
    cancelAtPeriodEnd,
    pendingTier,
    pendingFrom,
    paymentIssue,
    extraSubscriptions,
  } = useSubscription();
  // B2B: o plano vem da empresa; não há o que pagar, cancelar ou trocar para baixo.
  const fromCompany = entitlementSource === 'organization';
  const [loading, setLoading] = useState<string | null>(null);
  const [showCancelModal, setShowCancelModal] = useState(false);
  // Troca de plano de quem já assina (manage-subscription), com prévia do valor.
  const [changeTarget, setChangeTarget] = useState<string | null>(null);
  const [changePreview, setChangePreview] = useState<ChangePreview | null>(null);
  // Prévia do cancelamento: no prazo de arrependimento (7 dias) acaba na hora
  // e devolve o valor; fora dele, o plano segue até o fim do período pago.
  const [cancelPreview, setCancelPreview] = useState<{ mode: "immediate" | "period_end"; accessUntil: string | null; futureAppointments: number } | null>(null);
  const [refundPreview, setRefundPreview] = useState<{ amount: number; deadline: string | null } | null>(null);

  useEffect(() => {
    if (!showCancelModal) return;
    let cancelled = false;
    setRefundPreview(null);
    setCancelPreview(null);
    supabase.functions
      .invoke('cancel-subscription', { body: { preview: true } })
      .then(({ data }) => {
        if (cancelled || !data) return;
        if (data.refund_eligible) setRefundPreview({ amount: data.refund_amount, deadline: data.refund_deadline });
        if (data.mode) {
          setCancelPreview({
            mode: data.mode,
            accessUntil: data.access_until ?? null,
            futureAppointments: Number(data.future_appointments ?? 0),
          });
        }
      })
      .catch(() => {});
    return () => {
      cancelled = true;
    };
  }, [showCancelModal]);

  const plans = PLAN_LIST;

  const handleSubscribe = async (plan: typeof plans[0]) => {
    try {
      setLoading(plan.id);
      
      const { data: session } = await supabase.auth.getSession();
      if (!session?.session) {
        toast({
          title: "Erro",
          description: "Você precisa estar logado para assinar um plano",
          variant: "destructive",
        });
        navigate("/");
        return;
      }

      const { data, error } = await supabase.functions.invoke('create-checkout', {
        body: {
          plan: plan.name,
        },
      });

      if (error) {
        console.error('Error creating checkout:', error);
        toast({
          title: "Erro",
          description: "Erro ao criar sessão de pagamento",
          variant: "destructive",
        });
        return;
      }

      if (data?.error_code === 'covered_by_organization') {
        toast({ title: "Seu plano já vem da empresa", description: "Esse plano já está incluído no benefício da sua empresa. Não há o que pagar." });
        await checkSubscription({ force: true });
        return;
      }

      if (data?.error_code === 'already_subscribed') {
        toast({ title: "Você já tem uma assinatura", description: "Atualizamos a tela. Para mudar de plano, use o botão do plano." });
        await checkSubscription({ force: true });
        return;
      }

      if (data?.url) goToStripe(data.url);
    } catch (error) {
      console.error('Error subscribing:', error);
      toast({
        title: "Erro",
        description: "Erro inesperado ao processar assinatura",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  const handleCancelSubscription = async () => {
    try {
      setLoading("cancel");
      
      const { data, error } = await supabase.functions.invoke('cancel-subscription');

      if (error) {
        console.error('Error cancelling subscription:', error);
        toast({
          title: "Erro",
          description: "Erro ao cancelar assinatura",
          variant: "destructive",
        });
        return;
      }

      if (data?.success) {
        if (data.refund_status === "refunded") {
          toast({
            title: "Assinatura cancelada",
            description: `Devolvemos ${formatBRL(data.refunded_amount)} no seu cartão. O valor aparece na fatura em até 10 dias úteis.`,
          });
        } else if (data.refund_status === "failed") {
          toast({
            title: "Assinatura cancelada",
            description: "Não conseguimos concluir o reembolso agora. Nossa equipe vai finalizar a devolução; se preferir, fale com o suporte.",
            variant: "destructive",
          });
        } else if (data.mode === "period_end" && data.access_until) {
          toast({
            title: "Assinatura cancelada",
            description: `Você continua com o plano até ${formatDay(data.access_until)}. Não haverá nova cobrança.`,
          });
        } else {
          toast({ title: "Assinatura cancelada" });
        }
        await checkSubscription({ force: true });
      }
    } catch (error) {
      console.error('Error cancelling subscription:', error);
      toast({
        title: "Erro",
        description: "Erro inesperado ao cancelar assinatura",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
      setShowCancelModal(false);
    }
  };

  const manage = async (body: Record<string, unknown>) => {
    const { data, error } = await supabase.functions.invoke('manage-subscription', { body });
    if (error) throw error;
    return data;
  };

  const openChange = async (planName: string) => {
    setChangeTarget(planName);
    setChangePreview(null);
    try {
      const data = await manage({ action: 'preview_change', plan: planName });
      if (data?.direction) setChangePreview(data);
      else {
        setChangeTarget(null);
        toast({
          title: data?.error_code === 'payment_issue' ? "Atualize o pagamento primeiro" : "Não foi possível mudar de plano agora",
          description: data?.error_code === 'payment_issue' ? "A última cobrança não passou. Atualize o cartão em Gerenciar pagamento." : undefined,
          variant: "destructive",
        });
        await checkSubscription({ force: true });
      }
    } catch {
      setChangeTarget(null);
      toast({ title: "Erro", description: "Não foi possível calcular a troca de plano.", variant: "destructive" });
    }
  };

  const confirmChange = async () => {
    if (!changeTarget || !changePreview) return;
    setLoading("change");
    try {
      const data = await manage({ action: 'change_plan', plan: changeTarget, proration_date: changePreview.proration_date });
      if (data?.ok) {
        toast(
          changePreview.direction === "upgrade"
            ? { title: `Pronto! Você agora é ${changeTarget}.` }
            : { title: "Troca agendada", description: `Você passa para o ${changeTarget} em ${formatDay(data.effective_on ?? changePreview.effective_on ?? null)}.` },
        );
        setChangeTarget(null);
        await checkSubscription({ force: true });
      } else if (data?.error_code === 'payment_failed') {
        toast({
          title: "O cartão recusou a cobrança",
          description: "Nada mudou na sua assinatura. Atualize o cartão em Gerenciar pagamento e tente de novo.",
          variant: "destructive",
        });
      } else {
        toast({ title: "Erro", description: "Não foi possível mudar de plano agora.", variant: "destructive" });
      }
    } catch {
      toast({ title: "Erro", description: "Não foi possível mudar de plano agora.", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const undo = async (action: 'resume' | 'keep_current', success: string) => {
    setLoading(action);
    try {
      const data = await manage({ action });
      if (!data?.ok) throw new Error(data?.error_code ?? 'failed');
      toast({ title: success });
      await checkSubscription({ force: true });
    } catch {
      toast({ title: "Erro", description: "Não foi possível concluir agora. Tente de novo.", variant: "destructive" });
    } finally {
      setLoading(null);
    }
  };

  const handleManagePayment = async () => {
    try {
      setLoading("portal");

      const { data, error } = await supabase.functions.invoke('customer-portal');

      if (error) {
        console.error('Error opening customer portal:', error);
        toast({
          title: "Erro",
          description: "Erro ao abrir o portal de pagamento",
          variant: "destructive",
        });
        return;
      }

      if (data?.url) goToStripe(data.url);
    } catch (error) {
      console.error('Error opening customer portal:', error);
      toast({
        title: "Erro",
        description: "Erro inesperado ao abrir o portal de pagamento",
        variant: "destructive",
      });
    } finally {
      setLoading(null);
    }
  };

  return (
    <div className="min-h-screen bg-background">
      <PageHeader title="Planos de Assinatura" backTo="/home" />
      <div className="max-w-4xl mx-auto p-4">



        <div className="text-center mb-16">
          <div className="mb-8">
            <h1 className="text-2xl sm:text-3xl font-bold mb-4 bg-gradient-to-r from-primary to-accent bg-clip-text text-transparent">
              Escolha seu Plano
            </h1>
            <p className="text-base text-muted-foreground max-w-2xl mx-auto leading-relaxed">
              Acesso completo aos nossos serviços de bem-estar mental com profissionais qualificados
            </p>
          </div>
          
          {fromCompany && (
            <div className="bg-gradient-to-r from-primary/5 to-accent/5 rounded-2xl p-6 border border-primary/20">
              <div className="flex flex-col items-center gap-3">
                <Badge variant="secondary" className="text-base px-5 py-2 bg-primary/10 text-primary border border-primary/20">
                  <Crown className="w-5 h-5 mr-2" />
                  Plano {subscriptionTier} pela {organizationName}
                </Badge>
                {personalSubscriptionTier ? (
                  <div role="note" className="max-w-md rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
                    Você ainda paga uma assinatura própria ({personalSubscriptionTier}). Como a empresa já cobre o seu plano,
                    você pode cancelá-la e parar de ser cobrado.
                    <Button variant="outline" size="sm" className="mt-2 w-full bg-background" onClick={() => setShowCancelModal(true)}>
                      Cancelar minha assinatura própria
                    </Button>
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">Sua empresa paga o plano. Não há cobrança para você.</p>
                )}
                <Button variant="outline" className="bg-background" onClick={() => navigate('/beneficio-empresa')}>
                  Ver benefício da empresa
                </Button>
              </div>
            </div>
          )}

          {subscribed && !fromCompany && (
            <div className="bg-gradient-to-r from-primary/5 to-accent/5 rounded-2xl p-6 sm:p-8 border border-primary/20">
              <div className="flex flex-col items-center gap-4">
                <Badge
                  variant="secondary"
                  className="text-lg px-6 py-3 bg-primary/10 text-primary border border-primary/20"
                >
                  <Crown className="w-5 h-5 mr-2" />
                  {cancelledPlanLabel(subscriptionTier, cancelAtPeriodEnd, subscriptionEnd) ?? `Plano Atual: ${subscriptionTier}`}
                </Badge>

                {paymentIssue ? (
                  <div role="alert" className="w-full max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-left text-sm text-foreground">
                    Não conseguimos cobrar a renovação. Atualize o cartão para não perder o plano — vamos tentar cobrar de novo nos próximos dias.
                  </div>
                ) : cancelAtPeriodEnd ? (
                  <div role="note" className="w-full max-w-md rounded-lg border border-warning/40 bg-warning/10 p-3 text-left text-sm text-foreground">
                    Você não será cobrado de novo. Até {formatBrazilDate(subscriptionEnd ?? "")}, tudo do {subscriptionTier} continua liberado; depois, sua conta passa para o plano grátis.
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full bg-background"
                      disabled={loading === "resume"}
                      onClick={() => undo("resume", "Pronto! Sua assinatura continua.")}
                    >
                      {loading === "resume" ? "Reativando..." : "Manter minha assinatura"}
                    </Button>
                  </div>
                ) : pendingTier ? (
                  <div role="note" className="w-full max-w-md rounded-lg border border-primary/30 bg-background p-3 text-left text-sm text-foreground">
                    A partir de {formatDay(pendingFrom)}, seu plano passa a ser {pendingTier}.
                    <Button
                      variant="outline"
                      size="sm"
                      className="mt-2 w-full"
                      disabled={loading === "keep_current"}
                      onClick={() => undo("keep_current", `Pronto! Você continua no ${subscriptionTier}.`)}
                    >
                      {loading === "keep_current" ? "Salvando..." : `Continuar no ${subscriptionTier}`}
                    </Button>
                  </div>
                ) : (
                  subscriptionEnd && <p className="text-sm text-muted-foreground">Renova em {formatDay(subscriptionEnd)}.</p>
                )}

                {extraSubscriptions > 0 && (
                  <div role="alert" className="w-full max-w-md rounded-lg border border-destructive/40 bg-destructive/10 p-3 text-left text-sm text-foreground">
                    Você tem mais de uma assinatura ativa e está sendo cobrado em dobro. Cancele a que sobrou em "Gerenciar
                    pagamento" ou fale com o suporte para receber a diferença de volta.
                  </div>
                )}

                <div className="flex flex-col sm:flex-row gap-3 w-full max-w-md">
                  <Button
                    onClick={handleManagePayment}
                    disabled={loading === "portal"}
                    variant={paymentIssue ? "default" : "outline"}
                    className={paymentIssue ? "flex-1 gap-2" : "flex-1 gap-2 bg-background hover:bg-muted"}
                  >
                    <CreditCard className="h-4 w-4" aria-hidden="true" />
                    {loading === "portal" ? "Abrindo..." : paymentIssue ? "Atualizar pagamento" : "Gerenciar pagamento"}
                  </Button>
                  {!cancelAtPeriodEnd && (
                    <Button
                      onClick={() => setShowCancelModal(true)}
                      variant="outline"
                      className="flex-1 bg-background hover:bg-muted"
                    >
                      Cancelar assinatura
                    </Button>
                  )}
                </div>
                <p className="text-xs text-muted-foreground">Cartão, faturas e recibos ficam em "Gerenciar pagamento".</p>
              </div>
            </div>
          )}
        </div>

        <div className="grid md:grid-cols-3 gap-6 max-w-6xl mx-auto">
          {plans.map((plan) => (
            <Card 
              key={plan.id} 
              className={`relative transition-all duration-300 ${
                plan.popular 
                  ? 'border-primary shadow-2xl scale-105 bg-gradient-to-b from-primary/5 to-accent/5' 
                  : 'border-border hover:border-primary/50'
              } ${
                subscriptionTier === plan.name ? 'ring-2 ring-primary shadow-primary/25' : ''
              }`}
            >
              {plan.popular && (
                <Badge className="absolute -top-3 left-1/2 transform -translate-x-1/2 bg-gradient-to-r from-primary to-accent text-primary-foreground shadow-lg">
                  <Crown className="w-4 h-4 mr-1" />
                  Mais Popular
                </Badge>
              )}
              
              <CardHeader className="text-center pb-8">
                <CardTitle className="text-2xl mb-2">{plan.name}</CardTitle>
                <div className="mb-4">
                  <div className="flex items-baseline justify-center gap-1">
                    <span className="text-4xl font-bold text-foreground">{plan.price}</span>
                    <span className="text-lg text-muted-foreground">{plan.period}</span>
                  </div>
                </div>
              </CardHeader>
              
              <CardContent className="space-y-8">
                <ul className="space-y-4">
                  {plan.features.map((feature, index) => (
                    <li key={index} className="flex items-start gap-3">
                      <div className="w-6 h-6 rounded-full bg-primary/10 flex items-center justify-center flex-shrink-0 mt-0.5">
                        <Check className="w-4 h-4 text-primary" />
                      </div>
                      <span className="text-sm leading-relaxed">{feature}</span>
                    </li>
                  ))}
                </ul>
                
                {(() => {
                  const includedByCompany = fromCompany && tierRank(plan.name) <= tierRank(subscriptionTier);
                  const isCurrent = subscribed && !fromCompany && subscriptionTier === plan.name;
                  const isScheduled = !fromCompany && pendingTier === plan.name;
                  // Quem já paga troca de plano na mesma assinatura (nunca um
                  // segundo checkout, que cobraria as duas).
                  const switchesPlan = subscribed && !fromCompany && !isCurrent;
                  const label = loading === plan.id
                    ? null
                    : includedByCompany
                      ? "Incluído no plano da empresa"
                      : isCurrent
                        ? "Plano Atual"
                        : isScheduled
                          ? `Começa em ${formatDay(pendingFrom)}`
                          : switchesPlan
                            ? `Mudar para ${plan.name}`
                            : "Assinar Agora";
                  return (
                    <Button
                      onClick={() => (switchesPlan ? openChange(plan.name) : handleSubscribe(plan))}
                      disabled={loading === plan.id || includedByCompany || isCurrent || isScheduled || (switchesPlan && paymentIssue)}
                      className={`w-full py-6 text-lg font-semibold ${
                        plan.popular ? 'bg-gradient-to-r from-primary to-accent hover:from-primary/90 hover:to-accent/90' : ''
                      }`}
                      variant={isCurrent ? "secondary" : "default"}
                      size="lg"
                    >
                      {label === null ? (
                        <div className="flex items-center gap-2">
                          <div className="animate-spin rounded-full h-4 w-4 border-b-2 border-white"></div>
                          Processando...
                        </div>
                      ) : isCurrent ? (
                        <div className="flex items-center gap-2">
                          <Crown className="w-5 h-5" />
                          {label}
                        </div>
                      ) : (
                        label
                      )}
                    </Button>
                  );
                })()}
              </CardContent>
            </Card>
          ))}
        </div>

        <section aria-labelledby="avulsos" className="mx-auto mt-10 max-w-3xl rounded-2xl border border-border bg-card p-5">
          <h2 id="avulsos" className="text-lg font-semibold text-foreground">Atendimentos avulsos</h2>
          <p className="mt-1 text-sm text-muted-foreground">
            Precisa de mais um atendimento no mês, ou não quer assinar? Compre só o que usar, cobrado na hora no cartão.
          </p>
          <table className="mt-4 w-full text-sm">
            <thead>
              <tr className="text-left text-muted-foreground">
                <th className="py-1 font-medium"></th>
                <th className="py-1 font-medium">Sem plano</th>
                <th className="py-1 font-medium">Com plano</th>
              </tr>
            </thead>
            <tbody>
              {(['sos', 'appointment'] as const).map((kind) => (
                <tr key={kind} className="border-t border-border">
                  <td className="py-2 text-foreground">{EXTRA_NAMES[kind]}</td>
                  <td className="py-2">{formatCents(EXTRA_PRICES_CENTS.free[kind])}</td>
                  <td className="py-2 font-medium text-primary">{formatCents(EXTRA_PRICES_CENTS.plan[kind])}</td>
                </tr>
              ))}
            </tbody>
          </table>
          <p className="mt-3 text-xs text-muted-foreground">
            Para comprar, toque em SOS ou em Agendar consulta quando o seu plano não tiver mais o atendimento do mês.
          </p>
        </section>

        <div className="mt-12 text-center">
          {!fromCompany && (
            <p className="mb-4 text-sm text-muted-foreground">
              Sua empresa oferece o Soliv?{' '}
              <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => navigate('/beneficio-empresa')}>
                Usar o código da empresa
              </button>
            </p>
          )}
          <Button 
            onClick={() => checkSubscription({ force: true })}
            variant="ghost"
            size="sm"
          >
            Atualizar Status da Assinatura
          </Button>
        </div>
      </div>

      {/* Cancel Confirmation Modal */}
      <Dialog open={showCancelModal} onOpenChange={setShowCancelModal}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle className="flex items-center gap-2">
              <AlertTriangle className="w-5 h-5 text-destructive" />
              Cancelar Assinatura
            </DialogTitle>
            <DialogDescription>
              {refundPreview || cancelPreview?.mode === "immediate"
                ? "O plano acaba agora e você perde o acesso aos benefícios dele."
                : cancelPreview?.accessUntil
                  ? `Seu plano continua até ${formatDay(cancelPreview.accessUntil)} e não será renovado. Até lá, você pode voltar atrás.`
                  : "Seu plano continua até o fim do período já pago e não será renovado."}
            </DialogDescription>
          </DialogHeader>
          {cancelPreview && cancelPreview.futureAppointments > 0 && (
            <div role="alert" data-testid="cancel-appointments-warning" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              {cancelPreview.mode === "immediate"
                ? cancelPreview.futureAppointments === 1
                  ? "Sua consulta agendada também será cancelada, e o psicólogo será avisado."
                  : `Suas ${cancelPreview.futureAppointments} consultas agendadas também serão canceladas, e o psicólogo será avisado.`
                : cancelPreview.futureAppointments === 1
                  ? "Sua consulta marcada para depois do fim do plano será cancelada quando ele terminar, e o psicólogo será avisado."
                  : `Suas ${cancelPreview.futureAppointments} consultas marcadas para depois do fim do plano serão canceladas quando ele terminar, e o psicólogo será avisado.`}
            </div>
          )}
          {refundPreview && (
            <div role="note" className="rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              Você está no prazo de 7 dias da primeira assinatura (direito de arrependimento). Ao cancelar,
              devolvemos {formatBRL(refundPreview.amount)} no seu cartão.
            </div>
          )}
          <div className="flex gap-2">
            <Button
              variant="outline"
              onClick={() => setShowCancelModal(false)}
              className="flex-1"
              disabled={loading === "cancel"}
            >
              Manter Assinatura
            </Button>
            <Button
              variant="destructive"
              onClick={handleCancelSubscription}
              className="flex-1"
              disabled={loading === "cancel"}
            >
              {loading === "cancel" ? "Cancelando..." : "Confirmar Cancelamento"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>

      {/* Troca de plano */}
      <Dialog open={changeTarget !== null} onOpenChange={(open) => !open && loading !== "change" && setChangeTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Mudar para o {changeTarget}</DialogTitle>
            <DialogDescription>
              {!changePreview
                ? "Calculando..."
                : changePreview.direction === "upgrade"
                  ? `O ${changeTarget} vale a partir de agora. Hoje cobramos ${formatBRL(changePreview.amount_due ?? 0)}, só a diferença proporcional até a sua renovação em ${formatDay(changePreview.renews_on ?? null)}. Depois, ${plans.find((p) => p.name === changeTarget)?.price}/mês.`
                  : `Você continua no ${subscriptionTier} até ${formatDay(changePreview.effective_on ?? null)}, o período que já pagou. Depois, passa para o ${changeTarget} por ${plans.find((p) => p.name === changeTarget)?.price}/mês. Nada é cobrado agora.`}
            </DialogDescription>
          </DialogHeader>
          <div className="flex gap-2">
            <Button variant="outline" className="flex-1" onClick={() => setChangeTarget(null)} disabled={loading === "change"}>
              Voltar
            </Button>
            <Button className="flex-1" onClick={confirmChange} disabled={!changePreview || loading === "change"}>
              {loading === "change" ? "Mudando..." : "Confirmar"}
            </Button>
          </div>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default SubscriptionPlans;
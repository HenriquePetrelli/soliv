import { useEffect, useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from "@/components/ui/card";
import { Check, ArrowRight, Clock } from "lucide-react";
import { useSubscription } from "@/contexts/SubscriptionContext";
import { PLAN_INCLUDES } from "@/lib/organizations";
import { parsePlanTier } from "@/lib/plans";

const ATTEMPTS = 6;
const INTERVAL_MS = 2500;

/**
 * Volta do checkout do Stripe. Só diz "ativada" depois que o servidor
 * confirma a assinatura (webhook/check-subscription); antes dizia sempre,
 * mesmo com o pagamento ainda pendente.
 */
const SubscriptionSuccess = () => {
  const navigate = useNavigate();
  const { subscribed, subscriptionTier, entitlementSource, checkSubscription } = useSubscription();
  const [attempt, setAttempt] = useState(0);
  const confirmed = subscribed && entitlementSource === "stripe";
  const gaveUp = !confirmed && attempt >= ATTEMPTS;

  useEffect(() => {
    if (confirmed || attempt >= ATTEMPTS) return;
    const timer = setTimeout(async () => {
      await checkSubscription({ force: true });
      setAttempt((n) => n + 1);
    }, attempt === 0 ? 800 : INTERVAL_MS);
    return () => clearTimeout(timer);
    // checkSubscription muda de identidade a cada render do provider.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, confirmed]);

  const tier = parsePlanTier(subscriptionTier);

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            {confirmed ? <Check className="w-8 h-8 text-primary" /> : <Clock className="w-8 h-8 text-primary" />}
          </div>
          <CardTitle className="text-xl">
            {confirmed ? `Plano ${tier ?? ""} ativado!` : gaveUp ? "Pagamento em processamento" : "Confirmando seu pagamento..."}
          </CardTitle>
          <CardDescription>
            {confirmed
              ? "Tudo certo. O recibo foi enviado para o seu e-mail."
              : gaveUp
                ? "O banco ainda não confirmou o pagamento. Assim que confirmar, o plano é liberado sozinho — você não precisa pagar de novo."
                : "Isso leva só alguns segundos."}
          </CardDescription>
        </CardHeader>

        <CardContent className="space-y-4">
          {confirmed && tier && (
            <div className="bg-muted/50 p-4 rounded-lg text-left">
              <h3 className="font-semibold mb-2">O que você tem agora:</h3>
              <ul className="text-sm text-muted-foreground space-y-2">
                {PLAN_INCLUDES[tier].map((item) => (
                  <li key={item} className="flex items-start gap-2">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
            </div>
          )}

          {gaveUp && (
            <Button variant="outline" className="w-full" onClick={() => setAttempt(0)}>
              Verificar de novo
            </Button>
          )}

          <Button onClick={() => navigate("/home")} className="w-full">
            Ir para o Início
            <ArrowRight className="w-4 h-4 ml-2" />
          </Button>
        </CardContent>
      </Card>
    </div>
  );
};

export default SubscriptionSuccess;

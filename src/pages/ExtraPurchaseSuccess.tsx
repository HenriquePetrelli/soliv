import { useEffect, useState } from 'react';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { ArrowRight, Check, Clock } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent, CardDescription, CardHeader, CardTitle } from '@/components/ui/card';
import { supabase } from '@/integrations/supabase/client';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { EXTRA_NAMES, type ExtraKind } from '@/lib/plans';

const ATTEMPTS = 6;
const INTERVAL_MS = 2500;

/**
 * Volta da página de pagamento de um atendimento avulso. Só libera o
 * atendimento depois que o servidor confirma o pagamento (buy-extra
 * "confirm"; o webhook do Stripe também libera).
 */
const ExtraPurchaseSuccess = () => {
  const navigate = useNavigate();
  const [params] = useSearchParams();
  const sessionId = params.get('session_id') ?? '';
  const kind: ExtraKind = params.get('tipo') === 'sos' ? 'sos' : 'appointment';
  const { checkSubscription } = useSubscription();
  const [attempt, setAttempt] = useState(0);
  const [confirmed, setConfirmed] = useState(false);
  const gaveUp = !confirmed && attempt >= ATTEMPTS;

  useEffect(() => {
    if (confirmed || attempt >= ATTEMPTS || !sessionId) return;
    const timer = setTimeout(async () => {
      const { data } = await supabase.functions.invoke('buy-extra', { body: { action: 'confirm', session_id: sessionId } });
      if (data?.ok) {
        setConfirmed(true);
        void checkSubscription();
      } else {
        setAttempt((n) => n + 1);
      }
    }, attempt === 0 ? 300 : INTERVAL_MS);
    return () => clearTimeout(timer);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [attempt, confirmed, sessionId]);

  const next = kind === 'sos' ? '/sos' : '/appointments?agendar=1';

  return (
    <div className="min-h-screen bg-background flex items-center justify-center p-4">
      <Card className="max-w-md w-full text-center">
        <CardHeader>
          <div className="w-16 h-16 bg-primary/10 rounded-full flex items-center justify-center mx-auto mb-4">
            {confirmed ? <Check className="w-8 h-8 text-primary" /> : <Clock className="w-8 h-8 text-primary" />}
          </div>
          <CardTitle className="text-xl">
            {confirmed ? `${EXTRA_NAMES[kind]} liberado!` : gaveUp || !sessionId ? 'Pagamento em processamento' : 'Confirmando seu pagamento...'}
          </CardTitle>
          <CardDescription>
            {confirmed
              ? kind === 'sos'
                ? 'Toque abaixo para pedir ajuda agora. Um psicólogo disponível vai atender você.'
                : 'Agora escolha o psicólogo, o dia e o horário da consulta.'
              : gaveUp || !sessionId
                ? 'O pagamento ainda não foi confirmado. Assim que for, o atendimento aparece liberado no app.'
                : 'Isso leva só alguns segundos.'}
          </CardDescription>
        </CardHeader>
        <CardContent className="space-y-2">
          {confirmed ? (
            <Button className="w-full" onClick={() => navigate(next, { replace: true })}>
              {kind === 'sos' ? 'Pedir ajuda agora' : 'Agendar consulta'}
              <ArrowRight className="ml-2 h-4 w-4" />
            </Button>
          ) : (
            (gaveUp || !sessionId) && (
              <Button variant="outline" className="w-full" onClick={() => navigate('/home', { replace: true })}>
                Voltar para o início
              </Button>
            )
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default ExtraPurchaseSuccess;

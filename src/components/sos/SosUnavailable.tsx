import { CalendarDays, CreditCard, Phone, ShieldCheck, Sparkles, Wind } from 'lucide-react';
import type { LucideIcon } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import type { SosDenial } from '@/hooks/useEmergencySOS';

interface SosUnavailableProps {
  denial: SosDenial;
  onBreathe: () => void;
  onSafetyPlan: () => void;
  onNavigate: (path: string) => void;
  /** Comprar um SOS avulso (com o preço já formatado, ex.: "R$ 54,90"). */
  onBuyExtra?: () => void;
  extraPriceLabel?: string;
}

/** Recusa por cota do mês, sem plano ou conta bloqueada: o texto muda, as saídas de ajuda ficam. */
const describe = (denial: SosDenial) => {
  if (denial.code === 'PATIENT_BLOCKED') {
    return { title: 'O SOS está indisponível na sua conta', text: denial.message, kind: 'blocked' as const };
  }
  // Flex: o atendimento do mês (SOS ou consulta) já foi usado numa consulta.
  if (/atendimento do mês já usado/i.test(denial.message)) {
    return {
      title: 'Você já usou o atendimento deste mês',
      text: 'No plano Flex, o atendimento do mês vale para SOS ou consulta, e você já marcou uma consulta. Ele volta no dia 1º do próximo mês. Enquanto isso, estas ajudas estão disponíveis agora mesmo.',
      kind: 'shared' as const,
    };
  }
  if (/limite mensal/i.test(denial.message)) {
    return {
      title: 'Você já usou o SOS deste mês',
      text: 'Ele volta no dia 1º do próximo mês. Enquanto isso, estas ajudas estão disponíveis agora mesmo.',
      kind: 'quota' as const,
    };
  }
  return {
    title: 'O SOS faz parte dos planos Essencial, Flex e Completo',
    text: 'Com um plano, um psicólogo atende você por vídeo na hora. Agora mesmo, estas ajudas são gratuitas.',
    kind: 'plan' as const,
  };
};

const Option = ({ icon: Icon, title, description, onClick }: { icon: LucideIcon; title: string; description: string; onClick: () => void }) => (
  <button
    type="button"
    onClick={onClick}
    className="flex w-full items-center gap-3 rounded-xl border border-border bg-card p-4 text-left transition-colors hover:bg-muted/50"
  >
    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
      <Icon className="h-5 w-5" />
    </span>
    <span>
      <span className="block text-sm font-medium text-foreground">{title}</span>
      <span className="block text-xs text-muted-foreground">{description}</span>
    </span>
  </button>
);

/**
 * Tela da espera quando o SOS não pode ser usado. Antes aparecia só um aviso
 * flutuante e a tela continuava em "Buscando um psicólogo", sem pedido nenhum.
 */
const SosUnavailable = ({ denial, onBreathe, onSafetyPlan, onNavigate, onBuyExtra, extraPriceLabel }: SosUnavailableProps) => {
  const { title, text, kind } = describe(denial);

  return (
    <div className="mx-auto flex w-full max-w-md flex-1 flex-col gap-4 px-4 py-6">
      <Card>
        <CardContent className="space-y-4 p-6 text-center">
          <div className="mx-auto flex h-14 w-14 items-center justify-center rounded-2xl bg-primary/10 text-primary" aria-hidden="true">
            <Phone className="h-6 w-6" />
          </div>
          <div className="space-y-1.5">
            <h2 className="text-lg font-semibold text-foreground">{title}</h2>
            <p className="text-sm text-muted-foreground">{text}</p>
          </div>
          <div className="grid gap-2">
            <Button asChild className="min-h-12 w-full">
              <a href="tel:188">
                <Phone className="h-4 w-4" />
                Ligar para o CVV (188)
              </a>
            </Button>
            <p className="text-xs text-muted-foreground">Conversa gratuita e sigilosa, 24 horas por dia.</p>
          </div>
        </CardContent>
      </Card>

      <div className="space-y-2">
        {kind !== 'blocked' && onBuyExtra && (
          <Option
            icon={CreditCard}
            title={`Comprar um SOS avulso${extraPriceLabel ? ` (${extraPriceLabel})` : ''}`}
            description="Cobrado na hora no seu cartão; o psicólogo atende em seguida"
            onClick={onBuyExtra}
          />
        )}
        <Option icon={Wind} title="Respirar agora" description="Um exercício curto para acalmar o corpo" onClick={onBreathe} />
        <Option icon={ShieldCheck} title="Meu plano de segurança" description="O que ajuda você e quem chamar" onClick={onSafetyPlan} />
        {kind === 'quota' && denial.planType === 'Completo' && (
          <Option
            icon={CalendarDays}
            title="Agendar uma consulta"
            description="Se ainda tiver a consulta do mês, marque com um psicólogo"
            onClick={() => onNavigate('/appointments')}
          />
        )}
        {kind === 'plan' && (
          <Option icon={Sparkles} title="Ver planos" description="Essencial, Flex e Completo incluem o SOS" onClick={() => onNavigate('/subscription-plans')} />
        )}
        {kind === 'shared' && (
          <Option icon={Sparkles} title="Ver planos" description="O Completo inclui SOS e consulta todo mês" onClick={() => onNavigate('/subscription-plans')} />
        )}
      </div>

      <p className="text-center text-xs text-muted-foreground">
        Em risco imediato de vida, ligue para o{' '}
        <a href="tel:192" className="font-medium text-primary underline-offset-2 hover:underline">
          SAMU 192
        </a>
        .
      </p>

      <Button variant="ghost" onClick={() => onNavigate('/home')} className="mt-auto text-muted-foreground">
        Voltar para o início
      </Button>
    </div>
  );
};

export default SosUnavailable;

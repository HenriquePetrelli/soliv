import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Building2, Check } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { CompanyBenefitBodySkeleton } from '@/components/skeletons/PageSkeletons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import PageHeader from '@/components/PageHeader';
import PatientBottomNav from '@/components/PatientBottomNav';
import { useCompanyBenefit } from '@/hooks/useCompanyBenefit';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { PLAN_INCLUDES, joinErrorMessage, normalizeInviteCode } from '@/lib/organizations';

const formatDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');

/** Benefício da empresa (B2B): usar o código do RH, ver o que inclui, sair. */
const CompanyBenefit = () => {
  const navigate = useNavigate();
  const { benefit, signupCode, signupCodeFailed, loading, join, leave } = useCompanyBenefit();
  const { personalSubscriptionTier } = useSubscription();
  const [code, setCode] = useState('');
  const [error, setError] = useState<string | null>(null);
  const [joining, setJoining] = useState(false);
  const [leaveOpen, setLeaveOpen] = useState(false);

  // O código do cadastro não deu certo: já deixa ele no campo para tentar de novo.
  useEffect(() => {
    if (signupCodeFailed && signupCode) setCode((current) => current || signupCode.toUpperCase());
  }, [signupCodeFailed, signupCode]);

  const handleJoin = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    if (normalizeInviteCode(code).length < 6) {
      setError('Digite o código que o RH da sua empresa enviou.');
      return;
    }
    setJoining(true);
    try {
      const result = await join(code);
      if (result.ok) {
        toast.success(`Pronto! Você tem o plano ${result.tier} pela ${result.organization}.`);
        setCode('');
      } else {
        setError(joinErrorMessage(result));
      }
    } finally {
      setJoining(false);
    }
  };

  return (
    <div className="has-tabs">
      <div className="screen">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
          <PageHeader title="Benefício da empresa" backTo="/profile" />
        </div>

        <main className="w-full min-w-0 p-4 space-y-5 max-w-2xl mx-auto">
          {loading ? (
            <CompanyBenefitBodySkeleton />
          ) : benefit ? (
            <section className="space-y-4 rounded-2xl border border-primary/30 bg-primary/5 p-5">
              <div className="flex items-start gap-3">
                <Building2 className="mt-0.5 h-6 w-6 shrink-0 text-primary" aria-hidden="true" />
                <div>
                  <h2 className="text-base font-semibold text-foreground">
                    Plano {benefit.tier} pela {benefit.organizationName}
                  </h2>
                  <p className="text-sm text-muted-foreground">
                    {benefit.endsOn ? `Válido até ${formatDate(benefit.endsOn)}.` : 'Válido enquanto durar o contrato da sua empresa.'}
                  </p>
                </div>
              </div>
              <ul className="space-y-1.5">
                {PLAN_INCLUDES[benefit.tier].map((item) => (
                  <li key={item} className="flex items-start gap-2 text-sm text-foreground">
                    <Check className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                    {item}
                  </li>
                ))}
              </ul>
              {personalSubscriptionTier && (
                <div role="note" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
                  Você ainda paga uma assinatura própria ({personalSubscriptionTier}). Como a empresa já cobre o seu plano,
                  você pode cancelá-la.{' '}
                  <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => navigate('/subscription-plans')}>
                    Ver minha assinatura
                  </button>
                </div>
              )}
              <p className="rounded-lg bg-card p-3 text-xs text-muted-foreground">
                A sua empresa paga o plano, mas não vê o que você faz no app: nem atendimentos, nem humor, diário ou
                hábitos. O RH recebe só números gerais de uso da empresa toda.
              </p>
              <Button variant="ghost" className="w-full text-destructive hover:text-destructive" onClick={() => setLeaveOpen(true)}>
                Sair do benefício
              </Button>
            </section>
          ) : (
            <form onSubmit={handleJoin} className="space-y-4 rounded-2xl border border-border bg-card p-5">
              <div className="space-y-1">
                <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <Building2 className="h-5 w-5 text-primary" aria-hidden="true" />
                  Sua empresa oferece o Soliv?
                </h2>
                <p className="text-sm text-muted-foreground">
                  Digite o código que o RH enviou para ter o plano da empresa, sem pagar nada.
                </p>
              </div>
              {signupCodeFailed && (
                <p role="note" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm text-foreground">
                  O código da empresa que você usou no cadastro não foi aceito. Toque em Usar código para tentar de novo e
                  ver o motivo, ou confira o código com o RH.
                </p>
              )}
              <div className="space-y-1.5">
                <Label htmlFor="company-code">Código da empresa</Label>
                <Input
                  id="company-code"
                  value={code}
                  onChange={(e) => setCode(e.target.value.toUpperCase())}
                  autoCapitalize="characters"
                  autoComplete="off"
                  maxLength={20}
                  placeholder="Ex.: A1B2C3D4"
                  className="h-12 font-mono tracking-widest"
                />
              </div>
              {error && (
                <p role="alert" className="text-sm text-destructive">
                  {error}
                </p>
              )}
              <Button type="submit" className="w-full min-h-12" disabled={joining}>
                {joining ? 'Verificando...' : 'Usar código'}
              </Button>
              <p className="text-xs text-muted-foreground">
                A empresa não vê o que você faz no app. O RH recebe só números gerais de uso da empresa toda.
              </p>
            </form>
          )}

        </main>
      </div>

      <AlertDialog open={leaveOpen} onOpenChange={setLeaveOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Sair do benefício da empresa?</AlertDialogTitle>
            <AlertDialogDescription>
              Você perde o plano {benefit?.tier} na hora e libera a vaga. Seus dados continuam no app. Para voltar, use o
              código de novo.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                try {
                  await leave();
                  toast.success('Você saiu do benefício da empresa.');
                } catch {
                  toast.error('Não foi possível sair agora. Tente de novo.');
                }
              }}
            >
              Sair
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PatientBottomNav />
    </div>
  );
};

export default CompanyBenefit;

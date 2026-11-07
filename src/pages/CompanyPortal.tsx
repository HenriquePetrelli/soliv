import { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Copy, RefreshCw, ShieldCheck, UserMinus, Users } from 'lucide-react';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { CompanyPortalBodySkeleton } from '@/components/skeletons/PageSkeletons';
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
import { supabase } from '@/integrations/supabase/client';
import { useCompanyBenefit } from '@/hooks/useCompanyBenefit';
import type { PlanTier } from '@/lib/plans';

interface Dashboard {
  id: string;
  name: string;
  plan_tier: PlanTier;
  status: 'active' | 'paused' | 'ended';
  starts_on: string;
  ends_on: string | null;
  seats: number;
  members: number;
  invite_code: string;
  allowed_email_domain: string | null;
  usage: { sos_this_month: number; consultations_this_month: number; active_last_30_days: number } | null;
  usage_min_members: number;
}

const STATUS_LABEL: Record<Dashboard['status'], string> = { active: 'Ativo', paused: 'Pausado', ended: 'Encerrado' };
const formatDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');

/**
 * Portal do RH (B2B). Mostra vagas, contrato e código de convite, e o uso só
 * em números da empresa toda — nunca quem usou, nem o quê.
 */
const CompanyPortal = () => {
  const navigate = useNavigate();
  const { managedOrganizationIds, loading: membershipLoading } = useCompanyBenefit();
  const orgId = managedOrganizationIds[0];
  const [data, setData] = useState<Dashboard | null>(null);
  const [loading, setLoading] = useState(true);
  const [rotateOpen, setRotateOpen] = useState(false);
  const [offboardEmail, setOffboardEmail] = useState('');
  const [offboardResult, setOffboardResult] = useState<string | null>(null);
  const [offboarding, setOffboarding] = useState(false);

  // Desligamento: o acesso vai até o fim do mês e a vaga fica livre na hora.
  // A resposta é a mesma exista ou não alguém com o e-mail (sigilo).
  const offboard = async (event: React.FormEvent) => {
    event.preventDefault();
    if (!orgId || !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(offboardEmail.trim())) {
      setOffboardResult('Digite um e-mail válido.');
      return;
    }
    setOffboarding(true);
    const { data: result, error } = await supabase.rpc('remove_organization_member_by_email', {
      p_org: orgId,
      p_email: offboardEmail.trim(),
    });
    setOffboarding(false);
    if (error) {
      setOffboardResult('Não foi possível concluir agora. Tente de novo.');
      return;
    }
    const until = (result as unknown as { access_until?: string })?.access_until;
    setOffboardResult(
      `Pronto. Se ${offboardEmail.trim()} estiver usando o benefício, o acesso vai até ${until ? formatDate(until) : 'o fim do mês'}.`,
    );
    setOffboardEmail('');
    load();
  };

  const load = useCallback(async () => {
    if (!orgId) return;
    const { data: result, error } = await supabase.rpc('get_organization_dashboard', { p_org: orgId });
    if (error) {
      toast.error('Não foi possível carregar o portal da empresa.');
    } else {
      setData(result as unknown as Dashboard);
    }
    setLoading(false);
  }, [orgId]);

  useEffect(() => {
    if (!membershipLoading && !orgId) setLoading(false);
    load();
  }, [load, membershipLoading, orgId]);

  const inviteMessage = data
    ? `A ${data.name} oferece o Soliv, app de apoio emocional, para você. Baixe o app, crie sua conta e use o código ${data.invite_code} no cadastro (opção "Tenho um código da empresa"). Se já tiver conta, use em Planos → Usar o código da empresa.`
    : '';

  const copy = async (text: string, what: string) => {
    try {
      await navigator.clipboard.writeText(text);
      toast.success(`${what} copiado`);
    } catch {
      toast.error('Não foi possível copiar. Selecione e copie manualmente.');
    }
  };

  return (
    <div className="has-tabs">
      <div className="screen">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
          <PageHeader title="Portal da empresa" backTo="/beneficio-empresa" />
        </div>

        <main className="w-full min-w-0 p-4 space-y-5 max-w-2xl mx-auto">
          {loading || membershipLoading ? (
            <CompanyPortalBodySkeleton />
          ) : !orgId || !data ? (
            <div className="space-y-3">
              <p className="text-foreground">Você não é gestor de nenhuma empresa no Soliv.</p>
              <Button onClick={() => navigate('/beneficio-empresa')}>Voltar</Button>
            </div>
          ) : (
            <>
              <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <h2 className="truncate text-lg font-semibold text-foreground">{data.name}</h2>
                    <p className="text-sm text-muted-foreground">
                      Plano {data.plan_tier} · {STATUS_LABEL[data.status]}
                    </p>
                  </div>
                </div>
                <p className="text-sm text-muted-foreground">
                  Contrato desde {formatDate(data.starts_on)}
                  {data.ends_on ? ` até ${formatDate(data.ends_on)}` : ', sem data de término'}.
                </p>
                <div className="space-y-1.5">
                  <div className="flex items-center justify-between text-sm">
                    <span className="flex items-center gap-1.5 font-medium text-foreground">
                      <Users className="h-4 w-4" aria-hidden="true" />
                      Vagas em uso
                    </span>
                    <span className="tabular-nums text-foreground">
                      {data.members} de {data.seats}
                    </span>
                  </div>
                  <Progress value={(data.members / data.seats) * 100} className="h-2" />
                  {data.members >= data.seats && (
                    <p className="text-xs text-destructive">Todas as vagas estão ocupadas. Fale com o Soliv para ampliar.</p>
                  )}
                </div>
              </section>

              <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <h2 className="text-base font-semibold text-foreground">Convite</h2>
                <div className="flex items-center gap-2">
                  <code className="flex-1 rounded-lg bg-muted px-3 py-2 text-center font-mono text-xl tracking-widest text-foreground">
                    {data.invite_code}
                  </code>
                  <Button variant="outline" size="icon" className="h-11 w-11" aria-label="Copiar código" onClick={() => copy(data.invite_code, 'Código')}>
                    <Copy className="h-4 w-4" />
                  </Button>
                </div>
                {data.allowed_email_domain && (
                  <p className="text-xs text-muted-foreground">Só e-mails @{data.allowed_email_domain} podem usar o código.</p>
                )}
                <Button className="w-full min-h-11" onClick={() => copy(inviteMessage, 'Convite')}>
                  Copiar mensagem de convite
                </Button>
                <Button variant="ghost" className="w-full gap-2" onClick={() => setRotateOpen(true)}>
                  <RefreshCw className="h-4 w-4" aria-hidden="true" />
                  Gerar um novo código
                </Button>
              </section>

              <section className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <h2 className="text-base font-semibold text-foreground">Uso neste mês</h2>
                {data.usage ? (
                  <div className="grid grid-cols-3 gap-2 text-center">
                    {[
                      { label: 'Atendimentos SOS', value: data.usage.sos_this_month },
                      { label: 'Consultas', value: data.usage.consultations_this_month },
                      { label: 'Ativos em 30 dias', value: data.usage.active_last_30_days },
                    ].map((item) => (
                      <div key={item.label} className="min-w-0 rounded-xl bg-muted/50 p-3">
                        <p className="text-2xl font-bold tabular-nums text-foreground">{item.value}</p>
                        <p className="text-xs text-muted-foreground">{item.label}</p>
                      </div>
                    ))}
                  </div>
                ) : (
                  <p className="text-sm text-muted-foreground">
                    Os números de uso aparecem a partir de {data.usage_min_members} colaboradores, para que ninguém possa ser
                    identificado.
                  </p>
                )}
                <p className="flex items-start gap-2 rounded-lg bg-primary/5 p-3 text-xs text-muted-foreground">
                  <ShieldCheck className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
                  Por sigilo e pela LGPD, a empresa não vê quem usa o Soliv nem o que cada pessoa faz.
                </p>
              </section>

              <form onSubmit={offboard} className="rounded-2xl border border-border bg-card p-5 space-y-3">
                <h2 className="flex items-center gap-2 text-base font-semibold text-foreground">
                  <UserMinus className="h-5 w-5 text-primary" aria-hidden="true" />
                  Desligamento
                </h2>
                <p className="text-sm text-muted-foreground">
                  Quando alguém sair da empresa, informe o e-mail. A pessoa mantém o acesso até o fim do mês e a vaga fica
                  livre na hora.
                </p>
                <div className="space-y-1.5">
                  <Label htmlFor="offboard-email">E-mail do colaborador</Label>
                  <Input
                    id="offboard-email"
                    type="email"
                    value={offboardEmail}
                    onChange={(e) => {
                      setOffboardEmail(e.target.value);
                      setOffboardResult(null);
                    }}
                    className="h-11"
                  />
                </div>
                {offboardResult && (
                  <p role="status" className="text-sm text-foreground">
                    {offboardResult}
                  </p>
                )}
                <Button type="submit" variant="outline" className="w-full min-h-11" disabled={offboarding}>
                  {offboarding ? 'Enviando...' : 'Encerrar acesso'}
                </Button>
              </form>
            </>
          )}
        </main>
      </div>

      <AlertDialog open={rotateOpen} onOpenChange={setRotateOpen}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Gerar um novo código?</AlertDialogTitle>
            <AlertDialogDescription>
              O código atual deixa de funcionar para novos cadastros. Quem já entrou continua com o benefício.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={async () => {
                if (!orgId) return;
                const { error } = await supabase.rpc('rotate_organization_invite_code', { p_org: orgId });
                if (error) toast.error('Não foi possível gerar outro código.');
                else {
                  toast.success('Novo código gerado.');
                  load();
                }
              }}
            >
              Gerar
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
      <PatientBottomNav />
    </div>
  );
};

export default CompanyPortal;

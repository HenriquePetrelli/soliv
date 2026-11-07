import { useEffect, useState } from 'react';
import { Card, CardContent, CardHeader, CardTitle, CardDescription } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import PageTitle from '@/components/PageTitle';
import PayoutHistory from '@/components/payments/PayoutHistory';
import RouteSkeleton from "@/components/skeletons/RouteSkeleton";
import {
  CreditCard,
  Wallet,
  Clock,
  CheckCircle2,
  Calendar,
  AlertTriangle,
  RefreshCw,
  Loader2,
} from 'lucide-react';

interface PaymentRow {
  id: string;
  psychologist_id: string;
  name: string;
  email: string;
  pix_key?: string | null;
  pix_type?: string | null;
  total_paid_amount: number;
  total_pending_amount: number;
  scheduled_pending_count: number;
  scheduled_paid_count: number;
  emergency_pending_count: number;
  emergency_paid_count: number;
  updated_at: string;
}

const formatCurrency = (v: number) =>
  new Intl.NumberFormat('pt-BR', { style: 'currency', currency: 'BRL' }).format(v || 0);

const pixLabel = (t?: string | null) => {
  const map: Record<string, string> = {
    cpf: 'CPF',
    cnpj: 'CNPJ',
    email: 'E-mail',
    telefone: 'Telefone',
    phone: 'Telefone',
    aleatoria: 'Chave aleatória',
    random_key: 'Chave aleatória',
  };
  return map[t || ''] || t || 'Não informado';
};

const PsychologistPayments = () => {
  const { toast } = useToast();
  const [loading, setLoading] = useState(true);
  const [refreshing, setRefreshing] = useState(false);
  const [payment, setPayment] = useState<PaymentRow | null>(null);

  useEffect(() => {
    document.title = 'Meus Pagamentos | Soliv';
    load();
  }, []);

  const load = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();
      const user = session?.user;
      if (!user) {
        setLoading(false);
        return;
      }

      const { data: psych } = await supabase
        .from('psychologists')
        .select('id')
        .eq('user_id', user.id)
        .maybeSingle();

      if (!psych) {
        setLoading(false);
        return;
      }

      const { data, error } = await supabase
        .from('psychologist_payments')
        .select('*')
        .eq('psychologist_id', psych.id)
        .maybeSingle();

      if (error) throw error;
      setPayment(data as PaymentRow | null);
    } catch (e: any) {
      toast({
        title: 'Erro ao carregar pagamentos',
        description: getFriendlyErrorMessage(e, 'Não foi possível concluir a operação.'),
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const handleRefresh = async () => {
    setRefreshing(true);
    await load();
    setRefreshing(false);
    toast({ title: 'Atualizado', description: 'Informações de pagamento sincronizadas.' });
  };

  if (loading) {
    return <RouteSkeleton />;
  }

  const totalPending = payment?.total_pending_amount ?? 0;
  const totalPaid = payment?.total_paid_amount ?? 0;
  const scheduledPending = payment?.scheduled_pending_count ?? 0;
  const emergencyPending = payment?.emergency_pending_count ?? 0;
  const scheduledPaid = payment?.scheduled_paid_count ?? 0;
  const emergencyPaid = payment?.emergency_paid_count ?? 0;

  return (
    <div className="w-full space-y-6">
        <PageTitle
          title="Pagamentos"
          description="Repasses recebidos e valores a receber"
          action={
            <Button variant="outline" size="icon" onClick={handleRefresh} disabled={refreshing} className="h-10 w-10" aria-label="Atualizar">
              <RefreshCw className={`h-4 w-4 ${refreshing ? 'animate-spin' : ''}`} />
            </Button>
          }
        />

        {/* Summary */}
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <Card className="border-border/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    A receber
                  </p>
                  <p className="text-3xl font-bold text-primary mt-1">
                    {formatCurrency(totalPending)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {scheduledPending + emergencyPending} consulta(s) pendente(s)
                  </p>
                </div>
                <div className="rounded-lg bg-primary/10 p-2.5">
                  <Wallet className="w-5 h-5 text-primary" />
                </div>
              </div>
            </CardContent>
          </Card>

          <Card className="border-border/60">
            <CardContent className="p-5">
              <div className="flex items-start justify-between gap-2">
                <div className="min-w-0">
                  <p className="text-xs font-medium text-muted-foreground uppercase tracking-wide">
                    Total recebido
                  </p>
                  <p className="text-3xl font-bold text-success mt-1">
                    {formatCurrency(totalPaid)}
                  </p>
                  <p className="text-xs text-muted-foreground mt-1">
                    {scheduledPaid + emergencyPaid} consulta(s) pagas
                  </p>
                </div>
                <div className="rounded-lg bg-success/10 p-2.5">
                  <CheckCircle2 className="w-5 h-5 text-success" />
                </div>
              </div>
            </CardContent>
          </Card>
        </div>

        {/* Breakdown */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <Clock className="w-4 h-4" /> Detalhamento
            </CardTitle>
            <CardDescription>
              Consultas agendadas: R$ 85,00 · Emergências: R$ 40,00
            </CardDescription>
          </CardHeader>
          <CardContent className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-primary/10 p-2">
                  <Calendar className="w-4 h-4 text-primary" />
                </div>
                <div>
                  <p className="text-sm font-medium">Consultas agendadas</p>
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                </div>
              </div>
              <Badge variant={scheduledPending > 0 ? 'default' : 'secondary'}>
                {scheduledPending}
              </Badge>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-destructive/10 p-2">
                  <AlertTriangle className="w-4 h-4 text-destructive" />
                </div>
                <div>
                  <p className="text-sm font-medium">Emergências</p>
                  <p className="text-xs text-muted-foreground">Pendentes</p>
                </div>
              </div>
              <Badge variant={emergencyPending > 0 ? 'default' : 'secondary'}>
                {emergencyPending}
              </Badge>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-success/10 p-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                </div>
                <div>
                  <p className="text-sm font-medium">Agendadas pagas</p>
                  <p className="text-xs text-muted-foreground">Histórico</p>
                </div>
              </div>
              <Badge variant="secondary">{scheduledPaid}</Badge>
            </div>

            <div className="flex items-center justify-between rounded-lg border border-border p-4">
              <div className="flex items-center gap-3">
                <div className="rounded-md bg-success/10 p-2">
                  <CheckCircle2 className="w-4 h-4 text-success" />
                </div>
                <div>
                  <p className="text-sm font-medium">Emergências pagas</p>
                  <p className="text-xs text-muted-foreground">Histórico</p>
                </div>
              </div>
              <Badge variant="secondary">{emergencyPaid}</Badge>
            </div>
          </CardContent>
        </Card>

        {payment?.psychologist_id && <PayoutHistory psychologistId={payment.psychologist_id} />}

        {/* PIX info */}
        <Card>
          <CardHeader>
            <CardTitle className="flex items-center gap-2 text-base">
              <CreditCard className="w-4 h-4" /> Chave PIX para recebimento
            </CardTitle>
            <CardDescription>
              Os repasses são feitos semanalmente para a chave cadastrada.
            </CardDescription>
          </CardHeader>
          <CardContent>
            {payment?.pix_key ? (
              <div className="flex items-center justify-between rounded-lg border border-border p-4">
                <div className="min-w-0">
                  <p className="text-xs text-muted-foreground uppercase tracking-wide">
                    {pixLabel(payment.pix_type)}
                  </p>
                  <p className="font-mono text-sm mt-1 truncate">{payment.pix_key}</p>
                </div>
                <Badge variant="outline">Ativa</Badge>
              </div>
            ) : (
              <div className="rounded-lg border border-dashed border-border p-6 text-center">
                <p className="text-sm text-muted-foreground">
                  Nenhuma chave PIX cadastrada. Cadastre em Perfil → Chave Pix para
                  receber pagamentos.
                </p>
              </div>
            )}
          </CardContent>
        </Card>

        {!payment && (
          <div className="text-center text-sm text-muted-foreground py-4">
            Você ainda não possui histórico de pagamentos. Após suas primeiras consultas
            os valores aparecerão aqui.
          </div>
        )}
    </div>
  );
};

export default PsychologistPayments;

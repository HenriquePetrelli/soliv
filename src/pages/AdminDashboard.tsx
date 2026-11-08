import RoutinesHealthCard from '@/components/admin/RoutinesHealthCard';
import React, { useState, useEffect } from 'react';
import { SkeletonStatsGrid } from '@/components/skeletons/Skeletons';
import { AdminDashboardBodySkeleton } from '@/components/skeletons/PageSkeletons';
import { ContentTransition } from '@/components/skeletons/ContentTransition';

import { ErrorState } from '@/components/ErrorState';
import { useNavigate, useSearchParams } from 'react-router-dom';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Tabs, TabsContent } from '@/components/ui/tabs';
import { useToast } from '@/hooks/use-toast';
import { supabase } from '@/integrations/supabase/client';
import {
  UserCheck,
  Users,
  Calendar,
  AlertTriangle,
  CreditCard,
  TrendingUp,
  Activity,
  Check,
} from 'lucide-react';
import AdminProfile from '@/components/AdminProfile';
import { PsychologistApprovalPanel } from '@/components/psychologist/PsychologistApprovalPanel';
import { PatientsPanel } from '@/components/admin/PatientsPanel';
import { PaymentsPanel } from '@/components/payments/PaymentsPanel';
import { SosHistoryPanel } from '@/components/sos/SosHistoryPanel';
import { ChatModerationPanel } from '@/components/admin/ChatModerationPanel';
import { GroupTestimonialModerationPanel } from '@/components/admin/GroupTestimonialModerationPanel';
import { AuditLogPanel } from '@/components/admin/AuditLogPanel';
import { OrganizationsPanel } from '@/components/admin/OrganizationsPanel';
import AdminLayout from '@/components/admin/AdminLayout';
import PageTitle from '@/components/PageTitle';
import { ADMIN_NAV_ITEMS, isAdminSection, type AdminSection } from '@/components/admin/adminNavConfig';
import { Button } from '@/components/ui/button';
import { errorText, getFriendlyErrorMessage } from '@/utils/errorMessage';
import type { User } from '@supabase/supabase-js';

interface AdminMetrics {
  total_patients: number;
  active_psychologists: number;
  pending_psychologists: number;
  appointments_last_30_days: number;
  sos_requests_last_30_days: number;
  active_subscribers: number;
}

const AdminDashboard = () => {
  const [user, setUser] = useState<User | null>(null);
  const [isAdmin, setIsAdmin] = useState(false);
  const [metrics, setMetrics] = useState<AdminMetrics | null>(null);
  const [metricsLoading, setMetricsLoading] = useState(true);
  const [metricsError, setMetricsError] = useState<string | null>(null);
  // A seção fica na URL (?secao=pacientes): recarregar a página ou voltar
  // no navegador mantém o admin onde estava.
  const [searchParams, setSearchParams] = useSearchParams();
  const sectionParam = searchParams.get('secao');
  const activeTab: AdminSection = isAdminSection(sectionParam) ? sectionParam : 'overview';
  const setActiveTab = (section: AdminSection) => {
    setSearchParams(section === 'overview' ? {} : { secao: section });
    window.scrollTo({ top: 0 });
  };
  const { toast } = useToast();
  const navigate = useNavigate();

  const activeNav = ADMIN_NAV_ITEMS.find((n) => n.value === activeTab) ?? ADMIN_NAV_ITEMS[0];

  useEffect(() => {
    checkAdminAccess();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, []);

  const checkAdminAccess = async () => {
    try {
      const { data: { session } } = await supabase.auth.getSession();

      if (!session) {
        navigate('/');
        return;
      }

      const { data: isAdminResult, error: adminError } = await supabase
        .rpc('is_super_admin', { user_id_param: session.user.id });

      if (adminError) {
        console.error('Error checking admin status:', adminError.message);
        toast({
          title: "Erro",
          description: "Erro ao verificar permissões",
          variant: "destructive",
        });
        navigate('/');
        return;
      }

      if (!isAdminResult) {
        toast({
          title: "Acesso negado",
          description: "Apenas administradores podem acessar esta área.",
          variant: "destructive",
        });
        navigate('/');
        return;
      }

      setUser(session.user);
      setIsAdmin(true);
      fetchMetrics();
    } catch (error: unknown) {
      console.error('Error checking admin access:', errorText(error));
      navigate('/');
    }
  };

  const fetchMetrics = async () => {
    try {
      setMetricsLoading(true);
      setMetricsError(null);
      const { data, error } = await supabase.rpc('get_admin_metrics');
      if (error) throw error;
      if (data && data.length > 0) setMetrics(data[0]);
    } catch (error: unknown) {
      console.error('Error fetching metrics:', errorText(error));
      setMetricsError(getFriendlyErrorMessage(error, 'Falha ao carregar métricas.'));
      toast({
        title: "Erro",
        description: "Falha ao carregar métricas do sistema",
        variant: "destructive",
      });
    } finally {
      setMetricsLoading(false);
    }
  };



  if (!isAdmin) {
    return (
      <AdminLayout active={activeTab}>
        <AdminDashboardBodySkeleton />
      </AdminLayout>
    );
  }

  const metricCards = metrics
    ? [
        {
          label: 'Total de Pacientes',
          target: 'patients' as AdminSection,
          value: metrics.total_patients,
          hint: 'Pacientes registrados',
          icon: Users,
          accent: 'primary',
        },
        {
          label: 'Psicólogos Ativos',
          target: 'psychologists' as AdminSection,
          value: metrics.active_psychologists,
          hint: 'Aprovados e não bloqueados',
          icon: UserCheck,
          accent: 'secondary',
        },
        {
          label: 'Psicólogos Pendentes',
          target: 'psychologists' as AdminSection,
          value: metrics.pending_psychologists,
          hint: 'Cadastros aguardando aprovação do admin',
          icon: AlertTriangle,
          accent: 'warning',
        },
        {
          label: 'Consultas (30d)',
          target: null as AdminSection | null,
          value: metrics.appointments_last_30_days,
          hint: 'Últimos 30 dias',
          icon: Calendar,
          accent: 'primary',
        },
        {
          label: 'SOS (30d)',
          target: 'sos' as AdminSection,
          value: metrics.sos_requests_last_30_days,
          hint: 'Pedidos de emergência',
          icon: Activity,
          accent: 'destructive',
        },
        {
          label: 'Assinantes Ativos',
          target: null as AdminSection | null,
          value: metrics.active_subscribers,
          hint: 'Planos pagos',
          icon: CreditCard,
          accent: 'secondary',
        },
      ]
    : [];

  const accentStyles: Record<string, { border: string; bg: string; iconBg: string; iconText: string; value: string }> = {
    primary: {
      border: 'border-primary/20',
      bg: 'bg-gradient-to-br from-primary/5 to-transparent',
      iconBg: 'bg-primary/10',
      iconText: 'text-primary',
      value: 'text-primary',
    },
    // Antes usava a cor secundária, clara demais: número e ícone quase sumiam.
    secondary: {
      border: 'border-success/30',
      bg: 'bg-gradient-to-br from-success/10 to-transparent',
      iconBg: 'bg-success/15',
      iconText: 'text-success',
      value: 'text-success',
    },
    destructive: {
      border: 'border-destructive/20',
      bg: 'bg-gradient-to-br from-destructive/5 to-transparent',
      iconBg: 'bg-destructive/10',
      iconText: 'text-destructive',
      value: 'text-destructive',
    },
    warning: {
      border: 'border-warning/30',
      bg: 'bg-gradient-to-br from-warning/10 to-transparent',
      iconBg: 'bg-warning/15',
      iconText: 'text-warning',
      value: 'text-warning',
    },
  };

  const badges = { psychologists: metrics?.pending_psychologists ?? 0 };

  return (
    <AdminLayout active={activeTab} badges={badges}>
        <PageTitle title={activeNav.label} description={activeNav.description} />
        <Tabs value={activeTab} onValueChange={(v) => setActiveTab(v as AdminSection)} className="space-y-4 sm:space-y-6">


          <TabsContent value="overview" className="mt-0 space-y-4 sm:space-y-6">
            {/* Métricas Gerais */}
            <ContentTransition
              loading={metricsLoading}
              skeleton={
                <SkeletonStatsGrid
                  count={6}
                  columns="grid-cols-2 md:grid-cols-3"
                  compact
                />
              }
            >
              {metrics ? (
                <div className="grid grid-cols-2 md:grid-cols-3 gap-2 sm:gap-3 md:gap-4">
                  {metricCards.map(({ label, value, hint, icon: Icon, accent, target }) => {
                    const s = accentStyles[accent];
                    const body = (
                      <CardContent className="p-3 sm:p-5">
                        <div className="flex items-start justify-between gap-2 sm:gap-3">
                          <div className="min-w-0">
                            <p className="text-xs font-medium text-muted-foreground leading-tight">{label}</p>
                            <p className={`text-xl sm:text-3xl font-bold mt-1 sm:mt-1.5 ${s.value}`}>{value}</p>
                            <p className="text-xs text-muted-foreground mt-0.5 sm:mt-1 leading-tight">{hint}</p>
                          </div>
                          <div className={`rounded-lg p-1.5 sm:p-2.5 shrink-0 ${s.iconBg}`}>
                            <Icon className={`w-4 h-4 sm:w-5 sm:h-5 ${s.iconText}`} />
                          </div>
                        </div>
                      </CardContent>
                    );
                    // Cartões com seção própria levam até ela.
                    return target ? (
                      <button
                        key={label}
                        type="button"
                        onClick={() => setActiveTab(target)}
                        className="rounded-xl text-left focus:outline-none focus-visible:ring-2 focus-visible:ring-primary"
                        aria-label={`${label}: ${value}. Abrir ${ADMIN_NAV_ITEMS.find((n) => n.value === target)?.label}`}
                      >
                        <Card className={`${s.border} ${s.bg} h-full transition-shadow hover:shadow-md`}>{body}</Card>
                      </button>
                    ) : (
                      <Card key={label} className={`${s.border} ${s.bg}`}>{body}</Card>
                    );
                  })}
                </div>
              ) : (
                <ErrorState
                  title="Falha ao carregar métricas"
                  description={metricsError || "Não conseguimos buscar os dados agora. Tente novamente em instantes."}
                  onRetry={fetchMetrics}
                  retrying={metricsLoading}
                />
              )}
            </ContentTransition>


            <RoutinesHealthCard />

            {/* Resumo e Ações */}
            <div className="grid grid-cols-1 lg:grid-cols-2 gap-4 sm:gap-6">
              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <TrendingUp className="h-4 w-4 sm:h-5 sm:w-5 text-primary" />
                    Resumo de Atividade
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {metrics && (
                    <>
                      <div className="flex justify-between items-center py-2 border-b border-border/50">
                        <span className="text-sm text-muted-foreground">Taxa de Aprovação</span>
                        <span className="font-semibold text-sm">
                          {metrics.active_psychologists + metrics.pending_psychologists > 0
                            ? Math.round((metrics.active_psychologists / (metrics.active_psychologists + metrics.pending_psychologists)) * 100)
                            : 0}%
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2 border-b border-border/50">
                        <span className="text-sm text-muted-foreground">Consultas por Psicólogo</span>
                        <span className="font-semibold text-sm">
                          {metrics.active_psychologists > 0
                            ? Math.round(metrics.appointments_last_30_days / metrics.active_psychologists)
                            : 0} <span className="text-muted-foreground font-normal">média</span>
                        </span>
                      </div>
                      <div className="flex justify-between items-center py-2">
                        <span className="text-sm text-muted-foreground">Taxa de Conversão</span>
                        <span className="font-semibold text-sm">
                          {metrics.total_patients > 0
                            ? Math.round((metrics.active_subscribers / metrics.total_patients) * 100)
                            : 0}%
                        </span>
                      </div>
                    </>
                  )}
                </CardContent>
              </Card>

              <Card>
                <CardHeader className="pb-3">
                  <CardTitle className="flex items-center gap-2">
                    <AlertTriangle className="h-4 w-4 sm:h-5 sm:w-5 text-warning" />
                    Ações Necessárias
                  </CardTitle>
                </CardHeader>
                <CardContent className="space-y-3">
                  {metrics?.pending_psychologists && metrics.pending_psychologists > 0 ? (
                    <div className="flex items-center justify-between p-3 bg-primary/5 rounded-lg border border-primary/20">
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-foreground">
                          {metrics.pending_psychologists === 1 ? '1 psicólogo aguardando aprovação' : `${metrics.pending_psychologists} psicólogos aguardando aprovação`}
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          Confira os documentos e o CRP
                        </p>
                      </div>
                      <Button size="sm" variant="outline" onClick={() => setActiveTab("psychologists")}>
                        Revisar
                      </Button>
                    </div>
                  ) : null}

                  {metrics?.sos_requests_last_30_days && metrics.sos_requests_last_30_days > 10 ? (
                    <div className="flex items-center justify-between p-3 bg-destructive/5 rounded-lg border border-destructive/20">
                      <div className="min-w-0">
                        <p className="font-medium text-sm text-destructive">
                          Alto volume de SOS
                        </p>
                        <p className="text-xs text-muted-foreground mt-0.5">
                          {metrics.sos_requests_last_30_days} nos últimos 30 dias
                        </p>
                      </div>
                    </div>
                  ) : null}

                  {(!metrics?.pending_psychologists || metrics.pending_psychologists === 0) &&
                    (!metrics?.sos_requests_last_30_days || metrics.sos_requests_last_30_days <= 10) && (
                      <div className="flex items-center justify-center py-8 text-center">
                        <div>
                          <div className="rounded-full bg-success/10 p-3 mx-auto w-fit mb-3">
                            <Check className="h-6 w-6 text-success" />
                          </div>
                          <p className="text-sm text-muted-foreground">
                            Tudo em ordem! Nenhuma ação urgente necessária.
                          </p>
                        </div>
                      </div>
                    )}
                </CardContent>
              </Card>
            </div>
          </TabsContent>

          <TabsContent value="psychologists" className="mt-0">
            <PsychologistApprovalPanel adminUserId={user?.id} onDataChange={fetchMetrics} />
          </TabsContent>

          <TabsContent value="patients" className="mt-0">
            <PatientsPanel />
          </TabsContent>

          <TabsContent value="sos" className="mt-0">
            <SosHistoryPanel withMetrics title="Todas as solicitações SOS" />
          </TabsContent>

          <TabsContent value="chat" className="mt-0">
            <ChatModerationPanel />
          </TabsContent>

          <TabsContent value="groups" className="mt-0">
            <GroupTestimonialModerationPanel />
          </TabsContent>

          <TabsContent value="payments" className="mt-0">
            <PaymentsPanel />
          </TabsContent>

          <TabsContent value="companies" className="mt-0">
            <OrganizationsPanel />
          </TabsContent>

          <TabsContent value="audit" className="mt-0">
            <AuditLogPanel />
          </TabsContent>

          <TabsContent value="profile" className="mt-0">
            <AdminProfile />
          </TabsContent>
        </Tabs>
    </AdminLayout>
  );
};

export default AdminDashboard;

import { useAuth } from "@/contexts/AuthContext";
import { FREE_PLAN, PLANS, hasPaidPlan } from "@/lib/plans";
import { useState, useEffect } from "react";
import { Button } from "@/components/ui/button";
import { Card } from "@/components/ui/card";
import { Badge } from "@/components/ui/badge";
import { Bell, Building2, Check, Crown, LockKeyhole, LogOut, MessageCircle, Palette, ScrollText, Stethoscope, Target, User as UserIcon } from "lucide-react";
import { SettingsRow, SettingsSection } from "@/components/settings/SettingsList";
import { ThemeToggle } from "@/components/ThemeToggle";
import { DailyMoodToggle } from "@/components/DailyMoodToggle";
import { PushNotificationToggle } from "@/components/PushNotificationToggle";
import { Switch } from "@/components/ui/switch";
import { useNavigate } from "react-router-dom";
import { supabase } from "@/integrations/supabase/client";
import { getSessionUser } from '@/lib/currentUser';
import { useSubscription } from "@/contexts/SubscriptionContext";
import { useToast } from "@/hooks/use-toast";
import { useWeeklyGoals } from "@/hooks/useWeeklyGoals";
import { useCompanyBenefit } from "@/hooks/useCompanyBenefit";

import EditSymptomsModal from "@/components/EditSymptomsModal";
import { cancelledPlanLabel } from "@/lib/subscriptionStatus";
import { ProfileSkeleton } from "@/components/skeletons/PageSkeletons";
import type { User } from '@supabase/supabase-js';

const Profile = () => {
  const navigate = useNavigate();
  const { subscribed, subscriptionTier, entitlementSource, organizationName, paymentIssue, cancelAtPeriodEnd, subscriptionEnd } = useSubscription();
  const fromCompany = entitlementSource === 'organization';
  // "Benefício da empresa" só aparece para quem tem vínculo (colaborador ou RH).
  // Quem ainda não tem usa o código no cadastro ou em Planos.
  const { benefit: companyBenefit, managedOrganizationIds } = useCompanyBenefit();
  const linkedToCompany = Boolean(companyBenefit) || managedOrganizationIds.length > 0;
  const { toast } = useToast();
  const { getShowGoalModalPreference, setShowGoalModal } = useWeeklyGoals();
  // Nome e e-mail já estão na sessão: a tela aparece na hora e o nome do
  // cadastro (profiles) chega em seguida, sem esqueleto de espera.
  const { user: authUser, signOut } = useAuth();
  const [user, setUser] = useState<(User & { profile: { full_name: string | null } }) | null>(() =>
    authUser ? { ...authUser, profile: { full_name: authUser.user_metadata?.full_name ?? null } } : null,
  );
  const [loading, setLoading] = useState(!authUser);
  const [editSymptomsOpen, setEditSymptomsOpen] = useState(false);
  const [showWeeklyGoalModal, setShowWeeklyGoalModal] = useState(true);

  useEffect(() => {
    fetchUserData();
    loadGoalModalPreference();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, []);

  const loadGoalModalPreference = async () => {
    const preference = await getShowGoalModalPreference();
    setShowWeeklyGoalModal(preference);
  };

  const handleToggleWeeklyGoalModal = async (checked: boolean) => {
    setShowWeeklyGoalModal(checked);
    await setShowGoalModal(checked);
  };

  const fetchUserData = async () => {
    try {
      const { data: { user } } = await getSessionUser();
      if (user) {
        const { data: profile } = await supabase
          .from('profiles')
          .select('full_name')
          .eq('user_id', user.id)
          .maybeSingle();

        setUser({
          ...user,
          profile: { full_name: profile?.full_name ?? user.user_metadata?.full_name ?? null },
        });
      }
    } catch (error) {
      console.error('Error fetching user data:', error);
    } finally {
      setLoading(false);
    }
  };


  // Sair: sempre pelo signOut central (garante voltar para a tela de login).
  const handleLogout = () => signOut();

  const handleManageSubscription = () => {
    navigate('/subscription-plans');
  };

  const getPlanInfo = () => {
    const plan = hasPaidPlan(subscribed, subscriptionTier) && subscriptionTier ? PLANS[subscriptionTier] : null;
    const info = plan ? { name: `Plano ${plan.name}`, price: plan.price, features: plan.features } : FREE_PLAN;
    return { ...info, features: info.features.map((feature) => `• ${feature}`) };
  };

  if (loading) {
    return <ProfileSkeleton />;
  }

  const planInfo = getPlanInfo();
  // "Plano cancelado - Essencial disponível até 15/04/2026" (só assinatura própria).
  const cancelledLabel = entitlementSource === 'stripe' ? cancelledPlanLabel(subscriptionTier, cancelAtPeriodEnd, subscriptionEnd) : null;

  const initials = (user?.profile?.full_name || user?.email || 'U')
    .split(' ')
    .map((s: string) => s[0])
    .slice(0, 2)
    .join('')
    .toUpperCase();

  const planStatus = fromCompany
    ? `Oferecido pela ${organizationName}`
    : paymentIssue
      ? 'Pagamento recusado: atualize o cartão'
      : cancelledLabel
        ? cancelledLabel
        : subscribed
          ? `${planInfo.price}/mês`
          : 'Sem custo';

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6 pb-4">
      {/* Quem é: avatar, nome, e-mail e plano. */}
      <Card className="border-border/60">
        <div className="flex items-center gap-4 p-5">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-semibold tracking-wide text-primary"
            aria-hidden="true"
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-foreground">
              {user?.profile?.full_name || 'Usuário'}
            </h1>
            <p className="truncate text-sm text-muted-foreground">{user?.email}</p>
            <Badge variant="secondary" className="mt-2 gap-1.5 font-medium">
              <Crown size={12} className="text-primary" />
              {cancelledLabel ?? (subscribed ? `Plano ${subscriptionTier}` : 'Plano Grátis')}
            </Badge>
          </div>
        </div>
      </Card>

      {/* Plano: o que tem e a ação principal sempre à vista. */}
      <section className="space-y-2" aria-label="Meu plano">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Meu plano</h2>
        <Card className="border-border/60">
          <div className="space-y-4 p-4">
            <div className="flex items-center gap-4">
              <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl bg-primary/10 text-primary" aria-hidden="true">
                <Crown size={18} />
              </div>
              <div className="min-w-0 flex-1">
                <div className="text-sm font-medium text-foreground">{planInfo.name}</div>
                <div className={paymentIssue && !fromCompany ? 'text-xs font-medium text-destructive' : 'text-xs text-muted-foreground'}>
                  {planStatus}
                </div>
              </div>
            </div>

            <ul className="grid gap-x-4 gap-y-1.5 sm:grid-cols-2" aria-label="Benefícios do plano">
              {planInfo.features.map((feature, index) => (
                <li key={index} className="flex items-start gap-2 text-sm text-muted-foreground">
                  <Check size={16} className="mt-0.5 shrink-0 text-primary" aria-hidden="true" />
                  <span>{feature.replace('• ', '')}</span>
                </li>
              ))}
            </ul>

            {fromCompany ? (
              <Button variant="outline" className="h-11 w-full" onClick={() => navigate('/beneficio-empresa')}>
                Ver benefício da empresa
              </Button>
            ) : !subscribed ? (
              <Button className="h-11 w-full" onClick={handleManageSubscription}>
                <Crown size={16} className="mr-2" />
                Conhecer os planos
              </Button>
            ) : (
              <Button variant="outline" className="h-11 w-full" onClick={handleManageSubscription}>
                {paymentIssue ? 'Atualizar pagamento' : 'Gerenciar assinatura'}
              </Button>
            )}
          </div>
        </Card>
      </section>

      <SettingsSection title="Conta">
        <SettingsRow
          icon={<UserIcon />}
          title="Alterar dados da conta"
          description="Nome, e-mail, senha e seus dados"
          onClick={() => navigate('/account-settings')}
        />
        <SettingsRow
          icon={<Stethoscope />}
          title="Meus sintomas"
          description="O que você sente, para indicarmos o melhor cuidado"
          onClick={() => setEditSymptomsOpen(true)}
        />
        {linkedToCompany && (
          <SettingsRow
            icon={<Building2 />}
            title="Benefício da empresa"
            description={
              companyBenefit
                ? `Plano ${companyBenefit.tier} pela ${companyBenefit.organizationName}`
                : 'Portal da empresa'
            }
            onClick={() => navigate('/beneficio-empresa')}
          />
        )}
      </SettingsSection>

      <SettingsSection title="Preferências">
        <SettingsRow
          icon={<Palette />}
          title="Tema"
          description="Claro, escuro ou do sistema"
          trailing={<ThemeToggle />}
        />
        <PushNotificationToggle icon={<Bell />} />
        <DailyMoodToggle />
        <SettingsRow
          icon={<Target />}
          title="Metas da semana"
          description="Lembrar toda segunda de escolher as metas"
          trailing={
            <Switch
              checked={showWeeklyGoalModal}
              onCheckedChange={handleToggleWeeklyGoalModal}
              aria-label="Alternar lembrete das metas da semana"
            />
          }
        />
      </SettingsSection>

      <SettingsSection title="Ajuda e privacidade">
        <SettingsRow
          icon={<MessageCircle />}
          title="Suporte"
          description="Fale com nossa equipe"
          onClick={() => navigate('/paciente/suporte')}
        />
        <SettingsRow
          icon={<ScrollText />}
          title="Termos de Uso"
          description="Regras de uso, planos e cancelamento"
          onClick={() => navigate('/termos')}
        />
        <SettingsRow
          icon={<LockKeyhole />}
          title="Política de Privacidade"
          description="Como tratamos os seus dados"
          onClick={() => navigate('/privacidade')}
        />
      </SettingsSection>

      <Card className="overflow-hidden border-border/60">
        <SettingsRow
          icon={<LogOut />}
          title="Sair da conta"
          description="Encerrar a sessão neste aparelho"
          onClick={handleLogout}
          tone="destructive"
        />
      </Card>

      {user && (
        <EditSymptomsModal
          open={editSymptomsOpen}
          onOpenChange={setEditSymptomsOpen}
          userId={user.id}
        />
      )}
    </div>
  );
};

export default Profile;
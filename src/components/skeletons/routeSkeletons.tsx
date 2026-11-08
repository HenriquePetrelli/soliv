import type { ReactNode } from "react";
import { Skeleton } from "@/components/ui/skeleton";
import PageHeader from "@/components/PageHeader";
import { SkeletonSectionCard } from "@/components/skeletons/Skeletons";
import { INSTRUMENTS } from "@/lib/screenings";
import { HABIT_CATALOG, type HabitKind } from "@/lib/habits";
import { soundsData } from "@/data/soundsData";
import {
  AdminDashboardSkeleton,
  AppointmentsSkeleton,
  BreathingBodySkeleton,
  CallSkeleton,
  CardListSkeleton,
  ChatListSkeleton,
  CompanyBenefitBodySkeleton,
  CompanyPortalBodySkeleton,
  FormCardSkeleton,
  HabitCatalogSkeleton,
  HabitDetailSkeleton,
  HabitFormSkeleton,
  HomeSkeleton,
  IconCardSkeleton,
  IntroLinesSkeleton,
  JournalBodySkeleton,
  MindfulEatingBodySkeleton,
  NotificationsBodySkeleton,
  ProfileSkeleton,
  PsychologistAvailabilitySkeleton,
  PsychologistConsultationsSkeleton,
  PsychologistDashboardSkeleton,
  PsychologistNotificationsSkeleton,
  PsychologistPaymentsSkeleton,
  PsychologistProfileBodySkeleton,
  PublicPageSkeleton,
  QuestionnaireFormSkeleton,
  SafetyPlanEditorSkeleton,
  SafetyPlanViewSkeleton,
  QuestionnairesBodySkeleton,
  ScreenSkeleton,
  SoundFeedbackSkeleton,
  SoundListSkeleton,
  SoundPlayerSkeleton,
  SoundsBodySkeleton,
  StatisticsSkeleton,
  SubscriptionPlansBodySkeleton,
  SubscriptionResultSkeleton,
  SupportBodySkeleton,
  SupportGroupDetailSkeleton,
  SupportGroupsBodySkeleton,
} from "@/components/skeletons/PageSkeletons";

/** Blocos altos e arredondados (hábitos, planos, diário). */
const blocks = (count: number, height = "h-32") => (
  <div className="space-y-3">
    {Array.from({ length: count }).map((_, i) => (
      <Skeleton key={i} className={`${height} w-full rounded-2xl`} />
    ))}
  </div>
);

/** Título do formulário de um tipo de hábito ("Beber água"); vazio se o tipo não existe. */
const habitTitle = (kind: string) => HABIT_CATALOG[kind as HabitKind]?.title ?? "";

/** Nome da categoria ou playlist de sons, como no cabeçalho da tela. */
const soundGroupTitle = (group: "categories" | "subcategories", id: string) =>
  (soundsData[group] as Record<string, { title: string }>)[id]?.title ?? "";

/** Nome do som aberto no player. */
const soundTitle = (id: string) => {
  for (const group of [soundsData.categories, soundsData.subcategories] as Record<string, { sounds: { id: string; name: string }[] }>[]) {
    for (const entry of Object.values(group)) {
      const found = entry.sounds.find((sound) => sound.id === id);
      if (found) return found.name;
    }
  }
  return "";
};

const screen = (title: string, body: ReactNode, maxWidth?: string) => (
  <ScreenSkeleton title={title} maxWidth={maxWidth}>
    {body}
  </ScreenSkeleton>
);

/**
 * Skeleton de cada endereço, na ordem: o primeiro que casa vale. Endereço sem
 * entrada (inexistente) mostra só o fundo, nunca o skeleton de outra tela; o
 * teste de rotas garante que toda tela do app tem a sua.
 */
const skeletonRoutes: { match: RegExp; render: (pathname: string) => ReactNode }[] = [
  // Públicas: só o fundo (a tela de entrada aparece em seguida).
  { match: /^\/($|signup-type|patient-signup|psychologist-signup|psicologo\/concluir-cadastro|admin\/verificacao|reset-password|termos|privacidade)/, render: () => <PublicPageSkeleton /> },

  // Paciente, telas com a barra do app (sem cabeçalho roxo).
  { match: /^\/home\/?$/, render: () => <HomeSkeleton /> },
  { match: /^\/profile\/?$/, render: () => <ProfileSkeleton /> },
  { match: /^\/appointments\/?$/, render: () => <AppointmentsSkeleton /> },
  { match: /^\/chat\/?$/, render: () => <ChatListSkeleton /> },
  { match: /^\/statistics\/activity-history/, render: () => screen("Histórico completo", <SkeletonSectionCard rows={6} accent="primary" />, "max-w-3xl") },
  { match: /^\/statistics\/?$/, render: () => <StatisticsSkeleton /> },
  { match: /^\/notifications\/?$/, render: () => <NotificationsBodySkeleton /> },

  // Paciente, telas com cabeçalho roxo.
  { match: /^\/habitos\/?$/, render: () => screen("Meus hábitos", <><IntroLinesSkeleton lines={1} />{blocks(2)}</>) },
  { match: /^\/habitos\/novo\/?$/, render: () => screen("Adicionar hábito", <HabitCatalogSkeleton />) },
  { match: /^\/habitos\/novo\/[^/]+\/?$/, render: (pathname) => screen(habitTitle(pathname.split("/")[3]), <HabitFormSkeleton />) },
  { match: /^\/habitos\/[^/]+\/editar\/?$/, render: () => screen("Editar hábito", <HabitFormSkeleton />) },
  { match: /^\/habitos\//, render: () => screen("Hábito", <HabitDetailSkeleton />) },
  { match: /^\/journal/, render: () => screen("Meu Diário", <JournalBodySkeleton />) },
  { match: /^\/support-groups/, render: () => screen("Grupos de Apoio", <SupportGroupsBodySkeleton />, "max-w-7xl") },
  { match: /^\/support-group\//, render: () => screen("Grupo de Apoio", <SupportGroupDetailSkeleton />) },
  { match: /^\/safety-plan\/?$/, render: () => screen("Planos de segurança", <><IntroLinesSkeleton lines={3} /><Skeleton className="h-11 w-full rounded-lg" />{blocks(2, "h-20")}</>) },
  { match: /^\/safety-plan\/[^/]+\/ver\/?$/, render: () => screen("Plano de segurança", <SafetyPlanViewSkeleton />) },
  { match: /^\/safety-plan\/novo\/?$/, render: () => screen("Novo plano de segurança", <SafetyPlanEditorSkeleton />) },
  { match: /^\/safety-plan\//, render: () => screen("Editar plano de segurança", <SafetyPlanEditorSkeleton />) },
  { match: /^\/beneficio-empresa/, render: () => screen("Benefício da empresa", <CompanyBenefitBodySkeleton />) },
  { match: /^\/empresa/, render: () => screen("Portal da empresa", <CompanyPortalBodySkeleton />) },
  { match: /^\/sounds\/?$/, render: () => screen("Sons terapêuticos", <SoundsBodySkeleton />, "max-w-5xl") },
  { match: /^\/sounds\/category\/[^/]+/, render: (pathname) => screen(soundGroupTitle("categories", pathname.split("/")[3]), <SoundListSkeleton />, "max-w-4xl") },
  { match: /^\/sounds\/subcategory\/[^/]+/, render: (pathname) => screen(soundGroupTitle("subcategories", pathname.split("/")[3]), <SoundListSkeleton withDescription={false} />, "max-w-4xl") },
  { match: /^\/sounds\/player\/playlist\//, render: () => screen("", <SoundPlayerSkeleton />, "max-w-md") },
  { match: /^\/sounds\/player\/[^/]+/, render: (pathname) => screen(soundTitle(pathname.split("/")[3]), <SoundPlayerSkeleton />, "max-w-md") },
  { match: /^\/sounds\/feedback/, render: () => <SoundFeedbackSkeleton /> },
  { match: /^\/sounds\//, render: () => screen("", <CardListSkeleton count={4} />, "max-w-4xl") },
  { match: /^\/breathing/, render: () => screen("Respiração Guiada", <BreathingBodySkeleton />, "max-w-5xl") },
  { match: /^\/comer-com-atencao/, render: () => screen("Comer com atenção", <MindfulEatingBodySkeleton />, "max-w-xl") },
  { match: /^\/questionarios\/?$/, render: () => screen("Questionários do mês", <><IntroLinesSkeleton lines={4} /><QuestionnairesBodySkeleton /></>) },
  { match: /^\/questionarios\/gad7\/?$/, render: () => screen(INSTRUMENTS.gad7.title, <QuestionnaireFormSkeleton />) },
  { match: /^\/questionarios\/phq9\/?$/, render: () => screen(INSTRUMENTS.phq9.title, <QuestionnaireFormSkeleton />) },
  { match: /^\/questionarios\//, render: () => screen("", <QuestionnaireFormSkeleton />) },
  { match: /^\/sos/, render: () => screen("Solicitar ajuda", <><IconCardSkeleton withButton /><CardListSkeleton count={2} /></>, "max-w-md") },
  { match: /^\/account-settings/, render: () => screen("Alterar Dados da Conta", <><FormCardSkeleton fields={2} /><FormCardSkeleton fields={3} /><Skeleton className="h-72 w-full rounded-xl" /></>, "max-w-md") },
  { match: /^\/(paciente|psicologo)\/suporte/, render: () => screen("Suporte", <SupportBodySkeleton />, "max-w-3xl") },
  { match: /^\/achievements/, render: () => screen("Minhas conquistas", <CardListSkeleton count={5} />, "max-w-3xl") },
  { match: /^\/subscription-plans/, render: () => screen("Planos de Assinatura", <SubscriptionPlansBodySkeleton />, "max-w-4xl") },
  { match: /^\/subscription-(success|cancel)/, render: () => <SubscriptionResultSkeleton /> },
  { match: /^\/avulso\/sucesso/, render: () => <SubscriptionResultSkeleton /> },

  // Chamadas de vídeo.
  { match: /^\/(consultation-call|emergency-call|emergency\/call)/, render: () => <CallSkeleton /> },

  // Psicólogo.
  { match: /^\/psychologist-dashboard/, render: () => <PsychologistDashboardSkeleton /> },
  { match: /^\/psicologo\/consultas/, render: () => <PsychologistConsultationsSkeleton /> },
  { match: /^\/psychologist-profile/, render: () => <PsychologistProfileBodySkeleton /> },
  { match: /^\/psychologist-availability/, render: () => <PsychologistAvailabilitySkeleton /> },
  { match: /^\/psychologist-payments/, render: () => <PsychologistPaymentsSkeleton /> },
  { match: /^\/psychologist-notifications/, render: () => <PsychologistNotificationsSkeleton /> },
  { match: /^\/admin-notifications/, render: () => <AdminDashboardSkeleton /> },

  // Admin.
  { match: /^\/admin-dashboard/, render: () => <AdminDashboardSkeleton /> },
];

/** Se o endereço tem skeleton próprio (usado no teste de cobertura das rotas). */
export const hasRouteSkeleton = (pathname: string): boolean => skeletonRoutes.some((route) => route.match.test(pathname));

export const routeSkeletonFor = (pathname: string): ReactNode =>
  (skeletonRoutes.find((route) => route.match.test(pathname))?.render ?? (() => <PublicPageSkeleton />))(pathname);

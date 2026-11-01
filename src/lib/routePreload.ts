import { matchPath } from "react-router-dom";
import { afterPageSettles, isConstrainedNetwork } from "@/lib/idle";

/**
 * Código de cada tela, para baixar antes de precisar.
 *
 * - Ao abrir o app num endereço (link, recarregar, digitar outro endereço), o
 *   código da tela começa a baixar na hora, junto com a conferência da conta.
 *   Antes, ele só era pedido depois dessa conferência, uma coisa esperando a
 *   outra.
 * - Depois de saber quem entrou, as abas principais daquele tipo de conta são
 *   baixadas em segundo plano (e não as do paciente para todo mundo).
 *
 * Os caminhos são os mesmos de `import()` em App.tsx: o navegador baixa cada
 * arquivo uma vez só. O teste routePreload confere que toda rota do App está aqui.
 */
type Loader = () => Promise<unknown>;

const page = {
  Index: () => import("@/pages/Index"),
  SignupType: () => import("@/pages/SignupType"),
  PatientSignUp: () => import("@/pages/PatientSignUp"),
  PsychologistSignUpPublic: () => import("@/pages/PsychologistSignUpPublic"),
  PsychologistCompleteSignup: () => import("@/pages/PsychologistCompleteSignup"),
  LegalDocument: () => import("@/pages/LegalDocument"),
  ResetPassword: () => import("@/pages/ResetPassword"),
  Home: () => import("@/pages/Home"),
  Chat: () => import("@/pages/Chat"),
  Profile: () => import("@/pages/Profile"),
  Appointments: () => import("@/pages/Appointments"),
  Notifications: () => import("@/pages/Notifications"),
  Statistics: () => import("@/pages/Statistics"),
  SupportGroups: () => import("@/pages/SupportGroups"),
  SupportGroupDetail: () => import("@/pages/SupportGroupDetail"),
  SafetyPlans: () => import("@/pages/SafetyPlans"),
  SafetyPlanView: () => import("@/pages/SafetyPlanView"),
  SafetyPlanEditor: () => import("@/pages/SafetyPlanEditor"),
  CompanyBenefit: () => import("@/pages/CompanyBenefit"),
  CompanyPortal: () => import("@/pages/CompanyPortal"),
  Habits: () => import("@/pages/Habits"),
  HabitSetup: () => import("@/pages/HabitSetup"),
  HabitDetail: () => import("@/pages/HabitDetail"),
  PrivateJournal: () => import("@/pages/PrivateJournal"),
  SoundsLibrary: () => import("@/pages/SoundsLibrary"),
  SoundCategory: () => import("@/pages/SoundCategory"),
  SoundPlayer: () => import("@/pages/SoundPlayer"),
  SoundFeedback: () => import("@/pages/SoundFeedback"),
  GuidedBreathing: () => import("@/pages/GuidedBreathing"),
  MindfulEating: () => import("@/pages/MindfulEating"),
  Questionnaires: () => import("@/pages/Questionnaires"),
  QuestionnaireForm: () => import("@/pages/QuestionnaireForm"),
  SOS: () => import("@/pages/SOS"),
  AccountSettings: () => import("@/pages/AccountSettings"),
  Support: () => import("@/pages/Support"),
  Achievements: () => import("@/pages/Achievements"),
  ActivityHistory: () => import("@/pages/ActivityHistory"),
  SubscriptionPlans: () => import("@/pages/SubscriptionPlans"),
  SubscriptionSuccess: () => import("@/pages/SubscriptionSuccess"),
  SubscriptionCancel: () => import("@/pages/SubscriptionCancel"),
  ConsultationCall: () => import("@/pages/ConsultationCall"),
  EmergencyCall: () => import("@/pages/EmergencyCall"),
  PsychologistDashboard: () => import("@/pages/PsychologistDashboard"),
  PsychologistProfile: () => import("@/pages/PsychologistProfile"),
  PsychologistConsultations: () => import("@/pages/PsychologistConsultations"),
  PsychologistAvailability: () => import("@/pages/PsychologistAvailability"),
  PsychologistSupport: () => import("@/pages/PsychologistSupport"),
  PsychologistPayments: () => import("@/pages/PsychologistPayments"),
  AdminDashboard: () => import("@/pages/AdminDashboard"),
  AdminMfaVerification: () => import("@/pages/AdminMfaVerification"),
} satisfies Record<string, Loader>;

/** Rota do App (mesma escrita do `path`) e o código da tela dela. */
export const ROUTE_LOADERS: [string, Loader][] = [
  ["/", page.Index],
  ["/signup-type", page.SignupType],
  ["/patient-signup", page.PatientSignUp],
  ["/psychologist-signup", page.PsychologistSignUpPublic],
  ["/psicologo/concluir-cadastro", page.PsychologistCompleteSignup],
  ["/termos", page.LegalDocument],
  ["/termos-psicologo", page.LegalDocument],
  ["/privacidade", page.LegalDocument],
  ["/reset-password", page.ResetPassword],
  ["/home", page.Home],
  ["/chat", page.Chat],
  ["/profile", page.Profile],
  ["/appointments", page.Appointments],
  ["/notifications", page.Notifications],
  ["/statistics", page.Statistics],
  ["/statistics/activity-history", page.ActivityHistory],
  ["/support-groups", page.SupportGroups],
  ["/support-group/:groupId", page.SupportGroupDetail],
  ["/safety-plan", page.SafetyPlans],
  ["/safety-plan/:planId/ver", page.SafetyPlanView],
  ["/safety-plan/:planId", page.SafetyPlanEditor],
  ["/beneficio-empresa", page.CompanyBenefit],
  ["/empresa", page.CompanyPortal],
  ["/habitos", page.Habits],
  ["/habitos/novo", page.HabitSetup],
  ["/habitos/novo/:kind", page.HabitSetup],
  ["/habitos/:habitId", page.HabitDetail],
  ["/habitos/:habitId/editar", page.HabitSetup],
  ["/journal", page.PrivateJournal],
  ["/sounds", page.SoundsLibrary],
  ["/sounds/category/:categoryId", page.SoundCategory],
  ["/sounds/subcategory/:subcategoryId", page.SoundCategory],
  ["/sounds/player/:soundId", page.SoundPlayer],
  ["/sounds/player/playlist/:playlistId", page.SoundPlayer],
  ["/sounds/feedback", page.SoundFeedback],
  ["/breathing", page.GuidedBreathing],
  ["/comer-com-atencao", page.MindfulEating],
  ["/questionarios", page.Questionnaires],
  ["/questionarios/:instrument", page.QuestionnaireForm],
  ["/sos", page.SOS],
  ["/account-settings", page.AccountSettings],
  ["/paciente/suporte", page.Support],
  ["/achievements", page.Achievements],
  ["/subscription-plans", page.SubscriptionPlans],
  ["/subscription-success", page.SubscriptionSuccess],
  ["/subscription-cancel", page.SubscriptionCancel],
  ["/consultation-call/:appointmentId", page.ConsultationCall],
  ["/emergency-call", page.EmergencyCall],
  ["/emergency-call/request/:requestId", page.EmergencyCall],
  ["/emergency-call/:sessionId", page.EmergencyCall],
  ["/emergency/call/:requestId", page.EmergencyCall],
  ["/psychologist-dashboard", page.PsychologistDashboard],
  ["/psychologist-profile", page.PsychologistProfile],
  ["/psicologo/consultas", page.PsychologistConsultations],
  ["/psychologist-availability", page.PsychologistAvailability],
  ["/psicologo/suporte", page.PsychologistSupport],
  ["/psychologist-payments", page.PsychologistPayments],
  ["/psychologist-notifications", page.Notifications],
  ["/admin/verificacao", page.AdminMfaVerification],
  ["/admin-dashboard", page.AdminDashboard],
  ["/admin-notifications", page.Notifications],
];

const preloaded = new Set<Loader>();

const load = (loader: Loader) => {
  if (preloaded.has(loader)) return;
  preloaded.add(loader);
  // Falha ao baixar antes da hora não importa: a tela tenta de novo ao abrir.
  loader().catch(() => preloaded.delete(loader));
};

/** Código da tela de um endereço (ex.: "/habitos/abc"); nada se não existe. */
export const loaderForPath = (pathname: string): Loader | undefined =>
  ROUTE_LOADERS.find(([pattern]) => matchPath({ path: pattern, end: true }, pathname))?.[1];

export const preloadRoute = (pathname: string) => {
  const loader = loaderForPath(pathname);
  if (loader) load(loader);
};

/** Abas principais de cada tipo de conta. */
const CORE_ROUTES: Record<string, string[]> = {
  patient: ["/home", "/appointments", "/sos", "/chat", "/statistics", "/profile"],
  psychologist: ["/psychologist-dashboard", "/psicologo/consultas", "/psychologist-availability", "/chat", "/psychologist-profile"],
  admin: ["/admin-dashboard"],
};

/**
 * Depois de saber quem entrou, baixa em segundo plano as abas dessa pessoa:
 * só depois que a tela atual terminou de carregar, uma aba por vez, e nada em
 * conexão lenta ou com economia de dados (lá cada aba baixa ao ser aberta).
 * Antes começava assim que o navegador ficava ocioso e pedia as seis de uma
 * vez, disputando a rede com os dados da tela que a pessoa estava esperando.
 */
export const preloadCoreRoutesFor = (userType: string) => {
  const routes = CORE_ROUTES[userType];
  if (!routes) return;
  afterPageSettles(
    () => {
      if (isConstrainedNetwork()) return;
      const queue = routes.map(loaderForPath).filter((loader): loader is Loader => Boolean(loader) && !preloaded.has(loader!));
      const next = () => {
        const loader = queue.shift();
        if (!loader) return;
        preloaded.add(loader);
        loader()
          .catch(() => preloaded.delete(loader))
          .finally(() => afterPageSettles(next, { idleTimeoutMs: 1500 }));
      };
      next();
    },
    { minDelayMs: 1500 },
  );
};

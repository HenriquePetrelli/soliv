import { Toaster } from "@/components/ui/toaster";
import { Toaster as Sonner } from "@/components/ui/sonner";
import { ThemeProvider } from "next-themes";
import { QueryClient, QueryClientProvider } from "@tanstack/react-query";
import { BrowserRouter, Routes, Route, Outlet } from "react-router-dom";
import { SubscriptionProvider } from "@/contexts/SubscriptionContext";
import { AuthProvider, useAuth } from "@/contexts/AuthContext";
import { lazy, Suspense, type ReactNode } from "react";
import RouteGuard from "@/components/RouteGuard";
import MainLayout from "@/components/MainLayout";
import BackgroundWrapper from "@/components/BackgroundWrapper";
import RouteSkeleton from "@/components/skeletons/RouteSkeleton";
import PendingFeedbackGate from "@/components/sos/PendingFeedbackGate";
import AppErrorBoundary from "@/components/AppErrorBoundary";
import DeferredMount from "@/components/DeferredMount";

// Persistent layout: MainLayout stays mounted across nested routes,
// so sidebar/bottom nav never re-render when switching between them.
// Suspense is inside the layout so lazy page swaps don't unmount the nav.
const MainLayoutOutlet = () => (
  <MainLayout>
    <Suspense fallback={<RouteSkeleton />}>
      <Outlet />
    </Suspense>
  </MainLayout>
);

// Mesmo padrão para o psicólogo: menu lateral/barra inferior não remontam.
const PsychologistLayoutOutlet = () => (
  <Suspense fallback={<RouteSkeleton />}>
    <PsychologistLayout>
      <Suspense fallback={<RouteSkeleton />}>
        <Outlet />
      </Suspense>
    </PsychologistLayout>
  </Suspense>
);

// Fora do pacote inicial: cada tipo de conta baixa só o que usa. O paciente
// (a maioria) não baixa o layout do psicólogo nem o do admin, e quem está
// deslogado não baixa nenhum dos três nem o pedido de aceite dos termos (que
// traz o texto completo dos Termos e da Política).
const PsychologistLayout = lazy(() => import("@/components/psychologist/layout/PsychologistLayout"));
const AdminLayout = lazy(() => import("@/components/admin/AdminLayout"));
const AdminMfaGate = lazy(() => import("@/components/admin/AdminMfaGate"));
const LegalAcceptanceGate = lazy(() => import("@/components/legal/LegalAcceptanceGate"));

// Push (toque no aviso, aviso com o app aberto, renovar o token) e a
// conferência de bloqueio: montados só depois que a primeira tela aparece
// (DeferredMount), para não disputar a rede com ela.
const PushBridge = lazy(() => import("./components/PushBridge"));
const AccountStatusWatcher = lazy(() => import("./components/AccountStatusWatcher"));

// Lazy load all pages for better performance
const Index = lazy(() => import("./pages/Index"));
const SignupType = lazy(() => import("./pages/SignupType"));
const PatientSignUp = lazy(() => import("./pages/PatientSignUp"));
const PsychologistSignUpPublic = lazy(() => import("./pages/PsychologistSignUpPublic"));
const PsychologistCompleteSignup = lazy(() => import("./pages/PsychologistCompleteSignup"));
const AdminMfaVerification = lazy(() => import("./pages/AdminMfaVerification"));
const Home = lazy(() => import("./pages/Home"));
const SoundsLibrary = lazy(() => import("./pages/SoundsLibrary"));
const SoundCategory = lazy(() => import("./pages/SoundCategory"));
const SoundPlayer = lazy(() => import("./pages/SoundPlayer"));
const SoundFeedback = lazy(() => import("./pages/SoundFeedback"));
const GuidedBreathing = lazy(() => import("./pages/GuidedBreathing"));
const MindfulEating = lazy(() => import("./pages/MindfulEating"));
const Questionnaires = lazy(() => import("./pages/Questionnaires"));
const QuestionnaireForm = lazy(() => import("./pages/QuestionnaireForm"));
const SOS = lazy(() => import("./pages/SOS"));
const Profile = lazy(() => import("./pages/Profile"));
const AccountSettings = lazy(() => import("./pages/AccountSettings"));
const Support = lazy(() => import("./pages/Support"));
const PsychologistSupport = lazy(() => import("./pages/PsychologistSupport"));
const Appointments = lazy(() => import("./pages/Appointments"));
const Notifications = lazy(() => import("./pages/Notifications"));
const Statistics = lazy(() => import("./pages/Statistics"));
const Achievements = lazy(() => import("./pages/Achievements"));
const ActivityHistory = lazy(() => import("./pages/ActivityHistory"));
const SubscriptionPlans = lazy(() => import("./pages/SubscriptionPlans"));
const SubscriptionSuccess = lazy(() => import("./pages/SubscriptionSuccess"));
const SubscriptionCancel = lazy(() => import("./pages/SubscriptionCancel"));
const AdminDashboard = lazy(() => import("./pages/AdminDashboard"));
const PsychologistDashboard = lazy(() => import("./pages/PsychologistDashboard"));
const PsychologistProfile = lazy(() => import("./pages/PsychologistProfile"));
const PsychologistConsultations = lazy(() => import("./pages/PsychologistConsultations"));
const PsychologistAvailability = lazy(() => import("./pages/PsychologistAvailability"));
const SafetyPlans = lazy(() => import("./pages/SafetyPlans"));
const SafetyPlanEditor = lazy(() => import("./pages/SafetyPlanEditor"));
const SafetyPlanView = lazy(() => import("./pages/SafetyPlanView"));
const Habits = lazy(() => import("./pages/Habits"));
const CompanyBenefit = lazy(() => import("./pages/CompanyBenefit"));
const CompanyPortal = lazy(() => import("./pages/CompanyPortal"));
const HabitSetup = lazy(() => import("./pages/HabitSetup"));
const HabitDetail = lazy(() => import("./pages/HabitDetail"));
const PsychologistPayments = lazy(() => import("./pages/PsychologistPayments"));
const EmergencyCall = lazy(() => import("./pages/EmergencyCall"));
const Chat = lazy(() => import("./pages/Chat"));
const ConsultationCall = lazy(() => import("./pages/ConsultationCall"));
const SupportGroups = lazy(() => import("./pages/SupportGroups"));
const SupportGroupDetail = lazy(() => import("./pages/SupportGroupDetail"));
const PrivateJournal = lazy(() => import("./pages/PrivateJournal"));
// Sem carregamento separado: endereço errado mostra o aviso na hora.
import NotFound from "./pages/NotFound";
const LegalDocument = lazy(() => import("./pages/LegalDocument"));
const ResetPassword = lazy(() => import("./pages/ResetPassword"));

/** Só monta para quem está logado (deslogado não baixa o código). */
const LoggedInOnly = ({ children }: { children: ReactNode }) => {
  const { user } = useAuth();
  return user ? <>{children}</> : null;
};

const queryClient = new QueryClient({
  defaultOptions: {
    queries: {
      staleTime: 1000 * 60, // 1 min cache - reduces redundant Supabase calls
      gcTime: 1000 * 60 * 5,
      refetchOnWindowFocus: false,
      retry: 1,
    },
  },
});

const App = () => {
  return (
    <AppErrorBoundary>
    <QueryClientProvider client={queryClient}>
      <ThemeProvider
        attribute="class"
        defaultTheme="system"
        enableSystem
        disableTransitionOnChange
      >
          <AuthProvider>
            <SubscriptionProvider>
              <Toaster />
              <Sonner />
              <BrowserRouter>
                <BackgroundWrapper>
                  <Suspense fallback={<RouteSkeleton />}>

                    <Routes>
                  {/* Rotas Públicas */}
                  <Route path="/" element={
                    <RouteGuard allowedUserTypes={['public']}>
                      <Index />
                    </RouteGuard>
                  } />
                  <Route path="/signup-type" element={
                    <RouteGuard allowedUserTypes={['public']}>
                      <SignupType />
                    </RouteGuard>
                  } />
                  <Route path="/patient-signup" element={
                    <RouteGuard allowedUserTypes={['public']}>
                      <PatientSignUp />
                    </RouteGuard>
                  } />
                  <Route path="/psicologo/concluir-cadastro" element={
                    <RouteGuard allowedUserTypes={['public']}>
                      <PsychologistCompleteSignup />
                    </RouteGuard>
                  } />
                  <Route path="/psychologist-signup" element={
                    <RouteGuard allowedUserTypes={['public']}>
                      <PsychologistSignUpPublic />
                    </RouteGuard>
                  } />

                  {/* Termos e Política: abertos a todos, com ou sem login */}
                  <Route path="/termos" element={<LegalDocument document="terms_patient" />} />
                  <Route path="/termos-psicologo" element={<LegalDocument document="terms_psychologist" />} />
                  <Route path="/privacidade" element={<LegalDocument document="privacy_policy" />} />
                  {/* Destino do link de recuperação de senha (sessão temporária do Supabase) */}
                  <Route path="/reset-password" element={<ResetPassword />} />

                  {/* Rotas do Paciente com Layout Principal persistente */}
                  <Route element={<MainLayoutOutlet />}>
                    <Route path="/home" element={
                      <RouteGuard allowedUserTypes={['patient']}>
                        <Home />
                      </RouteGuard>
                    } />
                    <Route path="/chat" element={
                      <RouteGuard allowedUserTypes={['patient', 'psychologist']}>
                        <Chat />
                      </RouteGuard>
                    } />
                    <Route path="/profile" element={
                      <RouteGuard allowedUserTypes={['patient']}>
                        <Profile />
                      </RouteGuard>
                    } />
                    <Route path="/appointments" element={
                      <RouteGuard allowedUserTypes={['patient']}>
                        <Appointments />
                      </RouteGuard>
                    } />
                    <Route path="/notifications" element={
                      <RouteGuard allowedUserTypes={['patient']}>
                        <Notifications />
                      </RouteGuard>
                    } />
                    <Route path="/statistics" element={
                      <RouteGuard allowedUserTypes={['patient']}>
                        <Statistics />
                      </RouteGuard>
                    } />
                  </Route>


                  {/* Outras rotas do Paciente sem Layout Principal */}
                  <Route path="/support-groups" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <SupportGroups />
                    </RouteGuard>
                  } />
                  <Route path="/support-group/:groupId" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <SupportGroupDetail />
                    </RouteGuard>
                  } />
                  <Route path="/safety-plan" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <SafetyPlans />
                    </RouteGuard>
                  } />
                  <Route path="/safety-plan/:planId/ver" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <SafetyPlanView />
                    </RouteGuard>
                  } />
                  <Route path="/safety-plan/:planId" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <SafetyPlanEditor />
                    </RouteGuard>
                  } />
                  <Route path="/beneficio-empresa" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <CompanyBenefit />
                    </RouteGuard>
                  } />
                  <Route path="/empresa" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <CompanyPortal />
                    </RouteGuard>
                  } />
                  <Route path="/habitos" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <Habits />
                    </RouteGuard>
                  } />
                  <Route path="/habitos/novo" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <HabitSetup />
                    </RouteGuard>
                  } />
                  <Route path="/habitos/novo/:kind" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <HabitSetup />
                    </RouteGuard>
                  } />
                  <Route path="/habitos/:habitId" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <HabitDetail />
                    </RouteGuard>
                  } />
                  <Route path="/habitos/:habitId/editar" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <HabitSetup />
                    </RouteGuard>
                  } />
                  <Route path="/journal" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <PrivateJournal />
                    </RouteGuard>
                  } />
                  <Route path="/sounds" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <SoundsLibrary />
                    </RouteGuard>
                  } />
                  <Route path="/sounds/category/:categoryId" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <SoundCategory />
                    </RouteGuard>
                  } />
                  <Route path="/sounds/subcategory/:subcategoryId" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <SoundCategory />
                    </RouteGuard>
                  } />
                  <Route path="/sounds/player/:soundId" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <SoundPlayer />
                    </RouteGuard>
                  } />
                  <Route path="/sounds/player/playlist/:playlistId" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <SoundPlayer />
                    </RouteGuard>
                  } />
                  <Route path="/sounds/feedback" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <SoundFeedback />
                    </RouteGuard>
                  } />
                  <Route path="/breathing" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <GuidedBreathing />
                    </RouteGuard>
                  } />
                  <Route path="/comer-com-atencao" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <MindfulEating />
                    </RouteGuard>
                  } />
                  <Route path="/questionarios" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <Questionnaires />
                    </RouteGuard>
                  } />
                  <Route path="/questionarios/:instrument" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <QuestionnaireForm />
                    </RouteGuard>
                  } />
                  <Route path="/sos" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <SOS />
                    </RouteGuard>
                  } />
                  <Route path="/account-settings" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <AccountSettings />
                    </RouteGuard>
                  } />
                  <Route path="/paciente/suporte" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <Support />
                    </RouteGuard>
                  } />
                  <Route path="/achievements" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <Achievements />
                    </RouteGuard>
                  } />
                  <Route path="/statistics/activity-history" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <ActivityHistory />
                    </RouteGuard>
                  } />
                  <Route path="/subscription-plans" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <SubscriptionPlans />
                    </RouteGuard>
                  } />
                  <Route path="/subscription-success" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <SubscriptionSuccess />
                    </RouteGuard>
                  } />
                  <Route path="/subscription-cancel" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <SubscriptionCancel />
                    </RouteGuard>
                  } />
                  <Route path="/consultation-call/:appointmentId" element={
                    <RouteGuard allowedUserTypes={['patient', 'psychologist']}>
                      <ConsultationCall />
                    </RouteGuard>
                  } />
                  
                  {/* Rotas de Emergência */}
                  <Route path="/emergency-call" element={
                    <RouteGuard allowedUserTypes={['patient', 'psychologist']}>
                      <EmergencyCall />
                    </RouteGuard>
                  } />
                  
                  {/* Rota de emergência para pacientes (usando requestId) */}
                  <Route path="/emergency-call/request/:requestId" element={
                    <RouteGuard allowedUserTypes={['patient']}>
                      <EmergencyCall />
                    </RouteGuard>
                  } />
                  
                  {/* Rota de emergência para psicólogos e pacientes (usando sessionId) */}
                  <Route path="/emergency-call/:sessionId" element={
                    <RouteGuard allowedUserTypes={['patient', 'psychologist']}>
                      <EmergencyCall />
                    </RouteGuard>
                  } />
                  
                  {/* Rota legacy para psicólogos */}
                  <Route path="/emergency/call/:requestId" element={
                    <RouteGuard allowedUserTypes={['psychologist']}>
                      <EmergencyCall />
                    </RouteGuard>
                  } />

                  {/* Rotas do Psicólogo: as principais no layout persistente (menu
                      lateral e barra inferior); suporte é tela interna. */}
                  <Route element={<PsychologistLayoutOutlet />}>
                    <Route path="/psychologist-dashboard" element={
                      <RouteGuard allowedUserTypes={['psychologist']}>
                        <PsychologistDashboard />
                      </RouteGuard>
                    } />
                    <Route path="/psicologo/consultas" element={
                      <RouteGuard allowedUserTypes={['psychologist']}>
                        <PsychologistConsultations />
                      </RouteGuard>
                    } />
                    <Route path="/psychologist-availability" element={
                      <RouteGuard allowedUserTypes={['psychologist']}>
                        <PsychologistAvailability />
                      </RouteGuard>
                    } />
                    <Route path="/psychologist-payments" element={
                      <RouteGuard allowedUserTypes={['psychologist']}>
                        <PsychologistPayments />
                      </RouteGuard>
                    } />
                    <Route path="/psychologist-profile" element={
                      <RouteGuard allowedUserTypes={['psychologist']}>
                        <PsychologistProfile />
                      </RouteGuard>
                    } />
                    <Route path="/psychologist-notifications" element={
                      <RouteGuard allowedUserTypes={['psychologist']}>
                        <Notifications />
                      </RouteGuard>
                    } />
                  </Route>
                  <Route path="/psicologo/suporte" element={
                    <RouteGuard allowedUserTypes={['psychologist']}>
                      <PsychologistSupport />
                    </RouteGuard>
                  } />

                  {/* Rotas do Admin */}
                  <Route path="/admin/verificacao" element={
                    <RouteGuard allowedUserTypes={['admin']}>
                      <AdminMfaVerification />
                    </RouteGuard>
                  } />
                  <Route path="/admin-dashboard" element={
                    <RouteGuard allowedUserTypes={['admin']}>
                      <AdminMfaGate>
                        <AdminDashboard />
                      </AdminMfaGate>
                    </RouteGuard>
                  } />
                  <Route path="/admin-notifications" element={
                    <RouteGuard allowedUserTypes={['admin']}>
                      <AdminMfaGate>
                        <AdminLayout active="notifications">
                          <Notifications />
                        </AdminLayout>
                      </AdminMfaGate>
                    </RouteGuard>
                  } />

                    {/* Rota 404 */}
                    <Route path="*" element={<NotFound />} />
                  </Routes>
                  </Suspense>
                  <PendingFeedbackGate />
                  <DeferredMount>
                    <Suspense fallback={null}>
                      <PushBridge />
                      <AccountStatusWatcher />
                    </Suspense>
                  </DeferredMount>
                  <LoggedInOnly>
                    <Suspense fallback={null}>
                      <LegalAcceptanceGate />
                    </Suspense>
                  </LoggedInOnly>
                </BackgroundWrapper>

              </BrowserRouter>
          </SubscriptionProvider>
        </AuthProvider>
    </ThemeProvider>
  </QueryClientProvider>
    </AppErrorBoundary>
  );
};

export default App;

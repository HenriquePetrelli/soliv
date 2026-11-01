import React, { useState, useEffect, lazy, Suspense } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, User } from "lucide-react";
import logoImg from '@/assets/soliv-logo.webp';
import Wordmark from '@/components/Wordmark';
import { Button } from "@/components/ui/button";
import { NotificationButton } from "@/components/notifications/NotificationButton";
import BottomNavigation from "@/components/BottomNavigation";
import ConfirmationModal from "@/components/sos/ConfirmationModal";
import { DesktopSidebar } from "@/components/DesktopSidebar";
import { useAuth } from "@/contexts/AuthContext";
import { supabase } from "@/integrations/supabase/client";
import { useNotifications } from "@/hooks/useNotifications";
import RouteSkeleton from "@/components/skeletons/RouteSkeleton";

// Só o psicólogo usa (no /chat): fora do pacote do paciente.
const PsychologistLayout = lazy(() => import("@/components/psychologist/layout/PsychologistLayout"));

interface MainLayoutProps {
  children: React.ReactNode;
}

const MainLayout: React.FC<MainLayoutProps> = ({ children }) => {
  const location = useLocation();
  const navigate = useNavigate();
  const { user, userType } = useAuth();
  const isPatient = userType === 'patient';
  const [showSOSModal, setShowSOSModal] = useState(false);
  const [moodEnabled, setMoodEnabled] = useState(true);
  const { unreadCount } = useNotifications();
  const isNotificationsRoute = location.pathname === '/notifications';

  useEffect(() => {
    let cancelled = false;
    const loadMoodEnabled = async () => {
      if (!user?.id || !isPatient) return;
      const { data } = await supabase
        .from('patients')
        .select('daily_mood_enabled')
        .eq('user_id', user.id)
        .maybeSingle();
      if (!cancelled) setMoodEnabled(data?.daily_mood_enabled !== false);
    };
    loadMoodEnabled();

    const handleMoodToggleChange = (event: CustomEvent) => {
      setMoodEnabled(event.detail.enabled);
    };
    window.addEventListener('moodToggleChanged', handleMoodToggleChange as EventListener);
    return () => {
      cancelled = true;
      window.removeEventListener('moodToggleChanged', handleMoodToggleChange as EventListener);
    };
  }, [user?.id, isPatient]);

  // "Dias seguidos": conta o dia sempre que o paciente abre o app, não só em Meu progresso.
  useEffect(() => {
    if (!user?.id || !isPatient) return;
    // A consulta do Supabase só é enviada quando alguém espera por ela (.then).
    void supabase.rpc('update_patient_streak', { p_patient_id: user.id }).then(() => undefined);
  }, [user?.id, isPatient]);

  const handleSOSConfirm = () => {
    setShowSOSModal(false);
    navigate('/sos');
  };

  const firstName = user?.user_metadata?.full_name?.split(' ')[0] || 'Usuário';

  const getPageTitle = () => {
    switch (location.pathname) {
      case '/home':
        return `Olá, ${firstName}!`;
      case '/chat':
        return 'Chat';
      case '/profile':
        return 'Perfil';
      case '/appointments':
        return 'Consultas';
      default:
        return 'Soliv';
    }
  };

  // O Chat é das duas contas: o psicólogo vê o layout dele, nunca a barra do
  // paciente (com o SOS do paciente). Enquanto o tipo de conta não chegou, não
  // mostra barra nenhuma, para não piscar a errada.
  if (userType === 'psychologist') {
    return (
      <Suspense fallback={<RouteSkeleton />}>
        <PsychologistLayout>{children}</PsychologistLayout>
      </Suspense>
    );
  }
  if (user && userType === 'unknown' && location.pathname === '/chat') {
    return <>{children}</>;
  }

  return (
    <div className="min-h-screen">
      <div className="min-h-screen">
        <DesktopSidebar onSOSClick={() => setShowSOSModal(true)} />
        
        <div className="md:pl-64">
          {/* Mobile/Tablet Header */}
          <header className="md:hidden fixed top-0 left-0 right-0 z-50 bg-card/95 backdrop-blur-md shadow-sm border-b border-border">
            <div className="container mx-auto px-4 h-16 flex items-center justify-between">
              
              {/* PERFIL À ESQUERDA */}
              <div 
                className="w-8 h-8 rounded-full bg-primary flex items-center justify-center cursor-pointer" 
                onClick={() => navigate('/profile')}
              >
                <span className="text-primary-foreground text-sm font-medium">
                  {firstName.charAt(0).toUpperCase()}
                </span>
              </div>
              
              {/* SOLIV CENTRALIZADO - Tablet/Mobile */}
              <div className="flex items-center space-x-2 absolute left-1/2 transform -translate-x-1/2">
                <img src={logoImg} alt="Soliv" className="w-10 h-10 object-contain select-none" draggable={false} />
                <Wordmark className="h-[34px] text-primary" />
              </div>
              
              {/* NOTIFICAÇÕES À DIREITA */}
              <button 
                className={`relative p-2 rounded-full transition-colors ${
                  isNotificationsRoute
                    ? 'bg-primary/10 text-primary'
                    : 'text-muted-foreground hover:text-foreground'
                }`}
                onClick={() => navigate('/notifications')}
                aria-label="Notificações"
              >
                <Bell className="w-5 h-5" fill={isNotificationsRoute ? 'currentColor' : 'none'} />
                {unreadCount > 0 && (
                  <span className="absolute -top-0.5 -right-0.5 min-w-[16px] h-4 px-1 bg-destructive rounded-full text-xs leading-none font-semibold text-destructive-foreground flex items-center justify-center">
                    {unreadCount > 99 ? '99+' : unreadCount}
                  </span>
                )}
              </button>
            </div>
          </header>

          {/* Desktop Header */}
          {/* Fixo no topo ao rolar, como no celular. */}
          <header className="hidden md:block md:sticky md:top-0 md:z-40 bg-card/95 backdrop-blur-md border-b border-border px-6">
            <div className="max-w-6xl mx-auto flex items-center justify-between relative h-16">
              {/* SPACER ESQUERDO */}
              <div className="flex items-center gap-3 opacity-0 pointer-events-none select-none">
                <img src={logoImg} alt="" className="w-12 h-12 object-contain" draggable={false} />
                <Wordmark className="h-[34px]" />
              </div>

              {/* SOLIV CENTRALIZADO - Desktop */}
              <div className="absolute left-1/2 top-1/2 transform -translate-x-1/2 -translate-y-1/2">
                <Wordmark className="h-[34px] text-primary" />
              </div>
              
              <div className="flex items-center gap-4">
                <NotificationButton />
              </div>
            </div>
          </header>

          {/* Main Content */}
          <main className="pt-16 md:pt-0 pb-24 md:pb-10">
            <div className="mx-auto w-full max-w-6xl px-4 sm:px-6 lg:px-8 py-4 md:py-6">
              {children}
            </div>
          </main>
        </div>

        {/* Bottom Navigation - Only on Mobile/Tablet */}
        <div className="md:hidden">
          <BottomNavigation onSOSClick={() => setShowSOSModal(true)} />
        </div>

        {/* SOS Modal */}
        <ConfirmationModal
          open={showSOSModal}
          onOpenChange={setShowSOSModal}
          onConfirm={handleSOSConfirm}
        />
      </div>
    </div>
  );
};

export default MainLayout;
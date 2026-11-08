import { 
  Calendar, 
  MessageCircle, 
  Users2, 
  Activity, 
  Headphones, 
  TrendingUp, 
  BookOpen,
  ShieldCheck,
  Sprout,
  ArrowUpRight
} from "lucide-react";
import { useNavigate } from "react-router-dom";
import { MoodAccordion } from "@/components/MoodAccordion";
import { WeeklyGoalModal } from "@/components/goals/WeeklyGoalModal";
import { GoalSelectionModal } from "@/components/goals/GoalSelectionModal";
import { useEffect, useState } from "react";
import { useLegalGateStatus } from "@/lib/legalGateStatus";
import HomeHabitsCard from "@/components/habits/HomeHabitsCard";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/contexts/AuthContext";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from 'sonner';
import React from "react";
import { useTheme } from "next-themes";
import ActiveCallBanner from "@/components/sos/ActiveCallBanner";
import { HomeSkeleton } from "@/components/skeletons/PageSkeletons";



const HomeContent = () => {
  const navigate = useNavigate();
  const isMobile = useIsMobile();
  const { user } = useAuth();
  const userProfile = user;
  const [moodEnabled, setMoodEnabled] = useState(true);
  const [todayMoodValue, setTodayMoodValue] = useState<number | null>(null);
  const [isLoading, setIsLoading] = useState(true);
  const [showWeeklyGoalModal, setShowWeeklyGoalModal] = useState(false);
  const [showGoalSelection, setShowGoalSelection] = useState(false);
  // A janela das metas da semana espera o aceite dos Termos, para não abrir por cima dele.
  const legalGateStatus = useLegalGateStatus();

  useEffect(() => {
    if (!user?.id) return;
    const loadHomeData = async () => {
      setIsLoading(true);
      await checkTodayMood();
      setIsLoading(false);
    };
    
    loadHomeData();

    // Listen for mood toggle changes
    const handleMoodToggleChange = (event: CustomEvent) => {
      setMoodEnabled(event.detail.enabled);
    };

    window.addEventListener('moodToggleChanged', handleMoodToggleChange as EventListener);
    return () => {
      window.removeEventListener('moodToggleChanged', handleMoodToggleChange as EventListener);
    };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, [user?.id]);

  const checkTodayMood = async () => {
    try {
      if (!user) return;

      const today = new Date().toISOString().split('T')[0];
      const { data: patientData } = await supabase
        .from('patients')
        .select('last_mood_date, last_mood_value, daily_mood_enabled, show_weekly_goal_modal, show_goal_modal')
        .eq('user_id', user.id)
        .single();

      // Check if mood tracking is enabled
      setMoodEnabled(patientData?.daily_mood_enabled !== false);

      // Verificar se deve mostrar a janela das metas da semana
      if (patientData?.show_weekly_goal_modal && patientData?.show_goal_modal) {
        setTimeout(() => setShowWeeklyGoalModal(true), 500);
      }

      // Reset mood daily at 00:01 Brazil time
      if (!patientData?.last_mood_date || patientData.last_mood_date !== today) {
        setTodayMoodValue(null);
      } else {
        setTodayMoodValue(patientData.last_mood_value);
      }
    } catch (error) {
      console.error('Error checking today mood:', error);
    }
  };

  const getMoodLabel = (value: number) => {
    const labels: Record<number, string> = { 5: 'Feliz', 4: 'Calmo', 3: 'Neutro', 2: 'Triste', 1: 'Irritado' };
    return labels[value] || '';
  };

  const handleCloseWeeklyGoalModal = async () => {
    setShowWeeklyGoalModal(false);
    // Atualizar a flag no banco para não mostrar mais nesta semana
    if (userProfile?.id) {
      try {
        await supabase
          .from('patients')
          .update({ show_weekly_goal_modal: false })
          .eq('user_id', userProfile.id);
      } catch (error) {
        console.error('Error updating weekly goal modal preference:', error);
      }
    }
  };

  const handleAddGoals = () => {
    setShowWeeklyGoalModal(false);
    setShowGoalSelection(true);
  };

  const handleDontShowAgain = async () => {
    setShowWeeklyGoalModal(false);
    if (userProfile?.id) {
      try {
        await supabase
          .from('patients')
          .update({ show_goal_modal: false, show_weekly_goal_modal: false })
          .eq('user_id', userProfile.id);
        toast.success('Você poderá reativar essa opção nas configurações do perfil.');
      } catch (error) {
        console.error('Error updating goal modal preference:', error);
        toast.error('Erro ao atualizar preferência');
      }
    }
  };

  const handleGoalsAdded = async () => {
    setShowGoalSelection(false);
    // Atualizar show_weekly_goal_modal para false após escolher as metas
    if (userProfile?.id) {
      try {
        await supabase
          .from('patients')
          .update({ show_weekly_goal_modal: false })
          .eq('user_id', userProfile.id);
      } catch (error) {
        console.error('Error updating weekly goal modal:', error);
      }
    }
    toast.success('Metas da semana escolhidas!');
  };

  const handleMoodSelected = (value: number) => {
    setTodayMoodValue(value);
  };

  const firstName = userProfile?.user_metadata?.full_name?.split(' ')[0] || 'Usuário';

  const { resolvedTheme } = useTheme();
  const isDark = resolvedTheme === 'dark';

  const features = [
    {
      icon: Activity,
      title: "Respiração Guiada",
      subtitle: "Exercícios de relaxamento",
      onClick: () => navigate('/breathing'),
      color: isDark ? '#B4B8D8' : '#5D61A6',
      bg: isDark ? 'hsl(232, 20%, 22%)' : '#DDE0F0',
      border: isDark ? 'hsl(232, 20%, 32%)' : '#B4B8D8',
      iconBg: '#6B6FB5',
    },
    {
      icon: Headphones,
      title: "Sons Terapêuticos",
      subtitle: "Áudios calmantes",
      onClick: () => navigate('/sounds'),
      color: isDark ? 'hsl(152, 55%, 75%)' : 'hsl(158,64%,42%)',
      bg: isDark ? 'hsl(158, 25%, 18%)' : 'hsl(152,68%,96%)',
      border: isDark ? 'hsl(158, 25%, 28%)' : 'hsl(152,55%,86%)',
      iconBg: 'hsl(158,64%,42%)',
    },
    {
      icon: Users2,
      title: "Grupos de Apoio",
      subtitle: "Suporte da comunidade",
      onClick: () => navigate('/support-groups'),
      color: isDark ? 'hsl(204, 80%, 78%)' : 'hsl(199,89%,42%)',
      bg: isDark ? 'hsl(204, 30%, 20%)' : 'hsl(204,94%,96%)',
      border: isDark ? 'hsl(204, 30%, 30%)' : 'hsl(204,80%,88%)',
      iconBg: 'hsl(199,89%,42%)',
    },
    {
      icon: BookOpen,
      title: "Meu Diário",
      subtitle: "Registros pessoais",
      onClick: () => navigate('/journal'),
      color: isDark ? 'hsl(45, 85%, 72%)' : 'hsl(41,96%,40%)',
      bg: isDark ? 'hsl(38, 28%, 20%)' : 'hsl(48,100%,96%)',
      border: isDark ? 'hsl(38, 28%, 30%)' : 'hsl(45,93%,85%)',
      iconBg: 'hsl(41,96%,45%)',
    },
    {
      icon: Sprout,
      title: "Melhorar hábitos",
      subtitle: "Água, sono, remédio, menos tela e mais",
      onClick: () => navigate('/habitos'),
      color: isDark ? 'hsl(174, 55%, 70%)' : 'hsl(174,72%,30%)',
      bg: isDark ? 'hsl(174, 25%, 18%)' : 'hsl(170,60%,95%)',
      border: isDark ? 'hsl(174, 25%, 28%)' : 'hsl(170,45%,82%)',
      iconBg: 'hsl(174,72%,33%)',
    },
    {
      icon: ShieldCheck,
      title: "Plano de Segurança",
      subtitle: "O que ajuda nas crises e quem chamar",
      onClick: () => navigate('/safety-plan'),
      color: isDark ? 'hsl(340, 75%, 80%)' : 'hsl(340,70%,45%)',
      bg: isDark ? 'hsl(340, 25%, 20%)' : 'hsl(340,90%,97%)',
      border: isDark ? 'hsl(340, 25%, 30%)' : 'hsl(340,75%,88%)',
      iconBg: 'hsl(340,70%,50%)',
    }
  ] as { icon: typeof Activity; title: string; subtitle: string; onClick: () => void; color: string; bg: string; border: string; iconBg: string; wide?: boolean }[];


  if (isLoading) {
    return <HomeSkeleton />;
  }

  return (
    <>
      <div>
        <ActiveCallBanner />

        {/* Mobile/Tablet Mood Section */}
        {moodEnabled && (
          <section className="lg:hidden mt-4 mb-6">
            <MoodAccordion
              currentValue={todayMoodValue}
              onMoodSelected={handleMoodSelected}
            />
          </section>
        )}

        {/* Desktop Mood Section */}
        {moodEnabled && (
          <div className="hidden lg:block mt-4 mb-8">
            <MoodAccordion
              currentValue={todayMoodValue}
              onMoodSelected={handleMoodSelected}
            />
          </div>
        )}

        {/* Meus hábitos: o dia de hoje num relance (só para quem já tem hábitos) */}
        <HomeHabitsCard />

        {/* Resources Section */}
        <section className="mb-8">
          <h2 className="text-lg font-semibold text-foreground mb-4">Seus recursos</h2>

          {/* Desktop & Tablet: horizontal cards in 2 columns */}
          <div className="hidden md:grid grid-cols-2 gap-4">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <button
                  key={index}
                  onClick={feature.onClick}
                  className={`group relative overflow-hidden flex items-center gap-4 rounded-2xl border p-4 lg:p-5 text-left shadow-sm transition-all duration-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${feature.wide ? 'col-span-2' : ''}`}
                  style={{ backgroundColor: feature.bg, borderColor: feature.border }}
                >
                  <div
                    className="relative flex h-11 w-11 lg:h-12 lg:w-12 flex-shrink-0 items-center justify-center rounded-xl text-white shadow-sm"
                    style={{ backgroundColor: feature.iconBg, boxShadow: isDark ? 'none' : `0 6px 16px -6px ${feature.color}` }}
                  >
                    <Icon className="h-5 w-5 lg:h-6 lg:w-6" strokeWidth={2.25} />
                  </div>
                  <div className="relative min-w-0 flex-1">
                    <h3 className="text-sm lg:text-base font-semibold leading-tight" style={{ color: feature.color }}>{feature.title}</h3>
                    <p className="mt-0.5 lg:mt-1 text-xs lg:text-sm leading-snug text-foreground/70">{feature.subtitle}</p>
                  </div>
                  <ArrowUpRight
                    className="relative h-4 w-4 flex-shrink-0 opacity-60 group-hover:opacity-100 transition-opacity"
                    style={{ color: feature.color }}
                  />
                </button>
              );
            })}
          </div>

          {/* Mobile: square cards */}
          <div className="grid grid-cols-2 gap-3 md:hidden">
            {features.map((feature, index) => {
              const Icon = feature.icon;
              return (
                <button
                  key={index}
                  onClick={feature.onClick}
                  className={`group relative overflow-hidden flex rounded-2xl border p-4 shadow-sm transition-all duration-200 active:scale-[0.98] focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-primary/40 ${
                    feature.wide
                      ? 'col-span-2 flex-row items-center gap-4 text-left'
                      : 'aspect-square flex-col items-center justify-center gap-3 text-center'
                  }`}
                  style={{ backgroundColor: feature.bg, borderColor: feature.border }}
                >
                  <div
                    className={`relative flex flex-shrink-0 items-center justify-center rounded-2xl text-white shadow-sm transition-transform duration-200 group-active:scale-95 ${feature.wide ? 'h-12 w-12' : 'h-16 w-16'}`}
                    style={{ backgroundColor: feature.iconBg, boxShadow: isDark ? 'none' : `0 8px 20px -8px ${feature.color}` }}
                  >
                    <Icon className={feature.wide ? 'h-6 w-6' : 'h-8 w-8'} strokeWidth={2.25} />
                  </div>
                  <div className={feature.wide ? 'relative min-w-0 flex-1' : 'relative w-full'}>
                    <h3 className="text-sm font-semibold leading-tight" style={{ color: feature.color }}>{feature.title}</h3>
                    <p className="mt-1 text-xs leading-snug text-foreground/70 line-clamp-2">{feature.subtitle}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </section>

        {/* Modals */}

        <WeeklyGoalModal
          open={showWeeklyGoalModal && legalGateStatus === "clear"}
          onOpenChange={handleCloseWeeklyGoalModal}
          onAddGoals={handleAddGoals}
          onDontShowAgain={handleDontShowAgain}
        />

        <GoalSelectionModal
          open={showGoalSelection}
          onOpenChange={setShowGoalSelection}
          onGoalsAdded={handleGoalsAdded}
        />
      </div>
    </>
  );
};

export default HomeContent;
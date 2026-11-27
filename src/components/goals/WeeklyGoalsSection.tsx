import { useEffect, useState } from 'react';
import { ListChecks } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { ProgressSection } from '@/components/progress/ProgressSection';
import { Progress } from '@/components/ui/progress';
import { useWeeklyGoals } from '@/hooks/useWeeklyGoals';
import { GoalSelectionModal } from '@/components/goals/GoalSelectionModal';
import { GoalCard } from '@/components/goals/GoalCard';
import { SkeletonSectionCard } from '@/components/skeletons/Skeletons';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { currentStep, stepDoneToday } from '@/lib/challenges';
import { usePatientStatistics } from '@/hooks/usePatientStatistics';

/**
 * Metas da semana: as atividades de autocuidado do app (respiração, sons,
 * diário, humor...) escolhidas para a semana. Antes se chamavam "metas
 * semanais"; o banco continua com os nomes antigos (weekly_goals).
 */
const WeeklyGoalsSection = () => {
  const { user } = useAuth();
  const { goals, loading, fetchGoals, updateGoalProgress } = useWeeklyGoals();
  const { addActivity } = usePatientStatistics({ load: false });
  const [modalOpen, setModalOpen] = useState(false);

  // Escolha feita em outra aba/dispositivo (ou o reset automático das
  // segundas): recarrega as metas desta semana.
  useEffect(() => {
    if (!user?.id) return;
    const channel = supabase
      .channel('patients-weekly-goals-changes')
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'patients', filter: `user_id=eq.${user.id}` },
        () => fetchGoals(),
      )
      .subscribe();
    return () => {
      supabase.removeChannel(channel);
    };
  }, [user?.id, fetchGoals]);

  const completed = goals.filter((g) => g.completed).length;
  const total = goals.length;
  const percent = total > 0 ? Math.round((completed / total) * 100) : 0;

  if (loading) return <SkeletonSectionCard rows={3} accent="primary" showAvatar={false} />;

  return (
    <>
      <ProgressSection
        icon={ListChecks}
        title="Metas da semana"
        subtitle={total > 0 ? `${completed} de ${total} concluídas` : 'Escolha suas metas de autocuidado'}
      >
          {total === 0 ? (
            <div className="text-center py-6 space-y-3">
              <div className="mx-auto w-12 h-12 rounded-full bg-primary/10 flex items-center justify-center">
                <ListChecks className="w-6 h-6 text-primary" />
              </div>
              <div>
                <h4 className="text-base font-semibold text-foreground">Nenhuma meta escolhida para a semana</h4>
                <p className="text-sm text-muted-foreground mt-1">
                  Respiração, sons, diário, humor ou um desafio de 7 dias: escolha o que quer praticar nesta semana.
                </p>
              </div>
              <Button onClick={() => setModalOpen(true)} className="gap-2">
                <ListChecks size={16} />
                Escolher metas da semana
              </Button>
            </div>
          ) : (
            <div className="space-y-5">
              <div>
                <div className="flex items-center justify-between mb-1.5">
                  <span className="text-sm font-medium text-foreground">Progresso da semana</span>
                  <span className="text-sm font-semibold text-primary">{percent}%</span>
                </div>
                <Progress value={percent} className="h-2" />
              </div>

              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                {goals.map((goal) => (
                  <GoalCard
                    key={goal.id}
                    goal={goal}
                    onStepDone={(g) => {
                      // Um passo por dia: o card só mostra o botão se o de hoje não foi feito.
                      if (stepDoneToday(g.progress, g.updated_at, new Date(), g.last_progress_date)) return;
                      const step = currentStep(g.weekly_goals.category, g.progress);
                      void updateGoalProgress(g.id);
                      // Entra no histórico: "Desafio de 7 dias: Uma hora sem tela".
                      if (step) void addActivity(`Desafio de 7 dias: ${step.step.title}`);
                    }}
                  />
                ))}
              </div>

              <Button onClick={() => setModalOpen(true)} variant="outline" size="sm" className="w-full gap-2">
                <ListChecks size={14} />
                Editar metas da semana
              </Button>
            </div>
          )}
      </ProgressSection>

      <GoalSelectionModal
        open={modalOpen}
        onOpenChange={setModalOpen}
        onGoalsAdded={async () => {
          setModalOpen(false);
          await fetchGoals();
        }}
      />
    </>
  );
};

export default WeeklyGoalsSection;

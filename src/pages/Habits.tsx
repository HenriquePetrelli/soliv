import { useNavigate } from 'react-router-dom';
import { Plus, Sparkles } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import PageHeader from '@/components/PageHeader';
import PatientBottomNav from '@/components/PatientBottomNav';
import DailyHabitCard, { OFFLINE_ITEM, offlineEventToday } from '@/components/habits/DailyHabitCard';
import QuitHabitCard from '@/components/habits/QuitHabitCard';
import { useHabitLogger } from '@/components/habits/useHabitLogger';
import InsightsCard from '@/components/progress/InsightsCard';
import { useHabits } from '@/hooks/useHabits';
import { useNow } from '@/hooks/useNow';
import { MAX_ACTIVE_HABITS, isQuitHabit } from '@/lib/habits';
import { usePlanLimits } from '@/hooks/usePlanLimits';

/** Meus hábitos: os do dia e os que estou largando. As metas da semana ficam em Meu Progresso. */
const Habits = () => {
  const navigate = useNavigate();
  const { habits, eventsByHabit, loading, error, logIntake, deleteEvent } = useHabits();
  const log = useHabitLogger(logIntake, deleteEvent);
  const toggleOffline = (habitId: string) => {
    const existing = offlineEventToday(eventsByHabit.get(habitId) ?? []);
    const action = existing ? deleteEvent(existing.id) : logIntake(habitId, 0, { item: OFFLINE_ITEM }, 'check');
    action.catch(() => toast.error('Não foi possível registrar agora.'));
  };
  const now = useNow(60_000);

  const daily = habits.filter((h) => !isQuitHabit(h.kind));
  const quitting = habits.filter((h) => isQuitHabit(h.kind));
  const { maxHabits, isFree } = usePlanLimits();
  const limitReached = habits.length >= maxHabits;

  return (
    <div className="has-tabs">
      <div className="screen">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
          <PageHeader title="Meus hábitos" backTo="/home" />
        </div>

        <main className="w-full p-4 space-y-6 max-w-2xl mx-auto">
          <p className="text-sm text-muted-foreground">
            Pequenos passos todos os dias. Só você vê os seus hábitos.
          </p>

          {loading ? (
            <div className="space-y-3">
              <Skeleton className="h-32 w-full rounded-2xl" />
              <Skeleton className="h-32 w-full rounded-2xl" />
            </div>
          ) : error ? (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm">
              Não foi possível carregar os seus hábitos. Verifique a conexão e tente de novo.
            </p>
          ) : habits.length === 0 ? (
            <section className="rounded-2xl border border-dashed border-primary/40 bg-primary/5 p-6 text-center space-y-3">
              <Sparkles className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
              <h2 className="text-lg font-semibold text-foreground">Comece por um hábito</h2>
              <p className="text-sm text-muted-foreground">
                Beber água, dormir melhor, tomar o remédio na hora, menos café ou menos tela, parar de fumar ou de beber.
                Acompanhe o seu dia e receba lembretes.
              </p>
              <Button onClick={() => navigate('/habitos/novo')} className="min-h-11">
                <Plus className="mr-2 h-4 w-4" />
                Adicionar hábito
              </Button>
            </section>
          ) : (
            <>
              {daily.length > 0 && (
                <section className="space-y-3" aria-labelledby="habits-today">
                  <h2 id="habits-today" className="text-base font-semibold text-foreground">Hoje</h2>
                  {daily.map((habit) => (
                    <DailyHabitCard
                      key={habit.id}
                      habit={habit}
                      events={eventsByHabit.get(habit.id) ?? []}
                      onLog={(item) => log(habit, eventsByHabit.get(habit.id) ?? [], item)}
                      onOpen={() => navigate(`/habitos/${habit.id}`)}
                      onToggleOffline={() => toggleOffline(habit.id)}
                    />
                  ))}
                </section>
              )}

              {quitting.length > 0 && (
                <section className="space-y-3" aria-labelledby="habits-quitting">
                  <h2 id="habits-quitting" className="text-base font-semibold text-foreground">Largando</h2>
                  {quitting.map((habit) => (
                    <QuitHabitCard key={habit.id} habit={habit} now={now} onOpen={() => navigate(`/habitos/${habit.id}`)} />
                  ))}
                </section>
              )}

              <InsightsCard max={2} />

              <div className="space-y-1">
                <Button variant="outline" className="w-full min-h-11" onClick={() => navigate('/habitos/novo')} disabled={limitReached}>
                  <Plus className="mr-2 h-4 w-4" />
                  Adicionar hábito
                </Button>
                {limitReached && (
                  <p className="text-center text-xs text-muted-foreground">
                    {isFree ? (
                      <>
                        No Plano Grátis cabem {maxHabits} hábitos. Tire um da lista ou{' '}
                        <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => navigate('/subscription-plans')}>
                          escolha um plano
                        </button>{' '}
                        para ter até {MAX_ACTIVE_HABITS}.
                      </>
                    ) : (
                      <>Você chegou a {MAX_ACTIVE_HABITS} hábitos. Tire um da lista para adicionar outro.</>
                    )}
                  </p>
                )}
              </div>
            </>
          )}

        </main>
      </div>
      <PatientBottomNav />
    </div>
  );
};

export default Habits;

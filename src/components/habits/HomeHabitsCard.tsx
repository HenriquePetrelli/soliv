import { useNavigate } from 'react-router-dom';
import { ChevronRight, Plus } from 'lucide-react';
import ExpandableCard from '@/components/ExpandableCard';
import { Button } from '@/components/ui/button';
import ProgressRing from '@/components/habits/ProgressRing';
import { HABIT_VISUALS } from '@/components/habits/habitVisuals';
import { dailySummary } from '@/components/habits/dailyHabit';
import { useHabitLogger } from '@/components/habits/useHabitLogger';
import { useHabits } from '@/hooks/useHabits';
import { useNow } from '@/hooks/useNow';
import {
  HABIT_CATALOG,
  formatBRL,
  formatHabitAmount,
  habitTitle,
  isLimitHabit,
  isQuitHabit,
  localDateString,
  onceEventFor,
  quickItemsFor,
  quitLabel,
  quitStats,
  totalsByDate,
} from '@/lib/habits';

const MAX_ON_HOME = 4;

/** Card "Meus hábitos" da Home: o dia de hoje num relance, com registro rápido. */
const HomeHabitsCard = () => {
  const navigate = useNavigate();
  const { habits, eventsByHabit, loading, error, logIntake, deleteEvent } = useHabits();
  const log = useHabitLogger(logIntake, deleteEvent);
  const now = useNow(60_000);

  // Sem hábitos, nada aqui: o card "Melhorar hábitos" em Seus recursos leva à tela.
  if (loading || error || habits.length === 0) return null;

  const today = localDateString();
  const shown = habits.slice(0, MAX_ON_HOME);

  // Fechado, o subtítulo já resume o dia (como o "Humor de hoje").
  const summary = shown
          .slice(0, 2)
          .map((habit) => {
            if (isQuitHabit(habit.kind)) {
              const days = quitStats(habit, now).days;
              return `${days} ${days === 1 ? 'dia' : 'dias'} ${quitLabel(habit)}`;
            }
            const goal = habit.daily_goal ?? HABIT_CATALOG[habit.kind].defaultGoal!;
            const total = totalsByDate(eventsByHabit.get(habit.id) ?? []).get(today) ?? 0;
            const name = habit.kind === 'medication' ? habitTitle(habit) : HABIT_CATALOG[habit.kind].shortName;
            return `${name}: ${HABIT_CATALOG[habit.kind].unit === 'count' ? total : formatHabitAmount(habit.kind, total)} de ${formatHabitAmount(habit.kind, goal)}`;
          })
          .join(' · ');

  return (
    <ExpandableCard className="mb-6" title="Meus hábitos" subtitle={summary}>
      <ul className="space-y-2">
          {shown.map((habit) => {
            const { icon: Icon, color, soft } = HABIT_VISUALS[habit.kind];
            const events = eventsByHabit.get(habit.id) ?? [];

            if (isQuitHabit(habit.kind)) {
              const stats = quitStats(habit, now);
              return (
                <li key={habit.id}>
                  <button
                    type="button"
                    onClick={() => navigate(`/habitos/${habit.id}`)}
                    className="flex w-full items-center gap-3 rounded-xl p-2 text-left hover:bg-muted/50"
                  >
                    <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg" style={{ backgroundColor: soft }}>
                      <Icon className="h-5 w-5" style={{ color }} aria-hidden="true" />
                    </span>
                    <span className="min-w-0 flex-1">
                      <span className="block font-semibold text-foreground">
                        {stats.days} {stats.days === 1 ? 'dia' : 'dias'} {quitLabel(habit)}
                      </span>
                      {stats.moneySaved > 0 && (
                        <span className="block text-xs text-muted-foreground">{formatBRL(stats.moneySaved)} economizados</span>
                      )}
                    </span>
                  </button>
                </li>
              );
            }

            const goal = habit.daily_goal ?? HABIT_CATALOG[habit.kind].defaultGoal!;
            const total = totalsByDate(events).get(today) ?? 0;
            // O botão rápido da Home: o próximo ainda não feito (refeição, dose) ou o primeiro.
            const items = quickItemsFor(habit);
            const quick = items.find((item) => !onceEventFor(events, item, today));
            const over = isLimitHabit(habit.kind) && total > goal;
            return (
              <li key={habit.id} className="flex items-center gap-3 rounded-xl p-2">
                <button type="button" onClick={() => navigate(`/habitos/${habit.id}`)} className="flex min-w-0 flex-1 items-center gap-3 text-left">
                  <ProgressRing value={total / goal} color={over ? 'hsl(0 72% 46%)' : color} size={40} stroke={4} label={`${habitTitle(habit)}: ${Math.round((total / goal) * 100)}%`}>
                    <Icon className="h-4 w-4" style={{ color }} aria-hidden="true" />
                  </ProgressRing>
                  <span className="min-w-0">
                    <span className="block truncate font-semibold text-foreground">{habitTitle(habit)}</span>
                    <span className={`block truncate text-xs ${over ? 'text-destructive' : 'text-muted-foreground'}`}>{dailySummary(habit, total)}</span>
                  </span>
                </button>
                {quick && (
                  <Button
                    size="sm"
                    variant="secondary"
                    className="max-w-[45%] shrink-0 gap-1 rounded-full"
                    onClick={() => log(habit, events, quick)}
                    aria-label={`Registrar ${quick.label} em ${habitTitle(habit)}`}
                  >
                    <Plus className="h-3.5 w-3.5 shrink-0" aria-hidden="true" />
                    <span className="truncate">{quick.label}</span>
                  </Button>
                )}
              </li>
            );
          })}
        </ul>
      <Button variant="ghost" size="sm" className="mt-2 w-full gap-1 text-primary" onClick={() => navigate('/habitos')}>
        Ver todos os hábitos
        <ChevronRight className="h-4 w-4" aria-hidden="true" />
      </Button>
    </ExpandableCard>
  );
};

export default HomeHabitsCard;

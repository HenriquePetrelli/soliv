import {
  HABIT_CATALOG,
  formatHabitAmount,
  isLimitHabit,
  localDateString,
  type HabitEvent,
  type UserHabit,
} from '@/lib/habits';

export const OFFLINE_ITEM = 'offline_before_bed';

/** Hoje, a pessoa marcou que ficou sem tela antes de dormir? */
export const offlineEventToday = (events: HabitEvent[], today = localDateString()) =>
  events.find((e) => e.kind === 'check' && e.local_date === today && e.details?.item === OFFLINE_ITEM);

/** Linha de resumo do dia ("1,2 L de 2 L", "160 mg de 400 mg"). */
export const dailySummary = (habit: UserHabit, total: number) => {
  const goal = habit.daily_goal ?? HABIT_CATALOG[habit.kind].defaultGoal!;
  if (isLimitHabit(habit.kind)) {
    return total > goal
      ? `${formatHabitAmount(habit.kind, total)} · ${formatHabitAmount(habit.kind, total - goal)} acima do limite`
      : `${formatHabitAmount(habit.kind, total)} de ${formatHabitAmount(habit.kind, goal)} (limite)`;
  }
  // "1 de 3 refeições" (e não "1 refeição de 3 refeições").
  if (HABIT_CATALOG[habit.kind].unit === 'count') return `${total} de ${formatHabitAmount(habit.kind, goal)}`;
  return `${formatHabitAmount(habit.kind, total)} de ${formatHabitAmount(habit.kind, goal)}`;
};

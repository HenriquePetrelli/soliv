import { Check, Flame, MoonStar, Plus } from 'lucide-react';
import { Button } from '@/components/ui/button';
import ProgressRing from '@/components/habits/ProgressRing';
import { HABIT_VISUALS, OVER_LIMIT_COLOR } from '@/components/habits/habitVisuals';
import { cn } from '@/lib/utils';
import {
  HABIT_CATALOG,
  formatHabitAmount,
  habitStreak,
  habitTitle,
  isLimitHabit,
  localDateString,
  onceEventFor,
  quickItemsFor,
  totalsByDate,
  type HabitEvent,
  type QuickItem,
  type UserHabit,
} from '@/lib/habits';
import { OFFLINE_ITEM, dailySummary, offlineEventToday } from '@/components/habits/dailyHabit';

interface DailyHabitCardProps {
  habit: UserHabit;
  events: HabitEvent[];
  onLog: (item: QuickItem) => void;
  onOpen: () => void;
  /** Tela: marcar "sem tela 1 hora antes de dormir". */
  onToggleOffline?: () => void;
  compact?: boolean;
}


const DailyHabitCard = ({ habit, events, onLog, onOpen, onToggleOffline, compact = false }: DailyHabitCardProps) => {
  const { icon: Icon, color, soft } = HABIT_VISUALS[habit.kind];
  const goal = habit.daily_goal ?? HABIT_CATALOG[habit.kind].defaultGoal!;
  const today = localDateString();
  const totals = totalsByDate(events);
  const total = totals.get(today) ?? 0;
  const streak = habitStreak(habit, totals, goal, today);
  const limit = isLimitHabit(habit.kind);
  const over = limit && total > goal;
  const done = !limit && total >= goal;
  const ringColor = over ? OVER_LIMIT_COLOR : color;
  const items = quickItemsFor(habit);
  const offline = habit.kind === 'screen_time' ? offlineEventToday(events, today) : undefined;

  return (
    <div className="rounded-2xl border border-border bg-card p-4 shadow-sm">
      <button type="button" onClick={onOpen} className="flex w-full items-center gap-4 text-left">
        <ProgressRing
          value={total / goal}
          color={ringColor}
          size={compact ? 56 : 68}
          label={`${habitTitle(habit)}: ${Math.round((total / goal) * 100)}% ${limit ? 'do limite' : 'da meta'}`}
        >
          <Icon className={compact ? 'h-5 w-5' : 'h-6 w-6'} style={{ color: ringColor }} aria-hidden="true" />
        </ProgressRing>
        <div className="min-w-0 flex-1">
          <p className="font-semibold text-foreground">{habitTitle(habit)}</p>
          <p className={cn('text-sm', over ? 'font-medium text-destructive' : 'text-muted-foreground')}>
            {dailySummary(habit, total)}
            {done && <span className="ml-1 font-medium" style={{ color }}>· meta batida!</span>}
          </p>
          {streak > 0 && (
            <p className="mt-0.5 inline-flex items-center gap-1 text-xs text-muted-foreground">
              <Flame className="h-3.5 w-3.5 text-orange-500" aria-hidden="true" />
              {streak} {streak === 1 ? 'dia seguido' : 'dias seguidos'}
              {limit ? ' no limite' : ''}
            </p>
          )}
        </div>
      </button>

      {items.length > 0 && (
        <div className="mt-3 flex flex-wrap gap-2">
          {items.map((item) => {
            const doneItem = Boolean(onceEventFor(events, item, today));
            return (
              <Button
                key={item.key}
                type="button"
                variant="outline"
                size="sm"
                className={cn('h-auto min-h-9 min-w-[28%] flex-1 basis-auto gap-1 whitespace-normal rounded-full py-1.5 leading-tight', doneItem && 'font-semibold')}
                style={{ backgroundColor: doneItem ? color : soft, borderColor: 'transparent', color: doneItem ? 'white' : undefined }}
                onClick={() => onLog(item)}
                aria-pressed={item.once ? doneItem : undefined}
                aria-label={item.once ? item.label : `Registrar ${item.label}`}
              >
                {doneItem ? <Check className="h-3.5 w-3.5" aria-hidden="true" /> : <Plus className="h-3.5 w-3.5" aria-hidden="true" />}
                <span>{item.label}</span>
              </Button>
            );
          })}
        </div>
      )}

      {habit.kind === 'screen_time' && onToggleOffline && (
        <Button
          type="button"
          variant="ghost"
          size="sm"
          className="mt-2 w-full gap-2"
          aria-pressed={Boolean(offline)}
          onClick={onToggleOffline}
        >
          {offline ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <MoonStar className="h-4 w-4" aria-hidden="true" />}
          {offline ? 'Sem tela 1 h antes de dormir ✓' : 'Fiquei sem tela 1 h antes de dormir'}
        </Button>
      )}
    </div>
  );
};

export default DailyHabitCard;

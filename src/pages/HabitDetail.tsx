import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { BellRing, CalendarCheck, Check, ChevronRight, Flame, HeartPulse, Leaf, MoonStar, Pencil, PiggyBank, Pill, Plus, Trash2, Trophy, Wind } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Progress } from '@/components/ui/progress';
import { HabitDetailSkeleton } from '@/components/skeletons/PageSkeletons';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import PageHeader from '@/components/PageHeader';
import PatientBottomNav from '@/components/PatientBottomNav';
import ProgressRing from '@/components/habits/ProgressRing';
import CravingDialog from '@/components/habits/CravingDialog';
import RelapseDialog from '@/components/habits/RelapseDialog';
import { HABIT_VISUALS, OVER_LIMIT_COLOR } from '@/components/habits/habitVisuals';
import { OFFLINE_ITEM, offlineEventToday } from '@/components/habits/dailyHabit';
import { customItem, useHabitLogger } from '@/components/habits/useHabitLogger';
import { cn } from '@/lib/utils';
import { useHabits } from '@/hooks/useHabits';
import { useNow } from '@/hooks/useNow';
import {
  CAFFEINE_DRINKS,
  HABIT_CATALOG,
  JOY_FEELINGS,
  KCAL_PER_DRINK,
  MEALS,
  MEAL_FEELINGS,
  MINUTES_OF_LIFE_PER_CIGARETTE,
  addDays,
  bestGoalStreak,
  cravingTriggerRanking,
  dayOk,
  formatBRL,
  formatDurationShort,
  formatNumber,
  formatHabitAmount,
  habitStreak,
  habitTitle,
  healthMilestoneProgress,
  isLimitHabit,
  isQuitHabit,
  lastDays,
  localDateString,
  milestoneLabel,
  nextMilestone,
  onceEventFor,
  quickItemsFor,
  quitLabel,
  quitStats,
  reachedMilestones,
  splitDuration,
  totalsByDate,
  type HabitEvent,
  type QuickItem,
  type UserHabit,
} from '@/lib/habits';

const WEEKDAY = ['dom', 'seg', 'ter', 'qua', 'qui', 'sex', 'sáb'];

const Stat = ({ icon: Icon, label, value, hint }: { icon: typeof Flame; label: string; value: string; hint?: string }) => (
  <div className="min-w-0 rounded-xl border border-border bg-card p-3">
    <p className="flex items-center gap-1.5 text-xs text-muted-foreground">
      <Icon className="h-3.5 w-3.5" aria-hidden="true" />
      {label}
    </p>
    <p className="mt-1 break-words text-lg font-bold tabular-nums text-foreground">{value}</p>
    {hint && <p className="text-xs leading-tight text-muted-foreground">{hint}</p>}
  </div>
);

const reminderSummary = (habit: UserHabit) => {
  if (!habit.reminders_enabled) return 'Lembretes desligados';
  if (habit.kind === 'medication') return `Lembretes às ${(habit.settings.times ?? []).join(', ')}`;
  if (habit.kind === 'meals' && habit.settings.meal_times) {
    const list = MEALS.filter((m) => habit.settings.meal_times?.[m.key]).map((m) => `${m.label.toLowerCase()} ${habit.settings.meal_times?.[m.key]}`);
    return list.length > 0 ? `Lembretes: ${list.join(', ')}` : 'Nenhuma refeição com lembrete';
  }
  if (habit.reminder_interval_minutes) {
    const h = habit.reminder_interval_minutes / 60;
    return `Lembretes a cada ${formatNumber(h, 1)} h, das ${habit.reminder_start} às ${habit.reminder_end}`;
  }
  return `Lembrete diário às ${habit.reminder_start}`;
};

// ------------------------------------------------------------ do dia

/** Nome de um registro do dia ("Almoço", "Café (xícara)", "Dose das 08:00"). */
const entryLabel = (habit: UserHabit, entry: HabitEvent) => {
  const d = entry.details ?? {};
  if (habit.kind === 'meals') return MEALS.find((m) => m.key === d.meal)?.label ?? 'Refeição';
  if (habit.kind === 'caffeine') {
    const drink = CAFFEINE_DRINKS.find((c) => c.key === d.drink)?.label;
    return drink ? `${drink} · ${formatHabitAmount('caffeine', entry.amount ?? 0)}` : formatHabitAmount('caffeine', entry.amount ?? 0);
  }
  if (habit.kind === 'medication') return `Dose das ${String(d.slot ?? '')}`;
  if (habit.kind === 'joy') return String(d.activity ?? 'Atividade');
  return formatHabitAmount(habit.kind, entry.amount ?? 0);
};

const entryNote = (habit: UserHabit, entry: HabitEvent) => {
  const d = entry.details ?? {};
  if (habit.kind === 'meals' && d.feeling) return `antes: ${String(d.feeling).toLowerCase()}`;
  if (habit.kind === 'joy' && d.feeling) {
    const label = JOY_FEELINGS.find((f) => f.key === d.feeling)?.label;
    return label ? `depois: ${label.toLowerCase()}` : null;
  }
  return null;
};

const DailyDetail = ({
  habit,
  events,
  onLog,
  onDeleteEvent,
  onUpdateDetails,
  onToggleOffline,
}: {
  habit: UserHabit;
  events: HabitEvent[];
  onLog: (item: QuickItem) => Promise<string | null>;
  onDeleteEvent: (id: string) => void;
  onUpdateDetails: (id: string, details: Record<string, unknown>) => void;
  onToggleOffline: () => void;
}) => {
  const navigate = useNavigate();
  const [custom, setCustom] = useState('');
  // Depois de registrar refeição ou atividade, pergunta como a pessoa estava (opcional).
  const [askFor, setAskFor] = useState<string | null>(null);
  const { icon: Icon, color, soft } = HABIT_VISUALS[habit.kind];
  const catalog = HABIT_CATALOG[habit.kind];
  const limit = isLimitHabit(habit.kind);
  const goal = habit.daily_goal ?? catalog.defaultGoal!;
  const today = localDateString();
  const totals = totalsByDate(events);
  const total = totals.get(today) ?? 0;
  const over = limit && total > goal;
  const ringColor = over ? OVER_LIMIT_COLOR : color;
  const week = lastDays(totals, goal, today, 7);
  const weekAverage = week.reduce((sum, d) => sum + d.total, 0) / 7;
  const weekOk = week.filter((d) => dayOk(habit.kind, d.total, goal) && (habit.kind !== 'screen_time' || totals.has(d.date))).length;
  const todayEntries = events.filter((e) => e.kind === 'intake' && e.local_date === today).reverse();
  const items = quickItemsFor(habit, true);
  const allowsCustom = catalog.unit !== 'count';
  const chartMax = Math.max(goal, ...week.map((d) => d.total)) || 1;
  const offline = habit.kind === 'screen_time' ? offlineEventToday(events, today) : undefined;
  const askedEntry = askFor ? events.find((e) => e.id === askFor) : undefined;

  const headline = (() => {
    if (limit) {
      return over
        ? `Você passou ${formatHabitAmount(habit.kind, total - goal)} do limite de hoje`
        : `Ainda cabem ${formatHabitAmount(habit.kind, goal - total)} no limite de hoje`;
    }
    const remaining = Math.max(0, goal - total);
    if (remaining === 0) return 'Meta de hoje batida!';
    return `${remaining === 1 ? 'Falta' : 'Faltam'} ${formatHabitAmount(habit.kind, remaining)} para a meta de hoje`;
  })();

  const log = async (item: QuickItem) => {
    const id = await onLog(item);
    if (id && (habit.kind === 'meals' || habit.kind === 'joy')) setAskFor(id);
  };

  const submitCustom = (event: React.FormEvent) => {
    event.preventDefault();
    const value = Number(custom.replace(',', '.'));
    if (!(value > 0 && value <= 20000)) return;
    void log(customItem(habit, value));
    setCustom('');
  };

  return (
    <>
      <section className="flex flex-col items-center gap-3 rounded-2xl p-4 text-center sm:p-6" style={{ backgroundColor: soft }}>
        <ProgressRing value={total / goal} color={ringColor} size={148} stroke={12} label={`${Math.round((total / goal) * 100)}% ${limit ? 'do limite' : 'da meta'} de hoje`}>
          <div className="flex flex-col items-center">
            <Icon className="h-6 w-6" style={{ color: ringColor }} aria-hidden="true" />
            <span className="mt-1 text-xl font-bold tabular-nums text-foreground">{formatHabitAmount(habit.kind, total)}</span>
            <span className="text-xs text-muted-foreground">
              {limit ? 'limite' : 'de'} {formatHabitAmount(habit.kind, goal)}
            </span>
          </div>
        </ProgressRing>
        <p className={cn('text-sm font-medium', over ? 'text-destructive' : 'text-foreground')} aria-live="polite">
          {headline}
        </p>

        <div className="grid w-full grid-cols-2 gap-2 sm:grid-cols-3">
          {items.map((item) => {
            const doneItem = Boolean(onceEventFor(events, item, today));
            return (
              <Button
                key={item.key}
                className="h-auto min-h-11 min-w-0 gap-1 whitespace-normal rounded-full px-3 py-2 leading-tight"
                variant={doneItem ? 'default' : 'secondary'}
                style={doneItem ? { backgroundColor: color } : undefined}
                aria-pressed={item.once ? doneItem : undefined}
                onClick={() => void log(item)}
              >
                {doneItem ? <Check className="h-4 w-4 shrink-0" aria-hidden="true" /> : <Plus className="h-4 w-4 shrink-0" aria-hidden="true" />}
                <span>{item.label}</span>
              </Button>
            );
          })}
        </div>

        {allowsCustom && (
          <form onSubmit={submitCustom} className="flex w-full gap-2">
            <Input
              aria-label={`Outra quantidade em ${catalog.unit}`}
              type="number"
              inputMode="decimal"
              min="0"
              step="any"
              placeholder={`Outra quantidade (${catalog.unit})`}
              value={custom}
              onChange={(e) => setCustom(e.target.value)}
              className="h-11 min-w-0 bg-card"
            />
            <Button type="submit" variant="outline" className="h-11 shrink-0" disabled={!custom}>
              Registrar
            </Button>
          </form>
        )}

        {habit.kind === 'screen_time' && (
          <Button variant="outline" className="w-full min-h-11 gap-2 bg-card" aria-pressed={Boolean(offline)} onClick={onToggleOffline}>
            {offline ? <Check className="h-4 w-4 text-success" aria-hidden="true" /> : <MoonStar className="h-4 w-4" aria-hidden="true" />}
            {offline ? 'Sem tela 1 h antes de dormir ✓' : 'Fiquei sem tela 1 h antes de dormir'}
          </Button>
        )}
      </section>

      {askedEntry && (
        <section className="space-y-2 rounded-2xl border border-border bg-card p-4" aria-labelledby="ask-feeling">
          <h2 id="ask-feeling" className="text-sm font-semibold text-foreground">
            {habit.kind === 'meals' ? 'Antes de comer, você estava… (opcional)' : 'Como você se sente agora? (opcional)'}
          </h2>
          <div className="flex flex-wrap gap-2">
            {(habit.kind === 'meals' ? MEAL_FEELINGS.map((f) => ({ key: f, label: f })) : JOY_FEELINGS).map((f) => (
              <Button
                key={f.key}
                size="sm"
                variant="outline"
                className="rounded-full"
                onClick={() => {
                  onUpdateDetails(askedEntry.id, { ...askedEntry.details, feeling: f.key });
                  setAskFor(null);
                }}
              >
                {f.label}
              </Button>
            ))}
            <Button size="sm" variant="ghost" onClick={() => setAskFor(null)}>
              Pular
            </Button>
          </div>
        </section>
      )}

      {habit.kind === 'caffeine' && (
        <p role="note" className="rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
          {habit.settings.cutoff_time
            ? `Depois das ${habit.settings.cutoff_time}, prefira descafeinado: a cafeína fica horas no corpo e atrapalha o sono. `
            : ''}
          Ansiedade, coração acelerado e insônia pioram com cafeína em excesso. Valores por porção são aproximados.
        </p>
      )}

      {habit.kind === 'medication' && (
        <p role="note" className="flex gap-2 rounded-xl border border-border bg-card p-3 text-sm text-muted-foreground">
          <Pill className="mt-0.5 h-4 w-4 shrink-0 text-primary" aria-hidden="true" />
          O Soliv só lembra. Não mude a dose nem pare o remédio sem falar com o seu médico.
        </p>
      )}

      {habit.kind === 'meals' && (
        <button
          type="button"
          onClick={() => navigate('/comer-com-atencao')}
          className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm hover:bg-muted/40"
        >
          <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: soft }}>
            <Leaf className="h-5 w-5" style={{ color }} aria-hidden="true" />
          </span>
          <span className="flex-1">
            <span className="block font-semibold text-foreground">Comer com atenção</span>
            <span className="block text-sm text-muted-foreground">Exercício guiado de 3 minutos para a próxima refeição</span>
          </span>
          <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />
        </button>
      )}

      <section className="grid grid-cols-3 gap-2">
        <Stat
          icon={Flame}
          label="Sequência"
          value={`${habitStreak(habit, totals, goal, today)} d`}
          hint={limit ? 'dias seguidos no limite' : 'dias seguidos na meta'}
        />
        {limit ? (
          <Stat icon={Trophy} label="No limite" value={`${weekOk} de 7`} hint="dias da semana" />
        ) : (
          <Stat icon={Trophy} label="Melhor" value={`${bestGoalStreak(totals, goal, today)} d`} hint="nos últimos 60 dias" />
        )}
        {habit.kind === 'medication' ? (
          // Remédio: quantas doses dos últimos 7 dias foram marcadas.
          <Stat
            icon={CalendarCheck}
            label="Doses (7 dias)"
            value={`${Math.round((Math.min(weekAverage * 7, goal * 7) / (goal * 7)) * 100)}%`}
            hint={`${Math.round(weekAverage * 7)} de ${goal * 7} marcadas`}
          />
        ) : (
          <Stat
            icon={CalendarCheck}
            label="Média"
            value={catalog.unit === 'count' ? formatNumber(weekAverage, 1) : formatHabitAmount(habit.kind, Math.round(weekAverage * 10) / 10)}
            hint={catalog.unit === 'count' ? `${catalog.countNoun?.[1] ?? ''} por dia na semana` : 'por dia na semana'}
          />
        )}
      </section>

      <section className="space-y-2 rounded-2xl border border-border bg-card p-4" aria-labelledby="week-chart">
        <h2 id="week-chart" className="text-base font-semibold text-foreground">Últimos 7 dias</h2>
        <div className="relative flex h-32 gap-2" role="list">
          {week.map((day) => {
            const [y, m, d] = day.date.split('-').map(Number);
            const weekday = WEEKDAY[new Date(y, m - 1, d).getDay()];
            const ok = dayOk(habit.kind, day.total, goal);
            const barColor = limit ? (day.total > goal ? OVER_LIMIT_COLOR : color) : ok ? color : `${color.replace(')', ' / 0.45)')}`;
            return (
              <div key={day.date} role="listitem" className="flex min-w-0 flex-1 flex-col items-center gap-1" aria-label={`${weekday}: ${formatHabitAmount(habit.kind, day.total)}`}>
                <div className="relative flex w-full flex-1 items-end overflow-hidden rounded-md bg-muted">
                  <div className="w-full rounded-md transition-all" style={{ height: `${Math.min(100, (day.total / chartMax) * 100)}%`, backgroundColor: barColor }} />
                  <div
                    className="pointer-events-none absolute inset-x-0 z-10 border-t-2 border-dashed border-foreground/60"
                    style={{ bottom: `${(goal / chartMax) * 100}%` }}
                    aria-hidden="true"
                  />
                </div>
                <span className={`text-xs ${day.date === today ? 'font-bold text-foreground' : 'text-muted-foreground'}`}>{weekday}</span>
              </div>
            );
          })}
        </div>
        <p className="text-xs text-muted-foreground">A linha tracejada é {limit ? 'o limite' : 'a meta'} do dia.</p>
      </section>

      <section className="space-y-2 rounded-2xl border border-border bg-card p-4" aria-labelledby="today-entries">
        <h2 id="today-entries" className="text-base font-semibold text-foreground">Registros de hoje</h2>
        {todayEntries.length === 0 ? (
          <p className="text-sm text-muted-foreground">Nada registrado ainda hoje.</p>
        ) : (
          <ul className="divide-y divide-border">
            {todayEntries.map((entry) => {
              const note = entryNote(habit, entry);
              const label = entryLabel(habit, entry);
              return (
                <li key={entry.id} className="flex items-center justify-between gap-2 py-2 text-sm">
                  <span className="min-w-0">
                    <span className="font-medium text-foreground">{label}</span>
                    <span className="ml-2 text-muted-foreground">
                      {new Date(entry.occurred_at).toLocaleTimeString('pt-BR', { hour: '2-digit', minute: '2-digit' })}
                    </span>
                    {note && <span className="block text-xs text-muted-foreground">{note}</span>}
                  </span>
                  <Button
                    variant="ghost"
                    size="icon"
                    aria-label={`Apagar registro: ${label}`}
                    onClick={() => onDeleteEvent(entry.id)}
                    disabled={entry.id.startsWith('tmp-')}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              );
            })}
          </ul>
        )}
      </section>
    </>
  );
};

// -------------------------------------------------------- largando

const QuitDetail = ({
  habit,
  events,
  onCraving,
  onRelapse,
}: {
  habit: UserHabit;
  events: HabitEvent[];
  onCraving: () => void;
  onRelapse: () => void;
}) => {
  const now = useNow(1000);
  const { color, soft } = HABIT_VISUALS[habit.kind];
  const stats = quitStats(habit, now);
  const { days, hours, minutes, seconds } = splitDuration(stats.seconds);
  const next = nextMilestone(days);
  const reached = reachedMilestones(days);
  const best = Math.max(habit.best_streak_seconds, stats.seconds);
  const weekAgo = addDays(localDateString(), -6);
  const cravings = events.filter((e) => e.kind === 'craving');
  const cravingsThisWeek = cravings.filter((e) => e.local_date >= weekAgo).length;
  const triggers = cravingTriggerRanking(cravings).slice(0, 3);
  const relapses = events.filter((e) => e.kind === 'relapse').length;
  const unitName = habit.kind === 'quit_smoking' ? 'Cigarros evitados' : 'Doses evitadas';

  return (
    <>
      <section className="rounded-2xl p-6 text-center" style={{ backgroundColor: soft }} aria-live="off">
        <p className="text-sm text-muted-foreground">Você está há</p>
        <p className="mt-1 text-5xl font-bold tabular-nums" style={{ color }}>
          {days}
          <span className="ml-2 text-xl font-semibold text-foreground">{days === 1 ? 'dia' : 'dias'}</span>
        </p>
        <p className="mt-1 font-mono text-lg tabular-nums text-foreground">
          {String(hours).padStart(2, '0')}:{String(minutes).padStart(2, '0')}:{String(seconds).padStart(2, '0')}
        </p>
        <p className="text-sm text-muted-foreground">{quitLabel(habit)}</p>
        {next && (
          <div className="mx-auto mt-4 max-w-xs space-y-1 text-left">
            <div className="flex justify-between text-xs text-muted-foreground">
              <span>Próximo marco: {milestoneLabel(next.target)}</span>
              <span>{Math.round(next.progress * 100)}%</span>
            </div>
            <Progress value={next.progress * 100} className="h-2" />
          </div>
        )}
      </section>

      {habit.settings.reason && (
        <blockquote className="rounded-2xl border-l-4 border-primary bg-primary/5 p-4 text-sm">
          <span className="block text-xs text-muted-foreground">Por que você está parando</span>
          {habit.settings.reason}
        </blockquote>
      )}

      <div className="grid grid-cols-2 gap-2">
        <Button variant="outline" className="min-h-12" onClick={onCraving}>
          <Wind className="mr-2 h-4 w-4" aria-hidden="true" />
          Senti vontade
        </Button>
        <Button variant="outline" className="min-h-12" onClick={onRelapse}>
          Tive uma recaída
        </Button>
      </div>

      <section className="grid grid-cols-2 gap-2">
        <Stat icon={PiggyBank} label="Economizado" value={formatBRL(stats.moneySaved)} hint={stats.moneySaved === 0 ? 'Informe quanto gastava em Editar' : undefined} />
        {habit.kind !== 'quit_custom' && <Stat icon={Check} label={unitName} value={formatNumber(stats.unitsAvoided)} />}
        {stats.lifeRegainedMinutes !== undefined && (
          <Stat
            icon={HeartPulse}
            label="Vida recuperada"
            value={formatDurationShort(stats.lifeRegainedMinutes * 60)}
            hint={`Estimativa: ${MINUTES_OF_LIFE_PER_CIGARETTE} min por cigarro (BMJ, 2000)`}
          />
        )}
        {stats.caloriesAvoided !== undefined && (
          <Stat icon={Flame} label="Calorias evitadas" value={`${formatNumber(stats.caloriesAvoided)} kcal`} hint={`Estimativa: ${KCAL_PER_DRINK} kcal por dose`} />
        )}
        <Stat icon={Trophy} label="Recorde" value={formatDurationShort(best)} hint={relapses > 0 ? `${relapses} ${relapses === 1 ? 'recomeço' : 'recomeços'}` : undefined} />
        <Stat
          icon={Wind}
          label="Vontades (7 dias)"
          value={String(cravingsThisWeek)}
          hint={triggers.length > 0 ? `Mais comum: ${triggers.map((t) => t.trigger.toLowerCase()).join(', ')}` : undefined}
        />
      </section>

      <section className="space-y-3 rounded-2xl border border-border bg-card p-4" aria-labelledby="milestones">
        <h2 id="milestones" className="text-base font-semibold text-foreground">Conquistas</h2>
        {reached.length === 0 ? (
          <p className="text-sm text-muted-foreground">A primeira conquista chega com 1 dia. Você consegue.</p>
        ) : (
          <ul className="flex flex-wrap gap-2">
            {reached.map((m) => (
              <li key={m} className="inline-flex items-center gap-1 rounded-full px-3 py-1 text-sm font-medium" style={{ backgroundColor: soft, color }}>
                <Trophy className="h-3.5 w-3.5" aria-hidden="true" />
                {milestoneLabel(m)}
              </li>
            ))}
          </ul>
        )}
      </section>

      {habit.kind === 'quit_smoking' && (
        <section className="space-y-3 rounded-2xl border border-border bg-card p-4" aria-labelledby="health">
          <h2 id="health" className="text-base font-semibold text-foreground">Como o seu corpo se recupera</h2>
          <ol className="space-y-3">
            {healthMilestoneProgress(stats.seconds).map((m) => (
              <li key={m.when} className="space-y-1">
                <div className="flex items-start gap-2 text-sm">
                  <span
                    className={`mt-0.5 flex h-5 w-5 shrink-0 items-center justify-center rounded-full ${m.reached ? 'text-white' : 'border border-border text-transparent'}`}
                    style={m.reached ? { backgroundColor: color } : undefined}
                    aria-hidden="true"
                  >
                    <Check className="h-3 w-3" />
                  </span>
                  <span>
                    <span className="font-medium text-foreground">{m.when}: </span>
                    <span className="text-muted-foreground">{m.text}</span>
                  </span>
                </div>
                {!m.reached && (
                  <div className="pl-7">
                    <Progress value={m.progress * 100} className="h-1.5" aria-label={`${Math.round(m.progress * 100)}% até ${m.when}`} />
                  </div>
                )}
              </li>
            ))}
          </ol>
          <p className="text-xs text-muted-foreground">Fontes: Organização Mundial da Saúde e INCA. O tempo varia de pessoa para pessoa.</p>
        </section>
      )}

      {habit.kind === 'quit_alcohol' && (
        <p role="note" className="rounded-lg border border-warning/40 bg-warning/10 p-3 text-sm">
          Tremores, suor, confusão ou convulsões nos primeiros dias sem beber podem ser abstinência grave. Procure um médico ou
          ligue 192.
        </p>
      )}
    </>
  );
};

// -------------------------------------------------------------- página

const HabitDetail = () => {
  const navigate = useNavigate();
  const { habitId } = useParams();
  const { habits, eventsByHabit, loading, logIntake, deleteEvent, updateEventDetails, logCraving, registerRelapse, archiveHabit, deleteHabit } = useHabits();
  const log = useHabitLogger(logIntake, deleteEvent);
  const [cravingOpen, setCravingOpen] = useState(false);
  const [relapseOpen, setRelapseOpen] = useState(false);
  const [archiveOpen, setArchiveOpen] = useState(false);
  const [deleteOpen, setDeleteOpen] = useState(false);

  const habit = habits.find((h) => h.id === habitId);
  const events = habit ? eventsByHabit.get(habit.id) ?? [] : [];

  return (
    <div className="has-tabs">
      <div className="screen">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
          <PageHeader
            title={habit ? habitTitle(habit) : 'Hábito'}
            backTo="/habitos"
            rightAction={
              habit ? (
                <Button
                  variant="ghost"
                  size="icon"
                  aria-label="Editar hábito"
                  className="text-primary-foreground hover:bg-primary-foreground/10 hover:text-primary-foreground"
                  onClick={() => navigate(`/habitos/${habit.id}/editar`)}
                >
                  <Pencil className="h-5 w-5" />
                </Button>
              ) : undefined
            }
          />
        </div>

        <main className="w-full p-4 space-y-4 max-w-2xl mx-auto">
          {loading ? (
            <HabitDetailSkeleton />
          ) : !habit ? (
            <div className="space-y-3">
              <p className="text-foreground">Este hábito não está mais na sua lista.</p>
              <Button onClick={() => navigate('/habitos')}>Ver meus hábitos</Button>
            </div>
          ) : (
            <>
              {isQuitHabit(habit.kind) ? (
                <QuitDetail habit={habit} events={events} onCraving={() => setCravingOpen(true)} onRelapse={() => setRelapseOpen(true)} />
              ) : (
                <DailyDetail
                  habit={habit}
                  events={events}
                  onLog={(item) => log(habit, events, item)}
                  onDeleteEvent={(id) => deleteEvent(id).catch(() => toast.error('Não foi possível apagar o registro.'))}
                  onUpdateDetails={(id, details) => updateEventDetails(id, details).catch(() => toast.error('Não foi possível salvar.'))}
                  onToggleOffline={() => {
                    const existing = offlineEventToday(events);
                    const action = existing ? deleteEvent(existing.id) : logIntake(habit.id, 0, { item: OFFLINE_ITEM }, 'check');
                    action.catch(() => toast.error('Não foi possível registrar agora.'));
                  }}
                />
              )}

              <button
                type="button"
                onClick={() => navigate(`/habitos/${habit.id}/editar`)}
                className="flex w-full items-center gap-2 rounded-xl border border-border bg-card p-3 text-left text-sm text-muted-foreground hover:bg-muted/40"
              >
                <BellRing className="h-4 w-4 text-primary" aria-hidden="true" />
                <span className="flex-1">{reminderSummary(habit)}</span>
                <span className="font-medium text-primary">Alterar</span>
              </button>

              <Button variant="ghost" className="w-full text-destructive hover:text-destructive" onClick={() => setArchiveOpen(true)}>
                <Trash2 className="mr-2 h-4 w-4" aria-hidden="true" />
                Tirar da minha lista
              </Button>

              <CravingDialog
                open={cravingOpen}
                onOpenChange={setCravingOpen}
                reason={habit.settings.reason}
                onSave={async (intensity, triggers, note) => {
                  try {
                    await logCraving(habit.id, intensity, triggers, note);
                  } catch (error) {
                    toast.error('Não foi possível registrar agora.');
                    throw error;
                  }
                }}
              />
              {habit.quit_started_at && (
                <RelapseDialog
                  open={relapseOpen}
                  onOpenChange={setRelapseOpen}
                  currentStreakSeconds={quitStats(habit).seconds}
                  onConfirm={async (note) => {
                    try {
                      await registerRelapse(habit.id, note);
                      toast.success('Contagem recomeçada. O seu recorde continua guardado.', {
                        action: { label: 'Falar com psicólogo', onClick: () => navigate('/appointments') },
                      });
                    } catch (error) {
                      toast.error('Não foi possível registrar agora.');
                      throw error;
                    }
                  }}
                />
              )}
              <AlertDialog open={archiveOpen} onOpenChange={setArchiveOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Tirar “{habitTitle(habit)}” da lista?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Os lembretes param e o histórico fica guardado. Se preferir, apague o hábito com todo o histórico.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter className="gap-2 sm:gap-0">
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <Button
                      variant="outline"
                      className="text-destructive hover:text-destructive"
                      onClick={() => {
                        setArchiveOpen(false);
                        setDeleteOpen(true);
                      }}
                    >
                      Apagar com o histórico
                    </Button>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={async () => {
                        try {
                          await archiveHabit(habit.id);
                          toast.success('Hábito tirado da lista');
                          navigate('/habitos', { replace: true });
                        } catch {
                          toast.error('Não foi possível tirar da lista agora.');
                        }
                      }}
                    >
                      Tirar da lista
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
              <AlertDialog open={deleteOpen} onOpenChange={setDeleteOpen}>
                <AlertDialogContent>
                  <AlertDialogHeader>
                    <AlertDialogTitle>Apagar “{habitTitle(habit)}” e todo o histórico?</AlertDialogTitle>
                    <AlertDialogDescription>
                      Todos os registros deste hábito{isQuitHabit(habit.kind) ? ', o recorde e as recaídas' : ''} são apagados de vez. Não dá para desfazer.
                    </AlertDialogDescription>
                  </AlertDialogHeader>
                  <AlertDialogFooter>
                    <AlertDialogCancel>Cancelar</AlertDialogCancel>
                    <AlertDialogAction
                      className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                      onClick={async () => {
                        try {
                          await deleteHabit(habit.id);
                          toast.success('Hábito e histórico apagados');
                          navigate('/habitos', { replace: true });
                        } catch {
                          toast.error('Não foi possível apagar agora.');
                        }
                      }}
                    >
                      Apagar de vez
                    </AlertDialogAction>
                  </AlertDialogFooter>
                </AlertDialogContent>
              </AlertDialog>
            </>
          )}
        </main>
      </div>
      <PatientBottomNav />
    </div>
  );
};

export default HabitDetail;

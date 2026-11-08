import { ProgressSection } from './ProgressSection';
import { lazy, Suspense } from 'react';
import { Smile, TrendingUp, TrendingDown, Minus } from 'lucide-react';
import { usePatientMoodHistory } from '@/hooks/usePatientMoodHistory';
import { MOOD_OPTIONS } from '@/components/moodOptions';

const MoodAreaChart = lazy(() => import('./MoodAreaChart'));

const TREND_COPY = {
  up: { Icon: TrendingUp, text: 'Seu humor está melhorando', color: 'text-success' },
  down: { Icon: TrendingDown, text: 'Seu humor tem caído — vale conversar com seu psicólogo', color: 'text-destructive' },
  stable: { Icon: Minus, text: 'Seu humor está estável', color: 'text-muted-foreground' },
} as const;

export const MoodTrendChart = () => {
  const { entries, loading, average, trend } = usePatientMoodHistory(30);

  return (
    <ProgressSection icon={Smile} title="Evolução do humor" subtitle="Últimos 30 dias">
      <div>
        {loading ? (
          <div className="h-40 bg-muted animate-pulse rounded-lg" />
        ) : entries.length === 0 ? (
          <div className="text-center py-6 space-y-2">
            <Smile className="w-8 h-8 mx-auto text-muted-foreground/50" />
            <p className="text-sm font-medium text-foreground">Ainda sem histórico de humor</p>
            <p className="text-xs text-muted-foreground max-w-xs mx-auto">
              Registre seu humor na tela inicial para começar a acompanhar sua evolução aqui.
            </p>
          </div>
        ) : (
          <div className="space-y-3">
            {/* O gráfico (biblioteca de ~550 KB) carrega à parte: o resto da tela aparece antes. */}
            <Suspense fallback={<div className="h-[180px] bg-muted animate-pulse rounded-lg" />}>
              <MoodAreaChart entries={entries} />
            </Suspense>

            <div className="flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted-foreground">
              {MOOD_OPTIONS.slice().reverse().map((m) => (
                <span key={m.value} className="flex items-center gap-1">
                  <m.Icon className={`w-3.5 h-3.5 ${m.colorClass}`} />
                  {m.label}
                </span>
              ))}
            </div>

            {(average !== null || trend) && (
              <div className="flex items-center justify-between text-sm pt-2 border-t">
                {average !== null && (
                  <span className="text-muted-foreground">
                    Média: <span className="font-semibold text-foreground">{average.toFixed(1)}/5</span>
                  </span>
                )}
                {trend && (
                  <span className={`flex items-center gap-1 font-medium ${TREND_COPY[trend].color}`}>
                    {(() => {
                      const { Icon } = TREND_COPY[trend];
                      return <Icon className="w-4 h-4" />;
                    })()}
                    {TREND_COPY[trend].text}
                  </span>
                )}
              </div>
            )}
          </div>
        )}
      </div>
    </ProgressSection>
  );
};

export default MoodTrendChart;

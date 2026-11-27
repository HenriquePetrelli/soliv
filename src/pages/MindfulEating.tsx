import { useEffect, useRef, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Check, ChevronLeft, ChevronRight, Leaf, Pause, Play, RotateCcw } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import PageHeader from '@/components/PageHeader';
import PatientBottomNav from '@/components/PatientBottomNav';
import { MINDFUL_EATING_STEPS, startOfStep, stepAt, totalSeconds } from '@/lib/mindfulEating';
import { usePatientStatistics } from '@/hooks/usePatientStatistics';
import { useAchievements } from '@/hooks/useAchievements';

const STEPS = MINDFUL_EATING_STEPS;
const TOTAL = totalSeconds(STEPS);
const minutes = Math.round(TOTAL / 60);

/** Comer com atenção: exercício guiado de ~3 minutos para fazer durante uma refeição. */
const MindfulEating = () => {
  const navigate = useNavigate();
  const [started, setStarted] = useState(false);
  const [running, setRunning] = useState(false);
  const [elapsed, setElapsed] = useState(0);
  const { index, remaining } = stepAt(STEPS, elapsed);
  const finished = index >= STEPS.length;
  const { addActivity } = usePatientStatistics({ load: false });
  const { loading: achievementsLoading, unlockAchievement } = useAchievements();
  const logged = useRef(false);

  // Ao terminar: entra no histórico e desbloqueia a conquista (uma vez por sessão).
  useEffect(() => {
    if (!finished || !started) return;
    if (!logged.current) {
      logged.current = true;
      void addActivity('Comer com Atenção');
    }
    if (!achievementsLoading) void unlockAchievement('Comer com Atenção');
  }, [finished, started, achievementsLoading, addActivity, unlockAchievement]);

  useEffect(() => {
    if (!running || finished) return;
    const timer = setInterval(() => setElapsed((value) => value + 1), 1000);
    return () => clearInterval(timer);
  }, [running, finished]);

  const goTo = (target: number) => setElapsed(startOfStep(STEPS, Math.min(Math.max(target, 0), STEPS.length)));

  return (
    <div className="has-tabs">
      <div className="screen">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
          <PageHeader title="Comer com atenção" backTo="/breathing" />
        </div>

        <main className="mx-auto max-w-xl space-y-5 p-4">
          {!started ? (
            <section className="space-y-4 rounded-2xl bg-primary/5 p-6 text-center">
              <Leaf className="mx-auto h-10 w-10 text-primary" aria-hidden="true" />
              <h2 className="text-xl font-semibold text-foreground">Uma refeição com calma</h2>
              <p className="text-sm text-muted-foreground">
                Cerca de {minutes} minutos, durante a próxima refeição ou lanche. Não há regra sobre o que ou quanto comer: a
                ideia é perceber a comida e o corpo, sem pressa e sem julgamento.
              </p>
              <Button
                className="min-h-12 w-full"
                onClick={() => {
                  setStarted(true);
                  setRunning(true);
                }}
              >
                <Play className="mr-2 h-4 w-4" aria-hidden="true" />
                Começar
              </Button>
            </section>
          ) : finished ? (
            <section className="space-y-4 rounded-2xl bg-primary/5 p-6 text-center" aria-live="polite">
              <span className="mx-auto flex h-14 w-14 items-center justify-center rounded-full bg-primary text-primary-foreground">
                <Check className="h-7 w-7" aria-hidden="true" />
              </span>
              <h2 className="text-xl font-semibold text-foreground">Muito bem</h2>
              <p className="text-sm text-muted-foreground">
                Comer com atenção fica mais fácil com a prática. Tente de novo numa próxima refeição, mesmo que só na primeira
                garfada.
              </p>
              <div className="grid gap-2 sm:grid-cols-2">
                <Button
                  variant="outline"
                  onClick={() => {
                    setElapsed(0);
                    setRunning(true);
                  }}
                >
                  <RotateCcw className="mr-2 h-4 w-4" aria-hidden="true" />
                  Fazer de novo
                </Button>
                <Button onClick={() => navigate('/habitos')}>Ir para Meus hábitos</Button>
              </div>
            </section>
          ) : (
            <>
              <div className="space-y-1">
                <div className="flex justify-between text-xs text-muted-foreground">
                  <span>
                    Passo {index + 1} de {STEPS.length}
                  </span>
                  <span className="tabular-nums">{remaining}s</span>
                </div>
                <Progress value={(elapsed / TOTAL) * 100} className="h-2" aria-label="Progresso do exercício" />
              </div>

              <section className="min-h-56 space-y-3 rounded-2xl bg-primary/5 p-6 text-center" aria-live="polite">
                <h2 className="text-2xl font-semibold text-foreground">{STEPS[index].title}</h2>
                <p className="text-base leading-relaxed text-foreground">{STEPS[index].text}</p>
              </section>

              <div className="flex items-center justify-between gap-2">
                <Button variant="ghost" size="icon" className="h-12 w-12" aria-label="Passo anterior" disabled={index === 0} onClick={() => goTo(index - 1)}>
                  <ChevronLeft className="h-5 w-5" />
                </Button>
                <Button className="min-h-12 flex-1" variant={running ? 'outline' : 'default'} onClick={() => setRunning((value) => !value)}>
                  {running ? <Pause className="mr-2 h-4 w-4" aria-hidden="true" /> : <Play className="mr-2 h-4 w-4" aria-hidden="true" />}
                  {running ? 'Pausar' : 'Continuar'}
                </Button>
                <Button variant="ghost" size="icon" className="h-12 w-12" aria-label="Próximo passo" onClick={() => goTo(index + 1)}>
                  <ChevronRight className="h-5 w-5" />
                </Button>
              </div>
            </>
          )}
        </main>
      </div>
      <PatientBottomNav />
    </div>
  );
};

export default MindfulEating;

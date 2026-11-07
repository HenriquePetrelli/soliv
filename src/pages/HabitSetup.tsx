import { useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { toast } from 'sonner';
import { HabitCatalogSkeleton, HabitFormSkeleton } from '@/components/skeletons/PageSkeletons';
import PageHeader from '@/components/PageHeader';
import PatientBottomNav from '@/components/PatientBottomNav';
import HabitForm from '@/components/habits/HabitForm';
import { HABIT_VISUALS } from '@/components/habits/habitVisuals';
import { useHabits, type HabitDraft } from '@/hooks/useHabits';
import {
  HABIT_CATALOG,
  MAX_ACTIVE_HABITS,
  QUIT_HABIT_KINDS,
  allowsMultiple,
  type HabitKind,
} from '@/lib/habits';
import { usePlanLimits } from '@/hooks/usePlanLimits';

const ALL_KINDS = Object.keys(HABIT_CATALOG) as HabitKind[];

/**
 * /habitos/novo: catálogo. /habitos/novo/:kind: configuração de um hábito
 * novo. /habitos/:habitId/editar: edição.
 */
const HabitSetup = () => {
  const navigate = useNavigate();
  const { kind: kindParam, habitId } = useParams();
  const { habits, loading, createHabit, updateHabit } = useHabits();
  const [saving, setSaving] = useState(false);

  const editing = habitId ? habits.find((h) => h.id === habitId) : undefined;
  const kind = (editing?.kind ?? (ALL_KINDS.includes(kindParam as HabitKind) ? kindParam : undefined)) as HabitKind | undefined;
  const activeKinds = new Set(habits.map((h) => h.kind));
  // Pelo endereço (/habitos/novo/agua) dava para abrir o formulário de um
  // hábito que já está na lista, ou passar do limite.
  const existingSameKind = !editing && kind && !allowsMultiple(kind) ? habits.find((h) => h.kind === kind) : undefined;
  const { maxHabits, isFree } = usePlanLimits();
  const overLimit = !editing && kind && habits.length >= maxHabits;

  const handleSubmit = async (draft: HabitDraft) => {
    setSaving(true);
    try {
      if (editing) {
        await updateHabit(editing.id, draft);
        toast.success('Hábito atualizado');
        navigate(`/habitos/${editing.id}`, { replace: true });
      } else {
        const id = await createHabit(draft);
        toast.success('Hábito adicionado. Um dia de cada vez!');
        navigate(`/habitos/${id}`, { replace: true });
      }
    } catch (error) {
      console.error('Erro ao salvar hábito', error);
      const err = error as { code?: string; message?: string };
      // Regras do banco com mensagem própria (limite de 10, hábito repetido).
      if (err?.code === '23505') toast.error('Esse hábito já está na sua lista.');
      else if (err?.code === '23514' && /hábitos/.test(err.message ?? '')) toast.error(err.message);
      else toast.error('Não foi possível salvar agora. Tente de novo.');
    } finally {
      setSaving(false);
    }
  };

  const title = editing ? 'Editar hábito' : kind ? HABIT_CATALOG[kind].title : 'Adicionar hábito';

  const renderCatalogGroup = (label: string, kinds: HabitKind[]) => (
    <section className="space-y-2">
      <h2 className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">{label}</h2>
      {kinds.map((k) => {
        const { icon: Icon, color, soft } = HABIT_VISUALS[k];
        const already = !allowsMultiple(k) && activeKinds.has(k);
        return (
          <button
            key={k}
            type="button"
            disabled={already || habits.length >= maxHabits}
            onClick={() => navigate(`/habitos/novo/${k}`)}
            className="flex w-full items-center gap-3 rounded-2xl border border-border bg-card p-4 text-left shadow-sm transition-colors hover:bg-muted/40 disabled:opacity-60 disabled:hover:bg-card"
          >
            <span className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl" style={{ backgroundColor: soft }}>
              <Icon className="h-5 w-5" style={{ color }} aria-hidden="true" />
            </span>
            <span className="min-w-0 flex-1">
              <span className="block font-semibold text-foreground">{HABIT_CATALOG[k].title}</span>
              <span className="block text-sm text-muted-foreground">{already ? 'Já está na sua lista' : HABIT_CATALOG[k].description}</span>
            </span>
            {!already && <ChevronRight className="h-4 w-4 text-muted-foreground" aria-hidden="true" />}
          </button>
        );
      })}
    </section>
  );

  return (
    <div className="has-tabs">
      <div className="screen">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
          <PageHeader title={title} backTo={editing ? `/habitos/${editing.id}` : kind ? '/habitos/novo' : '/habitos'} />
        </div>
        <main className="w-full p-4 space-y-6 max-w-2xl mx-auto">
          {loading ? (
            kind || habitId ? <HabitFormSkeleton /> : <HabitCatalogSkeleton />
          ) : habitId && !editing ? (
            <p className="text-foreground">Este hábito não está mais na sua lista.</p>
          ) : existingSameKind ? (
            <div className="space-y-3">
              <p className="text-foreground">Esse hábito já está na sua lista.</p>
              <Button onClick={() => navigate(`/habitos/${existingSameKind.id}`, { replace: true })}>Abrir o hábito</Button>
            </div>
          ) : overLimit ? (
            <div className="space-y-3">
              <p className="text-foreground">
                {isFree
                  ? `No Plano Grátis cabem ${maxHabits} hábitos na lista. Tire um da lista ou escolha um plano para ter até ${MAX_ACTIVE_HABITS}.`
                  : `Você já tem ${MAX_ACTIVE_HABITS} hábitos na lista. Tire um da lista para adicionar outro.`}
              </p>
              <Button onClick={() => navigate('/habitos', { replace: true })}>Ver meus hábitos</Button>
              {isFree && (
                <Button variant="outline" onClick={() => navigate('/subscription-plans')}>Ver planos</Button>
              )}
            </div>
          ) : kind ? (
            <HabitForm key={editing?.id ?? kind} kind={kind} habit={editing} saving={saving} onSubmit={handleSubmit} />
          ) : (
            <>
              {renderCatalogGroup('Corpo e rotina', ['water', 'sleep', 'movement', 'meals'])}
              {renderCatalogGroup('Saúde', ['medication'])}
              {renderCatalogGroup('Bem-estar', ['joy', 'screen_time', 'caffeine'])}
              {renderCatalogGroup('Largar um hábito', QUIT_HABIT_KINDS)}
            </>
          )}
        </main>
      </div>
      <PatientBottomNav />
    </div>
  );
};

export default HabitSetup;

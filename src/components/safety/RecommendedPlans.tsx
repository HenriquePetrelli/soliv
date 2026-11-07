import { useCallback, useEffect, useState } from 'react';
import { ChevronDown, ShieldCheck } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Label } from '@/components/ui/label';
import { RadioGroup, RadioGroupItem } from '@/components/ui/radio-group';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import SafetyPlanListsForm from '@/components/safety/SafetyPlanListsForm';
import RecommendedBadge from '@/components/safety/RecommendedBadge';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import type { SafetyPlanSummary } from '@/hooks/useSafetyPlan';
import { MAX_SAFETY_PLANS, SAFETY_PLAN_SECTIONS, type SafetyPlanLists } from '@/lib/safetyPlan';
import {
  DEFAULT_POST_CRISIS_TITLE,
  acceptSuggestion,
  countPlanItems,
  dismissSuggestion,
  fetchPendingSuggestions,
  type SafetyPlanSuggestion,
} from '@/lib/postCrisisPlan';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import { usePlanLimits } from '@/hooks/usePlanLimits';

type Edited = { title: string; lists: SafetyPlanLists };

/**
 * Planos que um psicólogo deixou ao fim de um atendimento. O paciente decide:
 * salvar (como está ou ajustado) ou "agora não". Sem internet, a seção some —
 * os planos já salvos continuam abrindo pela cópia do aparelho.
 */
const RecommendedPlans = ({ plans, onSaved }: { plans: SafetyPlanSummary[]; onSaved: () => void }) => {
  const { user } = useAuth();
  const { toast } = useToast();
  const [suggestions, setSuggestions] = useState<SafetyPlanSuggestion[]>([]);
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [editing, setEditing] = useState<{ suggestion: SafetyPlanSuggestion; draft: Edited } | null>(null);
  // Limite de planos: escolher qual substituir antes de salvar.
  const [replacing, setReplacing] = useState<{ suggestion: SafetyPlanSuggestion; edited?: Edited } | null>(null);
  const [replaceId, setReplaceId] = useState<string>('');

  const load = useCallback(async () => {
    if (!user) return;
    try {
      setSuggestions(await fetchPendingSuggestions(user.id));
    } catch {
      setSuggestions([]);
    }
  }, [user]);

  useEffect(() => {
    void load();
  }, [load]);

  const { maxSafetyPlans, isFree } = usePlanLimits();
  const limitReached = plans.length >= maxSafetyPlans;

  const save = async (suggestion: SafetyPlanSuggestion, edited?: Edited, replacePlanId?: string) => {
    if (limitReached && !replacePlanId) {
      setReplaceId('');
      setReplacing({ suggestion, edited });
      return;
    }
    setBusyId(suggestion.id);
    try {
      await acceptSuggestion(suggestion.id, { edited, replacePlanId });
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
      setEditing(null);
      setReplacing(null);
      toast({ title: 'Plano salvo nos seus planos', description: 'Você pode mudar o que quiser nele quando precisar.' });
      onSaved();
    } catch (error) {
      toast({
        title: 'Não foi possível salvar o plano',
        description: getFriendlyErrorMessage(error, 'Tente de novo em instantes.'),
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  const dismiss = async (suggestion: SafetyPlanSuggestion) => {
    setBusyId(suggestion.id);
    try {
      await dismissSuggestion(suggestion.id);
      setSuggestions((prev) => prev.filter((s) => s.id !== suggestion.id));
    } catch (error) {
      toast({
        title: 'Não foi possível concluir',
        description: getFriendlyErrorMessage(error, 'Tente de novo em instantes.'),
        variant: 'destructive',
      });
    } finally {
      setBusyId(null);
    }
  };

  if (suggestions.length === 0) return null;

  return (
    <section className="space-y-2" aria-labelledby="recomendados-titulo">
      <h2 id="recomendados-titulo" className="text-sm font-semibold text-foreground">
        Recomendados para você
      </h2>
      <ul className="space-y-2">
        {suggestions.map((s) => {
          const expanded = expandedId === s.id;
          const busy = busyId === s.id;
          return (
            <li key={s.id} className="space-y-3 rounded-xl border bg-card p-4">
              <div className="flex items-start gap-3">
                <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-lg bg-primary/10" aria-hidden="true">
                  <ShieldCheck className="h-5 w-5 text-primary" />
                </span>
                <div className="min-w-0 flex-1 space-y-1">
                  <p className="font-medium text-foreground">{s.title}</p>
                  <RecommendedBadge name={s.psychologistName} />
                  <p className="text-xs text-muted-foreground">
                    {countPlanItems(s.lists)} {countPlanItems(s.lists) === 1 ? 'item' : 'itens'} · feito com você no{' '}
                    {s.sourceType === 'sos' ? 'atendimento SOS' : 'atendimento'}
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setExpandedId(expanded ? null : s.id)}
                aria-expanded={expanded}
                className="flex min-h-10 w-full items-center justify-between rounded-lg px-1 text-sm font-medium text-primary"
              >
                {expanded ? 'Esconder o plano' : 'Ver o plano'}
                <ChevronDown className={`h-4 w-4 transition-transform ${expanded ? 'rotate-180' : ''}`} aria-hidden="true" />
              </button>
              {expanded && (
                <div className="space-y-3 border-t pt-3">
                  {SAFETY_PLAN_SECTIONS.filter((sec) => s.lists[sec.key].length > 0).map((sec) => (
                    <div key={sec.key}>
                      <p className="text-xs font-semibold text-muted-foreground">{sec.title}</p>
                      <ul className="mt-1 list-disc space-y-0.5 pl-5 text-sm text-foreground">
                        {s.lists[sec.key].map((item) => (
                          <li key={item}>{item}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </div>
              )}

              <div className="flex flex-col gap-2 sm:flex-row">
                <Button className="min-h-11 flex-1" onClick={() => save(s)} disabled={busy}>
                  {busy ? 'Salvando...' : 'Salvar nos meus planos'}
                </Button>
                <Button
                  variant="outline"
                  className="min-h-11 flex-1"
                  onClick={() => setEditing({ suggestion: s, draft: { title: s.title, lists: s.lists } })}
                  disabled={busy}
                >
                  Editar antes de salvar
                </Button>
                <Button variant="ghost" className="min-h-11" onClick={() => dismiss(s)} disabled={busy}>
                  Agora não
                </Button>
              </div>
            </li>
          );
        })}
      </ul>

      <Dialog open={!!editing} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-lg">
          <DialogHeader>
            <DialogTitle>Ajustar o plano</DialogTitle>
            <DialogDescription>
              Mude o que quiser antes de salvar. Os contatos de emergência você adiciona depois, editando o plano.
            </DialogDescription>
          </DialogHeader>
          {editing && (
            <SafetyPlanListsForm
              idPrefix="recomendado"
              title={editing.draft.title}
              titlePlaceholder={DEFAULT_POST_CRISIS_TITLE}
              onTitleChange={(title) => setEditing({ ...editing, draft: { ...editing.draft, title } })}
              lists={editing.draft.lists}
              onListsChange={(lists) => setEditing({ ...editing, draft: { ...editing.draft, lists } })}
            />
          )}
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setEditing(null)}>
              Cancelar
            </Button>
            <Button
              onClick={() =>
                editing &&
                save(editing.suggestion, {
                  title: editing.draft.title.trim() || DEFAULT_POST_CRISIS_TITLE,
                  lists: editing.draft.lists,
                })
              }
              disabled={!editing || busyId === editing.suggestion.id || countPlanItems(editing.draft.lists) === 0}
            >
              Salvar nos meus planos
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      <Dialog open={!!replacing} onOpenChange={(open) => !open && setReplacing(null)}>
        <DialogContent className="max-h-[90dvh] overflow-y-auto sm:max-w-md">
          <DialogHeader>
            <DialogTitle>
              {isFree ? `No Plano Grátis cabe ${maxSafetyPlans} plano` : `Você já tem ${MAX_SAFETY_PLANS} planos`}
            </DialogTitle>
            <DialogDescription>
              Para salvar este, escolha um plano para substituir. O plano escolhido e os contatos dele serão apagados.
              {isFree && ` Com um plano pago, você guarda até ${MAX_SAFETY_PLANS}.`}
            </DialogDescription>
          </DialogHeader>
          <RadioGroup value={replaceId} onValueChange={setReplaceId} className="gap-2">
            {plans.map((p) => (
              <div key={p.id} className="flex items-center gap-3 rounded-lg border p-3">
                <RadioGroupItem value={p.id} id={`substituir-${p.id}`} />
                <Label htmlFor={`substituir-${p.id}`} className="min-w-0 flex-1 cursor-pointer truncate font-normal">
                  {p.title}
                </Label>
              </div>
            ))}
          </RadioGroup>
          <DialogFooter className="gap-2 sm:gap-0">
            <Button variant="outline" onClick={() => setReplacing(null)}>
              Cancelar
            </Button>
            <Button
              variant="destructive"
              disabled={!replaceId || !replacing || busyId === replacing.suggestion.id}
              onClick={() => replacing && save(replacing.suggestion, replacing.edited, replaceId)}
            >
              Substituir e salvar
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </section>
  );
};

export default RecommendedPlans;

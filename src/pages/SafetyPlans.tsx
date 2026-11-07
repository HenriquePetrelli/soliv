import { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Pencil, Plus, ShieldCheck, Trash2 } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
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
import HomeCrisisAccess from '@/components/HomeCrisisAccess';
import { useSafetyPlans, type SafetyPlanSummary } from '@/hooks/useSafetyPlan';
import { MAX_SAFETY_PLANS } from '@/lib/safetyPlan';
import OfflinePlanNotice from '@/components/safety/OfflinePlanNotice';
import RecommendedPlans from '@/components/safety/RecommendedPlans';
import RecommendedBadge from '@/components/safety/RecommendedBadge';
import { usePlanLimits } from '@/hooks/usePlanLimits';

/** The patient's safety plans: titles only, each with edit and delete. */
const SafetyPlans = () => {
  const navigate = useNavigate();
  const { plans, loading, offline, deletingId, deletePlan, reload } = useSafetyPlans();
  const [toDelete, setToDelete] = useState<SafetyPlanSummary | null>(null);
  const { maxSafetyPlans, isFree } = usePlanLimits();
  const limitReached = plans.length >= maxSafetyPlans;

  return (
    <div className="has-tabs">
      <div className="screen">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
          <PageHeader title="Planos de segurança" backTo="/home" />
        </div>

        <main className="p-4 pb-40 space-y-5 max-w-2xl mx-auto">
          <p className="text-sm text-muted-foreground">
            Roteiros seus para os momentos difíceis. Se você pedir ajuda pelo SOS, o psicólogo que atender pode
            consultá-los durante o atendimento, e esse acesso fica registrado.
          </p>

          {offline && <OfflinePlanNotice />}

          {!offline && <RecommendedPlans plans={plans} onSaved={reload} />}

          <div className="space-y-2">
            <Button className="w-full min-h-12" onClick={() => navigate('/safety-plan/novo')} disabled={loading || limitReached}>
              <Plus className="mr-2 h-4 w-4" />
              Cadastrar novo plano de segurança
            </Button>
            {!loading && (
              <p className="text-center text-xs text-muted-foreground" aria-live="polite">
                {limitReached
                  ? isFree
                    ? `No Plano Grátis cabe ${maxSafetyPlans} plano de segurança. Exclua o atual ou escolha um plano para ter até ${MAX_SAFETY_PLANS}.`
                    : `Você chegou ao limite de ${MAX_SAFETY_PLANS} planos. Exclua um para cadastrar outro.`
                  : `${plans.length} de ${maxSafetyPlans} ${maxSafetyPlans === 1 ? 'plano' : 'planos'}`}
              </p>
            )}
          </div>

          {loading ? (
            <div className="space-y-2">
              {Array.from({ length: 3 }).map((_, i) => (
                <Skeleton key={i} className="h-16 w-full" />
              ))}
            </div>
          ) : plans.length === 0 ? (
            <div className="rounded-xl border border-dashed p-6 text-center">
              <ShieldCheck className="mx-auto mb-2 h-8 w-8 text-primary" aria-hidden="true" />
              <p className="font-medium text-foreground">Você ainda não tem um plano de segurança</p>
              <p className="mt-1 text-sm text-muted-foreground">
                Anote com calma o que ajuda você nas crises e quem pode ser chamado. Leva uns 10 minutos.
              </p>
            </div>
          ) : (
            <ul className="space-y-2" aria-label="Seus planos de segurança">
              {plans.map((plan) => (
                <li key={plan.id} className="flex items-center gap-1 rounded-xl border bg-card py-1 pl-1 pr-2">
                  {/* Tocar no plano abre a leitura; o lápis leva à edição. */}
                  <button
                    type="button"
                    onClick={() => navigate(`/safety-plan/${plan.id}/ver`)}
                    className="flex min-h-11 min-w-0 flex-1 items-center gap-2 rounded-lg px-3 py-2 text-left hover:bg-muted/50"
                    aria-label={`Ver ${plan.title}`}
                  >
                    <ShieldCheck className="h-5 w-5 shrink-0 text-primary" aria-hidden="true" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate font-medium text-foreground">{plan.title}</span>
                      {plan.recommended_by && (
                        <RecommendedBadge name={plan.recommended_by} edited={Boolean(plan.patient_edited_at)} />
                      )}
                    </span>
                  </button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0 text-muted-foreground hover:text-foreground"
                    onClick={() => navigate(`/safety-plan/${plan.id}`)}
                    aria-label={`Editar ${plan.title}`}
                  >
                    <Pencil className="h-4 w-4" />
                  </Button>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="h-11 w-11 shrink-0 text-muted-foreground hover:text-destructive"
                    onClick={() => setToDelete(plan)}
                    disabled={deletingId === plan.id}
                    aria-label={`Excluir ${plan.title}`}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </li>
              ))}
            </ul>
          )}

          <HomeCrisisAccess />
        </main>
      </div>

      <AlertDialog open={!!toDelete} onOpenChange={(open) => !open && setToDelete(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir "{toDelete?.title}"?</AlertDialogTitle>
            <AlertDialogDescription>
              O plano e os contatos de emergência dele serão apagados. Não dá para desfazer.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              onClick={async () => {
                if (toDelete) await deletePlan(toDelete.id);
                setToDelete(null);
              }}
            >
              Excluir
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PatientBottomNav />
    </div>
  );
};

export default SafetyPlans;

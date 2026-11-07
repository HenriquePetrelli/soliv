import { useEffect, useMemo, useRef, useState } from 'react';
import { useNavigate, useParams } from 'react-router-dom';
import { Accordion, AccordionContent, AccordionItem, AccordionTrigger } from '@/components/ui/accordion';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Checkbox } from '@/components/ui/checkbox';
import { Skeleton } from '@/components/ui/skeleton';
import { Check, Star, Trash2 } from 'lucide-react';
import PageHeader from '@/components/PageHeader';
import PatientBottomNav from '@/components/PatientBottomNav';
import HomeCrisisAccess from '@/components/HomeCrisisAccess';
import SafetyPlanSectionEditor from '@/components/safety/SafetyPlanSectionEditor';
import { useToast } from '@/hooks/use-toast';
import { SAFETY_PLAN_CACHE_PREFIX, useSafetyPlan, type EmergencyContact, type SafetyPlanDraft } from '@/hooks/useSafetyPlan';
import { useAuth } from '@/contexts/AuthContext';
import {
  MAX_PLAN_TITLE_LENGTH,
  MAX_SAFETY_PLANS,
  SAFETY_PLAN_SECTIONS,
  TOTAL_PLAN_PARTS,
  defaultPlanTitle,
  emptySafetyPlan,
  countFilledSections,
  isValidPhone,
  telHref,
  type SafetyPlanLists,
} from '@/lib/safetyPlan';
import { usePlanLimits } from '@/hooks/usePlanLimits';

/**
 * Create (/safety-plan/novo) or edit (/safety-plan/:planId) one safety plan.
 * Title, lists and contacts are a local draft saved together by "Salvar
 * plano" — adding a contact never touches the database on its own, so
 * nothing marked on screen can be lost before saving.
 */
const SafetyPlanEditor = () => {
  const { planId: planIdParam } = useParams<{ planId: string }>();
  const planId = planIdParam && planIdParam !== 'novo' ? planIdParam : null;
  const isNew = planId === null;
  const navigate = useNavigate();
  const { toast } = useToast();
  const { user } = useAuth();
  const { initial, planCount, notFound, loading, saving, save } = useSafetyPlan(planId);
  const draftKey = user ? `${SAFETY_PLAN_CACHE_PREFIX}${user.id}:rascunho:${planId ?? 'novo'}` : null;
  const [title, setTitle] = useState('');
  const [draftPlan, setDraftPlan] = useState<SafetyPlanLists>(emptySafetyPlan());
  const [contacts, setContacts] = useState<EmergencyContact[]>([]);
  const [contactName, setContactName] = useState('');
  const [contactRelationship, setContactRelationship] = useState('');
  const [contactPhone, setContactPhone] = useState('');
  const [contactPrimary, setContactPrimary] = useState(false);
  const [phoneTouched, setPhoneTouched] = useState(false);

  // Fill the editor from the database once, when the plan first loads. After
  // that the draft belongs to the patient and nothing overwrites it.
  const draftInitialized = useRef(false);
  const [draftReady, setDraftReady] = useState(false);
  useEffect(() => {
    if (loading || draftInitialized.current) return;
    draftInitialized.current = true;
    setDraftReady(true);
    // Alterações não salvas de uma visita anterior (saiu da tela, recarregou,
    // acabou a bateria): voltam para a tela.
    let restored: SafetyPlanDraft | null = null;
    try {
      const raw = draftKey ? localStorage.getItem(draftKey) : null;
      restored = raw ? (JSON.parse(raw) as SafetyPlanDraft) : null;
    } catch {
      restored = null;
    }
    if (restored && JSON.stringify(restored) !== JSON.stringify(initial)) {
      setTitle(restored.title ?? '');
      setDraftPlan({ ...emptySafetyPlan(), ...restored.lists });
      setContacts(restored.contacts ?? []);
      toast({ title: 'Recuperamos o que você não tinha salvado', description: 'Confira e toque em "Salvar plano".' });
      return;
    }
    setTitle(initial.title);
    setDraftPlan(initial.lists);
    setContacts(initial.contacts);
  }, [initial, loading, draftKey, toast]);

  const titlePlaceholder = isNew ? defaultPlanTitle(planCount) : initial.title || defaultPlanTitle(0);
  const { maxSafetyPlans, isFree } = usePlanLimits();
  const limitReached = isNew && planCount >= maxSafetyPlans;
  const dirty = useMemo(
    () =>
      JSON.stringify({ title, lists: draftPlan, contacts }) !==
      JSON.stringify({ title: initial.title, lists: initial.lists, contacts: initial.contacts }),
    [title, draftPlan, contacts, initial]
  );
  // Rascunho no aparelho enquanto houver alteração não salva.
  useEffect(() => {
    if (!draftKey || !draftReady) return;
    try {
      if (dirty) localStorage.setItem(draftKey, JSON.stringify({ title, lists: draftPlan, contacts }));
      else localStorage.removeItem(draftKey);
    } catch {
      /* sem armazenamento */
    }
  }, [draftKey, draftReady, dirty, title, draftPlan, contacts]);

  // Fechar ou recarregar a aba com alteração não salva: o navegador pergunta.
  useEffect(() => {
    if (!dirty) return;
    const warn = (event: BeforeUnloadEvent) => {
      event.preventDefault();
      event.returnValue = '';
    };
    window.addEventListener('beforeunload', warn);
    return () => window.removeEventListener('beforeunload', warn);
  }, [dirty]);

  const filled = countFilledSections(draftPlan, contacts.length);
  // Open the first part that is still empty, so filling in feels step by step.
  const firstEmpty = SAFETY_PLAN_SECTIONS.find((s) => draftPlan[s.key].length === 0)?.key
    ?? (contacts.length === 0 ? 'contacts' : undefined);

  const phoneInvalid = phoneTouched && contactPhone.trim() !== '' && !isValidPhone(contactPhone);

  const handleSave = async () => {
    const finalTitle = (title.trim() || titlePlaceholder).slice(0, MAX_PLAN_TITLE_LENGTH);
    const id = await save({ title: finalTitle, lists: draftPlan, contacts });
    if (id) {
      if (draftKey) {
        try {
          localStorage.removeItem(draftKey);
        } catch {
          /* noop */
        }
      }
      toast({ title: 'Plano salvo' });
      navigate('/safety-plan');
    }
  };

  const handleAddContact = () => {
    setPhoneTouched(true);
    if (!contactName.trim() || !isValidPhone(contactPhone)) return;
    const makePrimary = contactPrimary || contacts.length === 0;
    const contact: EmergencyContact = {
      name: contactName.trim(),
      relationship: contactRelationship.trim() || null,
      phone: contactPhone.trim(),
      is_primary: makePrimary,
    };
    setContacts((prev) => [
      ...(makePrimary ? prev.map((c) => ({ ...c, is_primary: false })) : prev),
      contact,
    ]);
    setContactName('');
    setContactRelationship('');
    setContactPhone('');
    setContactPrimary(false);
    setPhoneTouched(false);
  };

  const removeContact = (index: number) => {
    setContacts((prev) => {
      const next = prev.filter((_, i) => i !== index);
      // Keep someone as primary when the primary contact is removed.
      if (next.length > 0 && !next.some((c) => c.is_primary)) next[0] = { ...next[0], is_primary: true };
      return next;
    });
  };

  if (notFound) {
    return (
      <div className="min-h-screen bg-background">
        <PageHeader title="Plano de segurança" backTo="/safety-plan" />
        <main className="p-4 max-w-2xl mx-auto space-y-4">
          <p className="text-foreground">Este plano não existe mais. Ele pode ter sido excluído.</p>
          <Button onClick={() => navigate('/safety-plan')}>Ver meus planos</Button>
        </main>
      </div>
    );
  }

  const showSaveBar = !loading && (isNew || dirty);

  return (
    <div className="has-tabs">
      <div className="screen">
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
          <PageHeader title={isNew ? "Novo plano de segurança" : "Editar plano de segurança"} backTo="/safety-plan" />
        </div>

        <main
          className="p-4 space-y-5 max-w-2xl mx-auto"
          // Espaço para o fim do formulário rolar acima da barra de salvar.
          style={showSaveBar ? { paddingBottom: 'calc(var(--tab-height) + 120px + env(safe-area-inset-bottom))' } : undefined}
        >
          <section className="space-y-2">
            <p className="text-foreground">
              Um roteiro seu, escrito com calma, para usar quando as coisas ficarem difíceis. Preencha no seu ritmo —
              dá para voltar e mudar quando quiser.
            </p>
            <p className="text-sm text-muted-foreground">
              Só você vê este plano. Se você pedir ajuda pelo SOS, o psicólogo que atender pode consultá-lo durante o
              atendimento, e esse acesso fica registrado.
            </p>
            {!loading && (
              <p className="text-sm font-medium text-primary" aria-live="polite">
                {filled} de {TOTAL_PLAN_PARTS} partes preenchidas
              </p>
            )}
          </section>

          {limitReached && (
            <p role="alert" className="rounded-lg border border-destructive/30 bg-destructive/5 p-3 text-sm text-foreground">
              {isFree
                ? `No Plano Grátis cabe ${maxSafetyPlans} plano de segurança. Exclua o atual na lista ou escolha um plano para ter até ${MAX_SAFETY_PLANS}.`
                : `Você já tem ${MAX_SAFETY_PLANS} planos de segurança, o máximo permitido. Exclua um na lista para criar outro.`}
            </p>
          )}

          {!loading && (
            <div className="space-y-1.5">
              <Label htmlFor="plan-title">Título do plano</Label>
              <Input
                id="plan-title"
                value={title}
                onChange={(e) => setTitle(e.target.value)}
                placeholder={titlePlaceholder}
                maxLength={MAX_PLAN_TITLE_LENGTH}
              />
              <p className="text-xs text-muted-foreground">Se deixar em branco, o plano se chama "{titlePlaceholder}".</p>
            </div>
          )}

          {loading ? (
            <div className="space-y-3">
              {Array.from({ length: 4 }).map((_, i) => (
                <Skeleton key={i} className="h-14 w-full" />
              ))}
            </div>
          ) : (
            <Accordion type="single" collapsible defaultValue={firstEmpty} className="space-y-3">
              {SAFETY_PLAN_SECTIONS.map((section, index) => {
                const count = draftPlan[section.key].length;
                return (
                  <AccordionItem key={section.key} value={section.key} className="rounded-2xl border border-border/70 bg-card/80 px-3 shadow-sm data-[state=open]:border-border sm:px-4">
                    <AccordionTrigger className="min-h-14 text-left hover:no-underline [&>svg]:h-5 [&>svg]:w-5 [&>svg]:text-muted-foreground">
                      <span className="flex items-center gap-3">
                        <span
                          className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                            count > 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                          }`}
                          aria-hidden="true"
                        >
                          {count > 0 ? <Check className="h-4 w-4" /> : index + 1}
                        </span>
                        <span className="text-sm font-semibold text-foreground sm:text-base">{section.title}</span>
                        {count > 0 && <span className="text-xs text-muted-foreground">({count})</span>}
                      </span>
                    </AccordionTrigger>
                    <AccordionContent>
                      <SafetyPlanSectionEditor
                        sectionKey={section.key}
                        items={draftPlan[section.key]}
                        onChange={(next) => setDraftPlan((prev) => ({ ...prev, [section.key]: next }))}
                      />
                    </AccordionContent>
                  </AccordionItem>
                );
              })}

              <AccordionItem value="contacts" className="rounded-2xl border border-border/70 bg-card/80 px-3 shadow-sm data-[state=open]:border-border sm:px-4">
                <AccordionTrigger className="min-h-14 text-left hover:no-underline [&>svg]:h-5 [&>svg]:w-5 [&>svg]:text-muted-foreground">
                  <span className="flex items-center gap-3">
                    <span
                      className={`flex h-7 w-7 shrink-0 items-center justify-center rounded-full text-xs font-semibold ${
                        contacts.length > 0 ? 'bg-primary text-primary-foreground' : 'bg-muted text-muted-foreground'
                      }`}
                      aria-hidden="true"
                    >
                      {contacts.length > 0 ? <Check className="h-4 w-4" /> : SAFETY_PLAN_SECTIONS.length + 1}
                    </span>
                    <span className="text-sm font-semibold text-foreground sm:text-base">Pessoas a quem posso pedir ajuda</span>
                    {contacts.length > 0 && <span className="text-xs text-muted-foreground">({contacts.length})</span>}
                  </span>
                </AccordionTrigger>
                <AccordionContent className="space-y-4">
                  <p className="text-sm text-muted-foreground">
                    Quem você gostaria que fosse avisado se precisar de ajuda. O contato principal aparece primeiro.
                    Os contatos são salvos junto com o plano.
                  </p>

                  {contacts.length > 0 && (
                    <ul className="space-y-2">
                      {contacts.map((c, index) => (
                        <li key={`${c.name}-${c.phone}-${index}`} className="flex items-center justify-between gap-2 rounded-lg border px-3 py-2">
                          <div className="min-w-0">
                            <p className="flex items-center gap-1 text-sm font-medium text-foreground">
                              {c.is_primary && <Star className="h-3.5 w-3.5 text-primary" aria-label="Contato principal" />}
                              {c.name}
                              {c.relationship && <span className="font-normal text-muted-foreground"> · {c.relationship}</span>}
                            </p>
                            <a href={telHref(c.phone)} className="text-sm text-primary underline-offset-2 hover:underline">
                              {c.phone}
                            </a>
                          </div>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-10 w-10 shrink-0 text-muted-foreground hover:text-destructive"
                            onClick={() => removeContact(index)}
                            disabled={saving}
                            aria-label={`Remover ${c.name}`}
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </li>
                      ))}
                    </ul>
                  )}

                  <form
                    className="space-y-3 rounded-lg border border-dashed p-3"
                    onSubmit={(e) => {
                      e.preventDefault();
                      handleAddContact();
                    }}
                  >
                    <div className="space-y-1.5">
                      <Label htmlFor="contact-name">Nome</Label>
                      <Input id="contact-name" value={contactName} onChange={(e) => setContactName(e.target.value)} maxLength={100} />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="contact-relationship">Quem é (opcional)</Label>
                      <Input
                        id="contact-relationship"
                        value={contactRelationship}
                        onChange={(e) => setContactRelationship(e.target.value)}
                        placeholder="Mãe, amigo, parceira..."
                        maxLength={60}
                      />
                    </div>
                    <div className="space-y-1.5">
                      <Label htmlFor="contact-phone">Telefone</Label>
                      <Input
                        id="contact-phone"
                        type="tel"
                        inputMode="tel"
                        value={contactPhone}
                        onChange={(e) => setContactPhone(e.target.value)}
                        onBlur={() => setPhoneTouched(true)}
                        placeholder="(11) 99999-9999"
                        aria-invalid={phoneInvalid}
                        aria-describedby={phoneInvalid ? 'contact-phone-error' : undefined}
                        maxLength={20}
                      />
                      {phoneInvalid && (
                        <p id="contact-phone-error" className="text-sm text-destructive">
                          Confira o número — use só números, com DDD.
                        </p>
                      )}
                    </div>
                    {contacts.length > 0 && (
                      <div className="flex min-h-10 items-center gap-2">
                        <Checkbox
                          id="contact-primary"
                          checked={contactPrimary}
                          onCheckedChange={(v) => setContactPrimary(v === true)}
                        />
                        <Label htmlFor="contact-primary" className="font-normal">Tornar contato principal</Label>
                      </div>
                    )}
                    <Button type="submit" variant="secondary" className="w-full" disabled={!contactName.trim() || !contactPhone.trim()}>
                      Adicionar contato
                    </Button>
                  </form>
                </AccordionContent>
              </AccordionItem>
            </Accordion>
          )}

          <HomeCrisisAccess />
        </main>

        {showSaveBar && (
          // Barra fixa com fundo, colada no menu inferior (no desktop, no rodapé),
          // para o botão não ficar solto por cima dos campos.
          <div className="fixed inset-x-0 bottom-[var(--tab-height)] md:bottom-0 z-20 border-t border-border bg-background/95 backdrop-blur-sm px-4 py-3">
            <div className="mx-auto max-w-2xl">
              <Button className="w-full min-h-12" onClick={handleSave} disabled={saving || limitReached}>
                {saving ? 'Salvando...' : 'Salvar plano'}
              </Button>
            </div>
          </div>
        )}
      </div>
      <PatientBottomNav />
    </div>
  );
};

export default SafetyPlanEditor;

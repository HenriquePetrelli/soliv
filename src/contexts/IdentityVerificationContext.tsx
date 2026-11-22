import React, { createContext, lazy, Suspense, useCallback, useContext, useEffect, useMemo, useRef, useState } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { supabase } from '@/integrations/supabase/client';
import { forgetPatientHomeRow, getPatientHomeRow } from '@/lib/patientHomeRow';
import { useAuth } from '@/contexts/AuthContext';
import { useOptionalSubscription } from '@/contexts/SubscriptionContext';
import { useLegalGateStatus } from '@/lib/legalGateStatus';
import {
  autoPromptFor,
  parseIdentityStatus,
  promptMarksFor,
  type IdentityPromptReason,
  type IdentityStatus,
  type PatientIdentityFields,
} from '@/lib/identityVerification';

// Só baixa a modal quando ela vai abrir.
const IdentityVerificationModal = lazy(() => import('@/components/identity/IdentityVerificationModal'));

interface IdentityVerificationContextType {
  /** null enquanto carrega (ou para quem não é paciente). */
  status: IdentityStatus | null;
  rejectionReason: string | null;
  isVerified: boolean;
  /** A modal está aberta (outras janelas automáticas esperam ela fechar). */
  promptOpen: boolean;
  openPrompt: (reason?: IdentityPromptReason) => void;
  /**
   * Para SOS e agendamento: true se pode seguir. Sem identidade aprovada, abre
   * a modal e devolve false. Enquanto não sabe (carregando, erro), deixa seguir:
   * o servidor confere de novo.
   */
  requireVerified: (reason: 'sos' | 'appointment') => boolean;
  refresh: () => Promise<void>;
}

const IdentityVerificationContext = createContext<IdentityVerificationContextType | undefined>(undefined);

const NOOP_CONTEXT: IdentityVerificationContextType = {
  status: null,
  rejectionReason: null,
  isVerified: false,
  promptOpen: false,
  openPrompt: () => undefined,
  requireVerified: () => true,
  refresh: async () => undefined,
};

/** Sem provider (testes, telas isoladas): não bloqueia nada; o servidor confere. */
export const useIdentityVerification = () => useContext(IdentityVerificationContext) ?? NOOP_CONTEXT;

/** Telas em que a modal automática não abre por cima (chamadas, fila do SOS). */
const isBusyPath = (path: string) =>
  path === '/sos' ||
  path.startsWith('/emergency-call') ||
  path.startsWith('/emergency/call') ||
  path.startsWith('/consultation-call');

export const IdentityVerificationProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const { user, userType } = useAuth();
  const subscription = useOptionalSubscription();
  const legalStatus = useLegalGateStatus();
  const location = useLocation();
  const navigate = useNavigate();
  const patientUserId = user && userType === 'patient' ? user.id : null;

  const [fields, setFields] = useState<PatientIdentityFields | null>(null);
  const [promptReason, setPromptReason] = useState<IdentityPromptReason | null>(null);
  const autoShownRef = useRef<string | null>(null);

  // A primeira leitura reaproveita a da tela inicial, já pedida no login
  // (patientHomeRow); o aviso de mudança no banco pede uma nova (`fresh`).
  const load = useCallback(async (options?: { fresh?: boolean }) => {
    if (!patientUserId) {
      setFields(null);
      return;
    }
    const { data, error } = await getPatientHomeRow(patientUserId, options);
    if (error) {
      console.error('[identidade] erro ao carregar situação:', error);
      return;
    }
    setFields(data ?? null);
  }, [patientUserId]);
  const reload = useCallback(() => load({ fresh: true }), [load]);

  useEffect(() => {
    setFields(null);
    setPromptReason(null);
    autoShownRef.current = null;
    void load();
  }, [load]);

  // Aprovação/recusa do admin chega sem recarregar a página.
  useEffect(() => {
    if (!patientUserId) return;
    const channel = supabase
      .channel(`identity_${patientUserId}`)
      .on(
        'postgres_changes',
        { event: 'UPDATE', schema: 'public', table: 'patients', filter: `user_id=eq.${patientUserId}` },
        () => void load({ fresh: true }),
      )
      .subscribe();
    return () => {
      void supabase.removeChannel(channel);
    };
  }, [patientUserId, load]);

  const status = fields ? parseIdentityStatus(fields.identity_status) : null;
  const hasPaidPlan = Boolean(subscription?.hasPaidPlan);
  const subscriptionReady = subscription ? !subscription.loading : true;

  // Modal automática: primeiro login, e de novo no primeiro plano pago.
  useEffect(() => {
    if (!patientUserId || !fields || promptReason) return;
    if (!subscriptionReady || legalStatus !== 'clear') return;
    if (isBusyPath(location.pathname)) return;
    const reason = autoPromptFor(fields, hasPaidPlan);
    if (!reason) return;
    const key = `${patientUserId}:${reason}`;
    if (autoShownRef.current === key) return;
    autoShownRef.current = key;

    setPromptReason(reason);
    const marks = promptMarksFor(reason, hasPaidPlan);
    setFields((prev) => (prev ? { ...prev, ...marks } : prev));
    forgetPatientHomeRow();
    void supabase
      .from('patients')
      .update(marks)
      .eq('user_id', patientUserId)
      .then(({ error }) => {
        if (error) console.error('[identidade] erro ao marcar modal vista:', error);
      });
  }, [patientUserId, fields, promptReason, subscriptionReady, legalStatus, hasPaidPlan, location.pathname]);

  // Link da notificação de recusa: /home?identidade=1 abre a modal.
  useEffect(() => {
    if (!patientUserId) return;
    const params = new URLSearchParams(location.search);
    if (params.get('identidade') !== '1') return;
    params.delete('identidade');
    const search = params.toString();
    navigate({ pathname: location.pathname, search: search ? `?${search}` : '' }, { replace: true });
    setPromptReason('manual');
  }, [patientUserId, location.pathname, location.search, navigate]);

  const openPrompt = useCallback((reason: IdentityPromptReason = 'manual') => {
    setPromptReason(reason);
  }, []);

  const requireVerified = useCallback(
    (reason: 'sos' | 'appointment') => {
      if (!patientUserId || status === null) return true;
      if (status === 'aprovado') return true;
      setPromptReason(reason);
      return false;
    },
    [patientUserId, status],
  );

  const value = useMemo<IdentityVerificationContextType>(
    () => ({
      status,
      rejectionReason: fields?.identity_rejection_reason ?? null,
      isVerified: status === 'aprovado',
      promptOpen: promptReason !== null,
      openPrompt,
      requireVerified,
      refresh: reload,
    }),
    [status, fields?.identity_rejection_reason, promptReason, openPrompt, requireVerified, reload],
  );

  return (
    <IdentityVerificationContext.Provider value={value}>
      {children}
      {patientUserId && promptReason && status && (
        <Suspense fallback={null}>
          <IdentityVerificationModal
            open
            reason={promptReason}
            status={status}
            rejectionReason={fields?.identity_rejection_reason ?? null}
            userId={patientUserId}
            onSubmitted={reload}
            onClose={() => setPromptReason(null)}
          />
        </Suspense>
      )}
    </IdentityVerificationContext.Provider>
  );
};

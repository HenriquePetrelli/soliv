import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';
import { clearLoginState, fetchLoginState } from '@/lib/loginState';
import { isCurrentlyBlocked, notifyBlockedAccess, type BlockInfo } from '@/utils/psychologistBlock';

/** Conferência a cada 2 min (o aviso do servidor cobre o momento do bloqueio) e, no mínimo, 30 s entre duas ao voltar para o app. */
const CHECK_EVERY_MS = 2 * 60 * 1000;
const MIN_GAP_MS = 30 * 1000;

/**
 * Bloqueio feito pelo admin vale também para quem já está com o app aberto.
 * Antes só a tela de login conferia: quem estava logado continuava usando o
 * app normalmente. Confere ao abrir, ao voltar para o app, a cada 2 minutos e na
 * hora em que o admin bloqueia (aviso pelo canal account-status:<id>, enviado
 * pela edge function de bloqueio); bloqueado, mostra o motivo e o tempo e sai
 * da conta. (O servidor também suspende o login e encerra as sessões.)
 */
const AccountStatusWatcher = () => {
  const { user, userType, signOut } = useAuth();
  const lastCheckRef = useRef(0);
  const signingOutRef = useRef(false);
  // signOut muda a cada render do AuthProvider: guardado à parte para a
  // conferência não recomeçar a cada render.
  const signOutRef = useRef(signOut);
  signOutRef.current = signOut;

  useEffect(() => {
    const userId = user?.id;
    if (!userId || (userType !== 'patient' && userType !== 'psychologist')) return;
    signingOutRef.current = false;

    const check = async (force = false) => {
      if (signingOutRef.current) return;
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (!force && Date.now() - lastCheckRef.current < MIN_GAP_MS) return;
      lastCheckRef.current = Date.now();
      try {
        clearLoginState();
        const state = await fetchLoginState(userId);
        const block: BlockInfo | null =
          userType === 'patient' ? (state.patient as BlockInfo | null) : (state.psychologist as BlockInfo | null);
        if (block && isCurrentlyBlocked(block)) {
          signingOutRef.current = true;
          await notifyBlockedAccess(block);
          await signOutRef.current();
        }
      } catch {
        /* sem internet: confere na próxima vez */
      }
    };

    void check(true);
    const timer = window.setInterval(() => void check(true), CHECK_EVERY_MS);
    const onWake = () => void check();
    window.addEventListener('focus', onWake);
    document.addEventListener('visibilitychange', onWake);
    // O aviso do servidor só pede uma conferência: quem decide é o banco.
    let channel: ReturnType<typeof supabase.channel> | null = null;
    try {
      channel = supabase
        .channel(`account-status:${userId}`)
        .on('broadcast', { event: 'check' }, () => {
          lastCheckRef.current = 0;
          void check(true);
        })
        .subscribe();
    } catch {
      /* sem tempo real: as conferências periódicas continuam */
    }
    return () => {
      if (channel) void supabase.removeChannel(channel);
      window.clearInterval(timer);
      window.removeEventListener('focus', onWake);
      document.removeEventListener('visibilitychange', onWake);
    };
  }, [user?.id, userType]);

  return null;
};

export default AccountStatusWatcher;

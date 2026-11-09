import { useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { supabase } from '@/integrations/supabase/client';

/** Entre duas chamadas deste aparelho; o banco ainda limita a uma linha a cada 30 min por IP. */
const MIN_GAP_MS = 5 * 60 * 1000;

/**
 * Registro de acesso exigido pelo Marco Civil (art. 15): avisa o banco quando
 * o app abre e quando volta para a tela. O IP e a hora são tomados pelo
 * servidor; o app não envia nada além do pedido. O login em si já é
 * registrado pelo banco, sem depender daqui. Falha (sem internet) é ignorada.
 */
const AccessLogger = () => {
  const { user } = useAuth();
  const lastRef = useRef(0);

  useEffect(() => {
    if (!user?.id) return;
    lastRef.current = 0;

    const register = () => {
      if (typeof document !== 'undefined' && document.visibilityState === 'hidden') return;
      if (Date.now() - lastRef.current < MIN_GAP_MS) return;
      lastRef.current = Date.now();
      void Promise.resolve(supabase.rpc('register_access')).catch(() => {
        /* sem internet: registra na próxima vez */
      });
    };

    register();
    window.addEventListener('focus', register);
    document.addEventListener('visibilitychange', register);
    return () => {
      window.removeEventListener('focus', register);
      document.removeEventListener('visibilitychange', register);
    };
  }, [user?.id]);

  return null;
};

export default AccessLogger;

import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionUserId } from '@/lib/currentUser';

export interface ActiveEmergencyCall {
  requestId: string;
  sessionId: string;
  role: 'patient' | 'psychologist';
  startedAt: string | null;
}

const ONGOING_STATUSES = ['accepted', 'in_progress'];

/**
 * Detects an emergency call that was accepted/started and never properly
 * finished (e.g. the user closed the app or lost connection), so we can
 * offer a "return to call" shortcut on Home / Dashboard.
 */
export const useActiveEmergencyCall = () => {
  const [activeCall, setActiveCall] = useState<ActiveEmergencyCall | null>(null);
  const [loading, setLoading] = useState(true);

  const check = useCallback(async () => {
    // Roda a cada 20 s e a cada mudança em pedidos de SOS: sessão local, sem rede.
    const userId = await getSessionUserId();
    if (!userId) {
      setActiveCall(null);
      setLoading(false);
      return;
    }

    const { data, error } = await supabase
      .from('emergency_requests')
      .select('id, patient_id, accepted_by, status, video_room_id, room_url, started_at, ended_at')
      .in('status', ONGOING_STATUSES)
      .is('ended_at', null)
      .or(`patient_id.eq.${userId},accepted_by.eq.${userId}`)
      .order('created_at', { ascending: false })
      .limit(1);

    if (error) {
      console.error('Error checking active emergency call:', error);
      setLoading(false);
      return;
    }

    const row = data?.[0];
    const sessionId = row?.video_room_id || row?.room_url;

    if (row && sessionId) {
      setActiveCall({
        requestId: row.id,
        sessionId,
        role: row.patient_id === userId ? 'patient' : 'psychologist',
        startedAt: row.started_at ?? null,
      });
    } else {
      setActiveCall(null);
    }
    setLoading(false);
  }, []);

  useEffect(() => {
    let cancelled = false;
    let channel: ReturnType<typeof supabase.channel> | null = null;
    check();

    // Só os pedidos da própria pessoa (como paciente ou como psicólogo que
    // aceitou). Antes escutava todos os pedidos de SOS do app: cada SOS de
    // qualquer pessoa fazia todo mundo na tela inicial consultar o banco.
    void getSessionUserId().then((userId) => {
      if (cancelled || !userId) return;
      channel = supabase
        .channel(`active_emergency_call_${userId}_${Math.random().toString(36).slice(2)}`)
        .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_requests', filter: `patient_id=eq.${userId}` }, () => check())
        .on('postgres_changes', { event: '*', schema: 'public', table: 'emergency_requests', filter: `accepted_by=eq.${userId}` }, () => check())
        .subscribe();
    });

    // Rede de segurança caso o tempo real caia (só com a tela visível).
    const interval = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') void check();
    }, 60000);

    return () => {
      cancelled = true;
      window.clearInterval(interval);
      if (channel) supabase.removeChannel(channel);
    };
  }, [check]);

  return { activeCall, loading, refresh: check };
};

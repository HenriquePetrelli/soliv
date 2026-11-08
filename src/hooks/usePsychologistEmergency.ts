import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionUser } from '@/lib/currentUser';
import { useToast } from '@/hooks/use-toast';
import { getFunctionErrorMessage } from '@/utils/errorMessage';
import { findPsychologistOngoingCall } from '@/lib/emergencyCallGuard';
import { notifySosQueueChanged, subscribeSosQueue } from '@/lib/sosQueueChannel';
import { isPriorityTriage } from '@/lib/sosTriage';


interface EmergencyRequest {
  id: string;
  patient_id: string;
  status: string;
  created_at: string;
  accepted_by: string | null;
  accepted_at: string | null;
  /** Triagem opcional do paciente (chaves de src/lib/sosTriage.ts). */
  triage?: string[] | null;
  /** 'text' = SOS por mensagem (o paciente não pode falar agora). */
  channel?: string | null;
  patient: {
    full_name: string;
  };
}

export const usePsychologistEmergency = () => {
  const [emergencyRequests, setEmergencyRequests] = useState<EmergencyRequest[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Fetch emergency requests. `silent` avoids skeleton flicker on background refreshes.
  const fetchEmergencyRequests = async (silent = false) => {
    try {
      if (!silent) setLoading(true);
      // Uma consulta no banco (list_open_emergency_requests). Antes era a edge
      // function psychologist-emergency a cada 10 s por psicólogo: com muitos
      // psicólogos online, a cota mensal de funções acabava em horas.
      const { data, error } = await supabase.rpc('list_open_emergency_requests');

      if (error) throw error;

      const list = ((data as unknown as EmergencyRequest[] | null) ?? []).slice();
      // Risco marcado na triagem (suicídio, perigo) vai para a frente da fila;
      // dentro de cada grupo, o pedido mais antigo primeiro.
      list.sort((a, b) => {
        const pa = isPriorityTriage(a.triage) ? 0 : 1;
        const pb = isPriorityTriage(b.triage) ? 0 : 1;
        return pa - pb || new Date(a.created_at).getTime() - new Date(b.created_at).getTime();
      });
      setEmergencyRequests(list);
    } catch (error: any) {
      console.error('Error fetching emergency requests:', error);
      if (!silent) {
        toast({
          title: 'Erro',
          description: 'Erro ao carregar solicitações de emergência',
          variant: 'destructive',
        });
      }
    } finally {
      if (!silent) setLoading(false);
    }
  };


  // Accept emergency request
  const acceptEmergencyRequest = async (requestId: string) => {
    try {
      console.log('🔄 Accepting emergency request:', requestId);

      // Guard: a psychologist can only attend one emergency call at a time.
      const { data: authCheck } = await getSessionUser();
      const myId = authCheck.user?.id;
      if (myId) {
        const ongoing = await findPsychologistOngoingCall(myId);
        if (ongoing && ongoing.id !== requestId) {
          toast({
            title: 'Chamada em andamento',
            description: 'Finalize a chamada de emergência atual antes de aceitar outra.',
            variant: 'destructive',
          });
          return null;
        }
      }
      
      // Accept the emergency request using PUT method
      const { data, error } = await supabase.functions.invoke('psychologist-emergency', {
        method: 'PUT',
        body: {
          requestId,
          action: 'accept'
        }
      });

      console.log('📋 Response from psychologist-emergency:', { data, error });

      if (error) {
        console.error('❌ Error from psychologist-emergency:', error);
        throw error;
      }

      // Check for specific error codes from the function
      if (data && !data.success) {
        let errorMessage = data.error || 'Erro ao aceitar solicitação';
        
        switch (data.code) {
          case 'REQUEST_NOT_FOUND':
            errorMessage = 'Esta solicitação foi cancelada pelo paciente';
            break;
          case 'REQUEST_NOT_AVAILABLE':
            // Regra do banco com o motivo certo (expirou, outro SOS em andamento,
            // em consulta agora); antes sempre dizia "aceita por outro psicólogo".
            errorMessage = data.error || 'Esta solicitação não está mais disponível';
            break;
          case 'REQUEST_ALREADY_TAKEN':
            errorMessage = 'Outro psicólogo já aceitou esta solicitação';
            break;
          case 'REQUEST_UNAVAILABLE':
            errorMessage = 'Esta solicitação não está mais disponível';
            break;
        }
        
        toast({
          title: 'Informação',
          description: errorMessage,
          variant: 'destructive',
        });
        
        // Refresh the list to show current state
        fetchEmergencyRequests();
        return null;
      }

      // Show success message
      if (data && data.message) {
        toast({
          title: 'Sucesso',
          description: data.message,
        });
      }

      // Increment accepted counter for current psychologist
      const { data: authUser } = await getSessionUser();
      const currentUserId = authUser.user?.id;
      if (currentUserId) {
        await supabase.rpc('increment_emergency_accepted', { p_psychologist_id: currentUserId });
      }

      // Check if session_id was returned from psychologist-emergency function
      if (data && data.session_id) {
        console.log('✅ Session ID received from psychologist-emergency:', data.session_id);
        
        // Refresh the list
        fetchEmergencyRequests();
        notifySosQueueChanged({ requestId });
        
        return {
          emergency_request: data.emergency_request,
          session_id: data.session_id
        };
      }

      // If no session_id in response, this is an error since psychologist-emergency should create it
      if (!data || !data.session_id) {
        console.error('❌ No session_id returned from psychologist-emergency');
        console.log('📋 Full response data:', data);
        throw new Error('Falha ao obter ID da sessão - tente novamente');
      }
    } catch (error: any) {
      console.error('❌ Error accepting emergency request:', error);
      toast({
        title: 'Erro',
        // A função responde 409 com o motivo no corpo (ex.: "Você está em uma consulta agora").
        description: await getFunctionErrorMessage(error, 'Erro ao aceitar solicitação'),
        variant: 'destructive',
      });
      throw error;
    }
  };

  // Decline emergency request
  const declineEmergencyRequest = async (requestId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('psychologist-emergency', {
        method: 'PUT',
        body: {
          requestId,
          action: 'decline'
        }
      });

      if (error) throw error;

      toast({
        title: 'Informação',
        description: data.message,
      });

      // Increment rejected counter for current psychologist
      const { data: authUser } = await getSessionUser();
      const currentUserId = authUser.user?.id;
      if (currentUserId) {
        await supabase.rpc('increment_emergency_rejected', { p_psychologist_id: currentUserId });
      }

      // Refresh the list
      fetchEmergencyRequests();
      notifySosQueueChanged({ requestId });
    } catch (error: any) {
      console.error('Error declining emergency request:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao recusar solicitação',
        variant: 'destructive',
      });
    }
  };

  // Vários eventos seguidos (um SOS muda de estado algumas vezes em segundos)
  // viram uma consulta só.
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const scheduleRefresh = () => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      void fetchEmergencyRequests(true);
    }, 800);
  };

  // Set up real-time subscription for emergency requests
  useEffect(() => {
    // Initial fetch
    fetchEmergencyRequests();

    // Subscribe to real-time changes
    const channel = supabase
      .channel(`emergency-requests-changes-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'emergency_requests'
        },
        () => scheduleRefresh()
      )
      .subscribe();

    // RLS hides cancelled/accepted rows from this psychologist, so the postgres
    // event never arrives. The broadcast bus + a short poll keep the list honest.
    const unsubscribeQueue = subscribeSosQueue(scheduleRefresh);
    // Rede de segurança caso o tempo real caia; com a aba escondida, não consulta.
    const poll = window.setInterval(() => {
      if (typeof document === 'undefined' || document.visibilityState === 'visible') scheduleRefresh();
    }, 20_000);


    return () => {
      supabase.removeChannel(channel);
      unsubscribeQueue();
      window.clearInterval(poll);
      if (refreshTimer.current) clearTimeout(refreshTimer.current);
    };
  }, []);


  return {
    emergencyRequests,
    loading,
    acceptEmergencyRequest,
    declineEmergencyRequest,
    fetchEmergencyRequests
  };
};
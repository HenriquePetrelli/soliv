import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionUser } from '@/lib/currentUser';
import { useToast } from '@/hooks/use-toast';
import { getFunctionErrorMessage } from '@/utils/errorMessage';

export interface Appointment {
  id: string;
  scheduled_at: string;
  status: string;
  appointment_type: string;
  duration?: number;
  notes?: string;
  session_summary?: string;
  rating?: number;
  proposed_scheduled_at?: string;
  proposal_notes?: string;
  /** Sala de vídeo da consulta (também é o id da avaliação em session_feedback). */
  video_room_id?: string | null;
  psychologist: {
    full_name: string;
    specialty?: string;
    specialization?: string;
    professional_email?: string;
  };
}

export interface Psychologist {
  user_id: string;
  full_name: string;
  specialty?: string;
}

export const useAppointments = () => {
  const [appointments, setAppointments] = useState<Appointment[]>([]);
  const [psychologists, setPsychologists] = useState<Psychologist[]>([]);
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  const fetchAppointments = async () => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.functions.invoke('appointments', {
        method: 'GET'
      });
      
      if (error) throw error;
      
      setAppointments(data || []);
    } catch (error: unknown) {
      console.error('Error fetching appointments:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar consultas',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPsychologists = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('appointments?action=psychologists', {
        method: 'GET'
      });
      
      if (error) throw error;
      
      if (data) {
        setPsychologists(data || []);
        return;
      }
      
      // Fallback: get directly from psychologists table
      const { data: psychologistsData } = await supabase
        .from('psychologists')
        .select('user_id, full_name, specialization')
        .eq('approved', true)
        .eq('approval_status', 'approved');
        
      setPsychologists(psychologistsData?.map(p => ({
        user_id: p.user_id,
        full_name: p.full_name,
        specialty: p.specialization
      })) || []);
    } catch (error: unknown) {
      console.error('Error fetching psychologists:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar psicólogos',
        variant: 'destructive',
      });
    }
  };

  const createAppointment = async (
    psychologist_id: string, 
    scheduled_at: string, 
    duration = 60,
    type = 'regular',
    notes?: string,
    /** Id do pedido gerado no aparelho: tentar de novo não cria outro nem gasta a cota. */
    requestId?: string,
  ) => {
    try {
      setLoading(true);
      const { data, error } = await supabase.functions.invoke('appointments', {
        body: {
          psychologist_id,
          scheduled_at,
          duration,
          appointment_type: type,
          notes,
          ...(requestId ? { request_id: requestId } : {}),
        },
      });
      
      if (error) throw error;

      // O aviso de sucesso (com a data) fica com a tela de agendamento.
      await fetchAppointments();
      return data.appointment;
    } catch (error: unknown) {
      console.error('Error creating appointment:', error);
      toast({
        title: 'Erro',
        description: await getFunctionErrorMessage(error, 'Não foi possível agendar a consulta.'),
        variant: 'destructive',
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const fetchAppointmentHistory = async (page = 1, limit = 10) => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase.functions.invoke(`appointments?action=history&page=${page}&limit=${limit}`, {
        method: 'GET'
      });
      
      if (!error && data) {
        return data || [];
      }
      
      // Fallback: get directly from appointments table
      const { data: appointmentsData, error: appointmentsError } = await supabase
        .from('appointments')
        .select(`
          *,
          psychologists!psychologist_id(
            full_name, 
            specialization
          )
        `)
        .eq('patient_id', (await getSessionUser()).data.user?.id)
        .order('scheduled_at', { ascending: false })
        .range((page - 1) * limit, page * limit - 1);
      
      if (appointmentsError) throw appointmentsError;

      // Mesmo formato da edge function (psychologist no singular).
      return (appointmentsData || []).map((appointment) => {
        const savedName = (appointment as { psychologist_name?: string | null }).psychologist_name;
        return {
          ...appointment,
          // Psicólogo excluído: a consulta fica no histórico com o nome guardado.
          psychologist:
            (Array.isArray(appointment.psychologists) ? appointment.psychologists[0] : appointment.psychologists) ??
            (savedName ? { full_name: savedName, specialization: null } : null),
        };
      });
    } catch (error: unknown) {
      console.error('Error fetching appointment history:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar histórico',
        variant: 'destructive',
      });
      return [];
    } finally {
      setLoading(false);
    }
  };

  const respondToReschedule = async (appointmentId: string, accept: boolean) => {
    try {
      setLoading(true);
      const status = accept ? 'scheduled' : 'declined';
      
      const { data, error } = await supabase.functions.invoke('psychologist-schedule', {
        method: 'PUT',
        body: {
          appointmentId,
          status,
          action: 'respond_reschedule'
        }
      });
      
      if (error) throw error;
      
      toast({
        title: accept ? 'Reagendamento aceito' : 'Reagendamento recusado',
        description: data.message,
      });
      
      await fetchAppointments();
      return data.appointment;
    } catch (error: unknown) {
      console.error('Error responding to reschedule:', error);
      toast({
        title: 'Erro',
        description: await getFunctionErrorMessage(error, 'Não foi possível responder ao reagendamento.'),
        variant: 'destructive',
      });
      throw error;
    } finally {
      setLoading(false);
    }
  };

  const acceptRescheduleProposal = async (appointmentId: string) => {
    return respondToReschedule(appointmentId, true);
  };

  const declineRescheduleProposal = async (appointmentId: string) => {
    return respondToReschedule(appointmentId, false);
  };

  useEffect(() => {
    fetchAppointments();
    fetchPsychologists();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, []);

  return {
    appointments,
    psychologists,
    loading,
    fetchAppointments,
    fetchPsychologists,
    createAppointment,
    fetchAppointmentHistory,
    acceptRescheduleProposal,
    declineRescheduleProposal,
  };
};
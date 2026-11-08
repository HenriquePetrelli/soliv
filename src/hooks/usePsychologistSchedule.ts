import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionUser } from '@/lib/currentUser';
import { useToast } from '@/hooks/use-toast';
import { getFunctionErrorMessage } from '@/utils/errorMessage';

interface PatientInfo {
  full_name: string;
}

export interface Appointment {
  id: string;
  patient_id: string;
  psychologist_id: string;
  scheduled_at: string;
  status: string;
  appointment_type: string;
  duration?: number | null;
  notes?: string;
  session_summary?: string;
  created_at: string;
  updated_at: string;
  patient: PatientInfo;
}

interface AppointmentHistoryResponse {
  appointments: Appointment[];
  totalCount: number;
  currentPage: number;
  totalPages: number;
}

export const usePsychologistSchedule = () => {
  const [todayAppointments, setTodayAppointments] = useState<Appointment[]>([]);
  const [upcomingAppointments, setUpcomingAppointments] = useState<Appointment[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  // Fetch today's appointments
  const fetchTodayAppointments = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('psychologist-schedule', {
        method: 'GET'
      });

      if (error) throw error;

      const { data: { user } } = await getSessionUser();
      const filtered = ((data || []) as Appointment[]).filter((a) => a.psychologist_id === user?.id);
      setTodayAppointments(filtered);
    } catch (error: unknown) {
      console.error('Error fetching today\'s appointments:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar consultas de hoje',
        variant: 'destructive',
      });
    }
  };

  // Fetch pending appointments (awaiting psychologist confirmation)
  const fetchPendingAppointments = async (): Promise<Appointment[]> => {
    try {
      const { data, error } = await supabase.functions.invoke('psychologist-schedule?action=pending', {
        method: 'GET'
      });

      if (error) throw error;

      return data || [];
    } catch (error: unknown) {
      console.error('Error fetching pending appointments:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar consultas pendentes',
        variant: 'destructive',
      });
      return [];
    }
  };

  // Fetch upcoming appointments (next 7 days)
  const fetchUpcomingAppointments = async () => {
    try {
      const { data, error } = await supabase.functions.invoke('psychologist-schedule?action=upcoming', {
        method: 'GET'
      });

      if (error) throw error;

      const { data: { user } } = await getSessionUser();
      const filtered = ((data || []) as Appointment[]).filter((a) => a.psychologist_id === user?.id);
      setUpcomingAppointments(filtered);
    } catch (error: unknown) {
      console.error('Error fetching upcoming appointments:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar próximas consultas',
        variant: 'destructive',
      });
    }
  };

  // Fetch appointment history with pagination
  const fetchAppointmentHistory = async (page = 1, limit = 10): Promise<AppointmentHistoryResponse | null> => {
    try {
      const { data, error } = await supabase.functions.invoke(`psychologist-schedule?action=history&page=${page}&limit=${limit}`, {
        method: 'GET'
      });

      if (error) throw error;

      return data as AppointmentHistoryResponse;
    } catch (error: unknown) {
      console.error('Error fetching appointment history:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar histórico de consultas',
        variant: 'destructive',
      });
      return null;
    }
  };

  // Update appointment status or add session summary
  const updateAppointment = async (appointmentId: string, updates: { status?: string; sessionSummary?: string }) => {
    try {
      const { data, error } = await supabase.functions.invoke('psychologist-schedule', {
        method: 'PUT',
        body: {
          appointmentId,
          status: updates.status,
          sessionSummary: updates.sessionSummary
        }
      });

      if (error) throw error;

      toast({ title: data.message || 'Consulta atualizada' });

      // Refresh appointments
      fetchTodayAppointments();
      fetchUpcomingAppointments();
      
      return data.appointment;
    } catch (error: unknown) {
      console.error('Error updating appointment:', error);
      toast({
        title: 'Erro',
        description: await getFunctionErrorMessage(error, 'Erro ao atualizar consulta'),
        variant: 'destructive',
      });
      throw error;
    }
  };

  // Accept appointment (change from pending to scheduled)
  const acceptAppointment = async (appointmentId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('psychologist-schedule', {
        method: 'PUT',
        body: {
          appointmentId,
          status: 'scheduled'
        }
      });

      if (error) throw error;

      toast({ title: 'Consulta confirmada' });

      // Refresh appointments
      fetchTodayAppointments();
      fetchUpcomingAppointments();
      
      return data.appointment;
    } catch (error: unknown) {
      console.error('Error accepting appointment:', error);
      toast({
        title: 'Erro',
        description: await getFunctionErrorMessage(error, 'Erro ao confirmar consulta'),
        variant: 'destructive',
      });
      throw error;
    }
  };

  // Decline appointment (change from pending to declined)
  const declineAppointment = async (appointmentId: string) => {
    try {
      const { data, error } = await supabase.functions.invoke('psychologist-schedule', {
        method: 'PUT',
        body: {
          appointmentId,
          status: 'declined'
        }
      });

      if (error) throw error;

      toast({ title: 'Consulta recusada' });

      // Refresh appointments
      fetchTodayAppointments();
      fetchUpcomingAppointments();
      
      return data.appointment;
    } catch (error: unknown) {
      console.error('Error declining appointment:', error);
      toast({
        title: 'Erro',
        description: await getFunctionErrorMessage(error, 'Erro ao recusar consulta'),
        variant: 'destructive',
      });
      throw error;
    }
  };

  useEffect(() => {
    const loadData = async () => {
      setLoading(true);
      await Promise.all([
        fetchTodayAppointments(),
        fetchUpcomingAppointments()
      ]);
      setLoading(false);
    };

    loadData();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, []);

  return {
    todayAppointments,
    upcomingAppointments,
    loading,
    fetchTodayAppointments,
    fetchUpcomingAppointments,
    fetchPendingAppointments,
    fetchAppointmentHistory,
    updateAppointment,
    acceptAppointment,
    declineAppointment
  };
};
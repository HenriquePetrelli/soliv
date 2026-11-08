import { useState, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import { Appointment } from '@/hooks/useAppointments';
import { canJoinConsultation } from '@/lib/consultationWindow';

export const useAppointmentVideoCall = () => {
  const [loading, setLoading] = useState(false);
  const { toast } = useToast();

  // Opens 10 min before the start and stays open until 15 min after the
  // end, including while in_progress so a dropped participant can rejoin.
  const canJoinCall = useCallback((appointment: Appointment): boolean => canJoinConsultation(appointment), []);

  const startConsultation = useCallback(async (appointmentId: string) => {
    try {
      setLoading(true);
      
      const { data, error } = await supabase
        .from('appointments')
        .update({ status: 'in_progress' })
        .eq('id', appointmentId)
        .select()
        .single();

      if (error) throw error;

      return data;
    } catch (error: unknown) {
      console.error('Error starting consultation:', error);
      toast({
        title: 'Erro',
        description: getFriendlyErrorMessage(error, 'Não foi possível iniciar a consulta.'),
        variant: 'destructive',
      });
      throw error;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  const endConsultation = useCallback(async (appointmentId: string) => {
    try {
      setLoading(true);
      
      // Session summary is added later by the psychologist from ConsultationHistory,
      // not captured at end-of-call time.
      // Só consultas ainda abertas: se o outro lado já marcou como interrompida
      // (ou a rotina já fechou), não há o que concluir e não é erro.
      const { data, error } = await supabase
        .from('appointments')
        .update({ status: 'completed' })
        .eq('id', appointmentId)
        .eq('status', 'in_progress')
        .select()
        .maybeSingle();

      if (error) throw error;
      if (!data) return null;

      // A consulta só conta com pelo menos 5 minutos de chamada com os dois
      // conectados; antes disso o banco a mantém em andamento (dá para voltar
      // até o fim do horário) e a rotina fecha como interrompida ou não
      // realizada, devolvendo a consulta do mês ao paciente.
      if (data?.status === 'completed') {
        toast({ title: 'Consulta finalizada' });
      } else {
        toast({
          title: 'Você saiu da sala',
          description: 'A consulta só conta depois de 5 minutos de chamada com os dois conectados. Ela continua aberta até o fim do horário; se não continuar, a consulta do mês volta para o paciente e ela não entra no repasse.',
        });
      }

      return data;
    } catch (error: unknown) {
      console.error('Error ending consultation:', error);
      toast({
        title: 'Erro',
        description: getFriendlyErrorMessage(error, 'Não foi possível finalizar a consulta.'),
        variant: 'destructive',
      });
      throw error;
    } finally {
      setLoading(false);
    }
  }, [toast]);

  return {
    loading,
    canJoinCall,
    startConsultation,
    endConsultation,
  };
};
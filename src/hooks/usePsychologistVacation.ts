import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';

export interface VacationPeriod {
  id: string;
  /** "YYYY-MM-DD" */
  start_date: string;
  /** "YYYY-MM-DD" */
  end_date: string;
}

/** Consulta marcada que cai num período de férias. */
export interface VacationConflict {
  id: string;
  starts_at: string;
  status: string;
  patient_name: string | null;
}

export const toISODate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/** "YYYY-MM-DD" → "DD/MM/YYYY". */
export const formatBR = (isoDate: string): string => {
  const [y, m, d] = isoDate.split('-');
  return `${d}/${m}/${y}`;
};

/**
 * Períodos de férias (intervalo de datas totalmente indisponível) do
 * psicólogo logado. O horário-padrão e as exceções pontuais continuam
 * salvos normalmente — férias só "desliga" a agenda nesse intervalo.
 */
export const usePsychologistVacation = () => {
  const { user } = useAuth();
  const [vacations, setVacations] = useState<VacationPeriod[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchVacations = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('psychologist_vacations')
        .select('id, start_date, end_date')
        .eq('psychologist_id', user.id)
        .order('start_date', { ascending: true });

      if (error) throw error;
      setVacations(data ?? []);
    } catch (error) {
      console.error('Erro ao carregar férias:', error);
      toast({ title: 'Erro', description: 'Erro ao carregar suas férias', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    void fetchVacations();
  }, [fetchVacations]);

  const today = toISODate(new Date());
  const activeVacation = vacations.find((v) => v.start_date <= today && today <= v.end_date) ?? null;
  const upcomingVacation = vacations.find((v) => v.start_date > today) ?? null;

  /** Consultas marcadas que caem no período (para o psicólogo decidir antes de confirmar). */
  const checkConflicts = useCallback(async (startDate: string, endDate: string): Promise<VacationConflict[]> => {
    if (!user || !startDate || !endDate || startDate > endDate) return [];
    const { data, error } = await supabase.rpc('vacation_conflicts' as never, { p_start: startDate, p_end: endDate } as never);
    if (error) {
      console.error('Erro ao conferir consultas do período:', error);
      return [];
    }
    return (data as unknown as VacationConflict[] | null) ?? [];
  }, [user]);

  /**
   * Agenda um novo período de férias, substituindo qualquer férias ativa/futura
   * ainda não encerrada, numa operação só no servidor. Com
   * `cancelAppointments`, as consultas do período são canceladas e os
   * pacientes avisados (a consulta do mês volta para eles).
   */
  const setVacation = async (startDate: string, endDate: string, cancelAppointments = false): Promise<boolean> => {
    if (!user) return false;
    if (!startDate || !endDate || startDate > endDate) {
      toast({
        title: 'Datas inválidas',
        description: 'A data de início deve ser antes ou igual à data de término.',
        variant: 'destructive',
      });
      return false;
    }
    setSaving(true);
    try {
      const { data, error } = await supabase.rpc('set_psychologist_vacation' as never, {
        p_start: startDate,
        p_end: endDate,
        p_cancel_appointments: cancelAppointments,
      } as never);
      if (error) throw error;

      const cancelled = Number((data as { cancelled?: number } | null)?.cancelled ?? 0);
      toast({
        title: 'Férias agendadas',
        description:
          cancelled > 0
            ? `Sua agenda ficará indisponível nesse período. ${cancelled === 1 ? '1 consulta foi cancelada' : `${cancelled} consultas foram canceladas`} e os pacientes foram avisados.`
            : 'Sua agenda ficará indisponível nesse período.',
      });
      await fetchVacations();
      return true;
    } catch (error: unknown) {
      console.error('Erro ao salvar férias:', error);
      toast({
        title: 'Erro ao salvar',
        description: getFriendlyErrorMessage(error, 'Não foi possível salvar suas férias. Tente novamente.'),
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  /** Cancela a férias ativa ou futura (a que ainda não terminou). Não mexe em férias já passadas. */
  const cancelVacation = async (): Promise<boolean> => {
    if (!user) return false;
    const staleIds = vacations.filter((v) => v.end_date >= today).map((v) => v.id);
    if (staleIds.length === 0) return true;

    setSaving(true);
    try {
      const { error } = await supabase.from('psychologist_vacations').delete().in('id', staleIds);
      if (error) throw error;

      toast({ title: 'Férias canceladas', description: 'Sua agenda voltou ao normal.' });
      await fetchVacations();
      return true;
    } catch (error: unknown) {
      console.error('Erro ao cancelar férias:', error);
      toast({
        title: 'Erro',
        description: getFriendlyErrorMessage(error, 'Não foi possível cancelar as férias. Tente novamente.'),
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return {
    vacations,
    activeVacation,
    upcomingVacation,
    loading,
    saving,
    setVacation,
    checkConflicts,
    cancelVacation,
    refetch: fetchVacations,
  };
};

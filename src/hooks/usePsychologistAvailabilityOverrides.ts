import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import type { OverrideType } from '@/lib/psychologistAvailability';

export interface AvailabilityOverrideRow {
  id: string;
  /** "YYYY-MM-DD" */
  date: string;
  /** "HH:MM" */
  start_time: string;
  /** "HH:MM" */
  end_time: string;
  type: OverrideType;
}

/** Exceções pontuais (bloqueio/abertura) do psicólogo logado, dentro de um intervalo de datas. */
export const usePsychologistAvailabilityOverrides = (startDate: string, endDate: string) => {
  const { user } = useAuth();
  const [overrides, setOverrides] = useState<AvailabilityOverrideRow[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchOverrides = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('psychologist_availability_overrides')
        .select('id, date, start_time, end_time, type')
        .eq('psychologist_id', user.id)
        .gte('date', startDate)
        .lte('date', endDate)
        .order('date', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;

      setOverrides(
        (data ?? []).map((row) => ({
          id: row.id,
          date: row.date,
          start_time: row.start_time.slice(0, 5),
          end_time: row.end_time.slice(0, 5),
          type: row.type as OverrideType,
        }))
      );
    } catch (error) {
      console.error('Erro ao carregar exceções de agenda:', error);
      toast({ title: 'Erro', description: 'Erro ao carregar exceções da semana', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, startDate, endDate, toast]);

  useEffect(() => {
    void fetchOverrides();
  }, [fetchOverrides]);

  const addOverride = async (entry: {
    date: string;
    start_time: string;
    end_time: string;
    type: OverrideType;
  }): Promise<boolean> => {
    if (!user) return false;
    try {
      const { error } = await supabase
        .from('psychologist_availability_overrides')
        .insert({ psychologist_id: user.id, ...entry });
      if (error) throw error;
      await fetchOverrides();
      return true;
    } catch (error: unknown) {
      console.error('Erro ao adicionar exceção:', error);
      toast({
        title: 'Erro ao salvar',
        description: getFriendlyErrorMessage(error, 'Não foi possível salvar essa exceção. Tente novamente.'),
        variant: 'destructive',
      });
      return false;
    }
  };

  const removeOverride = async (id: string): Promise<boolean> => {
    try {
      const { error } = await supabase.from('psychologist_availability_overrides').delete().eq('id', id);
      if (error) throw error;
      setOverrides((prev) => prev.filter((o) => o.id !== id));
      return true;
    } catch (error: unknown) {
      console.error('Erro ao remover exceção:', error);
      toast({
        title: 'Erro ao remover',
        description: getFriendlyErrorMessage(error, 'Não foi possível remover essa exceção. Tente novamente.'),
        variant: 'destructive',
      });
      return false;
    }
  };

  /** Aplica várias adições/remoções de uma vez (ex.: vários cliques na grade
   * de horários) e só recarrega no final, em vez de um round-trip por clique. */
  const applyChanges = async (
    toAdd: Array<{ date: string; start_time: string; end_time: string; type: OverrideType }>,
    toRemoveIds: string[]
  ): Promise<boolean> => {
    if (!user) return false;
    try {
      if (toRemoveIds.length > 0) {
        const { error } = await supabase
          .from('psychologist_availability_overrides')
          .delete()
          .in('id', toRemoveIds);
        if (error) throw error;
      }
      if (toAdd.length > 0) {
        const { error } = await supabase
          .from('psychologist_availability_overrides')
          .insert(toAdd.map((entry) => ({ psychologist_id: user.id, ...entry })));
        if (error) throw error;
      }
      await fetchOverrides();
      return true;
    } catch (error: unknown) {
      console.error('Erro ao salvar exceções da semana:', error);
      toast({
        title: 'Erro ao salvar',
        description: getFriendlyErrorMessage(error, 'Não foi possível salvar as alterações da semana. Tente novamente.'),
        variant: 'destructive',
      });
      return false;
    }
  };

  return { overrides, loading, addOverride, removeOverride, applyChanges, refetch: fetchOverrides };
};

import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { usePatientStatistics } from '@/hooks/usePatientStatistics';

const toISODate = (date: Date): string =>
  `${date.getFullYear()}-${String(date.getMonth() + 1).padStart(2, '0')}-${String(date.getDate()).padStart(2, '0')}`;

/**
 * Registra o check-in de humor do dia (`log_mood`): a entrada do dia em
 * `patient_mood_logs` (gráfico) e o agregado em `patients` (tela inicial),
 * juntos no servidor. Também conta para as metas da semana "humor".
 */
export const useMoodLog = () => {
  const { user } = useAuth();
  const { toast } = useToast();
  const { addActivity } = usePatientStatistics();
  const [saving, setSaving] = useState(false);

  const logMood = async (value: number): Promise<boolean> => {
    if (!user) return false;
    setSaving(true);
    try {
      // Numa operação só no servidor: grava o dia do gráfico e a média. Mudar
      // o humor no mesmo dia troca o valor (não conta outro dia).
      const { data, error } = await supabase.rpc('log_mood' as never, {
        p_value: value,
        p_local_date: toISODate(new Date()),
      } as never);
      if (error) throw error;

      // Conta para a meta "humor" e entra no histórico só no primeiro do dia.
      if ((data as { first_today?: boolean } | null)?.first_today !== false) {
        await addActivity('Registro de Humor');
      }
      return true;
    } catch (error: unknown) {
      console.error('Erro ao registrar humor:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar seu humor. Tente novamente.',
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { logMood, saving };
};

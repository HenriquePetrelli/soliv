import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { Json } from '@/integrations/supabase/types';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';

export interface AvailabilityBlock {
  day_of_week: number;
  /** "HH:MM" */
  start_time: string;
  /** "HH:MM" */
  end_time: string;
}

/** Weekly schedule management for the logged-in psychologist. */
export const usePsychologistAvailability = () => {
  const { user } = useAuth();
  const [blocks, setBlocks] = useState<AvailabilityBlock[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);
  const { toast } = useToast();

  const fetchAvailability = useCallback(async () => {
    if (!user) return;
    setLoading(true);
    try {
      const { data, error } = await supabase
        .from('psychologist_availability')
        .select('day_of_week, start_time, end_time')
        .eq('psychologist_id', user.id)
        .order('day_of_week', { ascending: true })
        .order('start_time', { ascending: true });

      if (error) throw error;

      setBlocks(
        (data ?? []).map((row) => ({
          day_of_week: row.day_of_week,
          start_time: row.start_time.slice(0, 5),
          end_time: row.end_time.slice(0, 5),
        }))
      );
    } catch (error) {
      console.error('Erro ao carregar disponibilidade:', error);
      toast({ title: 'Erro', description: 'Erro ao carregar sua agenda', variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  }, [user, toast]);

  useEffect(() => {
    void fetchAvailability();
  }, [fetchAvailability]);

  const save = async (nextBlocks: AvailabilityBlock[]): Promise<boolean> => {
    setSaving(true);
    try {
      const { error } = await supabase.rpc('set_psychologist_availability', {
        p_blocks: nextBlocks as unknown as Json,
      });
      if (error) throw error;

      toast({ title: 'Agenda salva', description: 'Sua disponibilidade semanal foi atualizada.' });
      await fetchAvailability();
      return true;
    } catch (error: unknown) {
      console.error('Erro ao salvar disponibilidade:', error);
      toast({
        title: 'Erro ao salvar',
        description: getFriendlyErrorMessage(error, 'Não foi possível salvar sua agenda. Tente novamente.'),
        variant: 'destructive',
      });
      return false;
    } finally {
      setSaving(false);
    }
  };

  return { blocks, loading, saving, save, refetch: fetchAvailability };
};

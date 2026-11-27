import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { recordGoalActivity } from './useWeeklyGoals';

interface Activity {
  name: string;
  date: string;
}

interface PatientStatistics {
  recent_activities: Activity[];
  total_scheduled_consultations: number;
  total_emergency_consultations: number;
  total_guided_breathing_time: number;
  total_therapeutic_sound_time: number;
  streak_days: number;
  last_active_date: string | null;
}

/**
 * `load: false` para quem só registra atividades (addActivity,
 * updateActivityTime) e não mostra os números: a tela inicial, por exemplo,
 * pedia as estatísticas duas vezes a cada abertura sem usar nenhuma.
 */
export const usePatientStatistics = ({ load = true }: { load?: boolean } = {}) => {
  const { user } = useAuth();
  const [recentActivities, setRecentActivities] = useState<Activity[]>([]);
  const [statistics, setStatistics] = useState<Omit<PatientStatistics, 'recent_activities'> | null>(null);
  const [loading, setLoading] = useState(true);

  const fetchStatistics = useCallback(async () => {
    if (!user) return;

    try {
      setLoading(true);
      const { data, error } = await supabase
        .from('patient_statistics')
        .select('*')
        .eq('patient_id', user.id)
        .maybeSingle();

      if (error) throw error;

      if (data) {
        if (data.recent_activities) {
          const activities = (data.recent_activities as unknown) as Activity[];
          setRecentActivities(activities);
        }
        
        setStatistics({
          total_scheduled_consultations: data.total_scheduled_consultations || 0,
          total_emergency_consultations: data.total_emergency_consultations || 0,
          total_guided_breathing_time: data.total_guided_breathing_time || 0,
          total_therapeutic_sound_time: data.total_therapeutic_sound_time || 0,
          streak_days: data.streak_days || 0,
          last_active_date: data.last_active_date || null,
        });
      }
    } catch (error) {
      console.error('Error fetching patient statistics:', error);
    } finally {
      setLoading(false);
    }
  }, [user]);

  const addActivity = useCallback(async (activityName: string) => {
    if (!user) return;

    try {
      const activityDate = new Date().toISOString();
      
      // Add to recent activities (last 5)
      const { error: recentError } = await supabase.rpc('add_patient_activity', {
        p_patient_id: user.id,
        p_activity_name: activityName,
        p_activity_date: activityDate
      });

      if (recentError) throw recentError;

      // Add to quarterly activities (last 3 months)
      const { error: quarterlyError } = await supabase.rpc('add_quarterly_activity', {
        p_patient_id: user.id,
        p_activity_name: activityName,
        p_activity_date: activityDate
      });

      if (quarterlyError) throw quarterlyError;

      // Check and update weekly goals based on activity. Matched by prefix
      // (not exact equality) because several callers append details to the
      // name (e.g. "Sons Terapêuticos: Chuva"), and the values here are the
      // real `weekly_goals.category` keys seeded in the database — not the
      // Portuguese display labels a category could easily be mistaken for.
      const categoryRules: Array<{ prefix: string; category: string }> = [
        { prefix: 'Respiração Guiada', category: 'breathing' },
        { prefix: 'Sons Terapêuticos', category: 'sound' },
        { prefix: 'Registro de Humor', category: 'mood' },
        { prefix: 'Diário Privado', category: 'journal' },
        { prefix: 'Grupo de Apoio', category: 'support_group' },
        { prefix: 'Consulta com Psicólogo', category: 'appointment' },
        { prefix: 'Consulta Agendada', category: 'appointment' },
      ];

      const rule = categoryRules.find((r) => activityName.startsWith(r.prefix));
      if (rule) {
        await recordGoalActivity(rule.category);
      }
    } catch (error) {
      console.error('Error adding activity:', error);
    }
  }, [user]);

  const updateActivityTime = useCallback(async (activityType: 'breathing' | 'sound', durationMinutes: number) => {
    if (!user) return;

    try {
      const { error } = await supabase.rpc('update_patient_activity_time', {
        p_patient_id: user.id,
        p_activity_type: activityType,
        p_duration_minutes: durationMinutes
      });

      if (error) throw error;
    } catch (error) {
      console.error('Error updating activity time:', error);
    }
  }, [user]);

  const updateStreak = useCallback(async () => {
    if (!user) return;

    try {
      const { data, error } = await supabase.rpc('update_patient_streak', {
        p_patient_id: user.id
      });

      if (error) throw error;
      
      return data;
    } catch (error) {
      console.error('Error updating streak:', error);
      return null;
    }
  }, [user]);

  useEffect(() => {
    if (load) fetchStatistics();
    else setLoading(false);
  }, [fetchStatistics, load]);

  return {
    recentActivities,
    statistics,
    loading,
    addActivity,
    updateActivityTime,
    updateStreak,
    refreshStatistics: fetchStatistics
  };
};

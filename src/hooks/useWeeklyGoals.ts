import { useState, useEffect, useCallback } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { forgetPatientHomeRow } from '@/lib/patientHomeRow';
import { useAuth } from '@/contexts/AuthContext';
import { toast } from 'sonner';

export interface WeeklyGoalTemplate {
  id: string;
  category: string;
  title: string;
  description: string;
  type: string;
  target: number;
  active: boolean;
  created_at: string;
}

export interface PatientWeeklyGoal {
  id: string;
  user_id: string;
  goal_id: string;
  target: number;
  progress: number;
  completed: boolean;
  week_start_date: string;
  week_end_date: string;
  created_at: string;
  updated_at: string;
  /** Dia (do aparelho) do último passo contado: metas "todo dia" e desafios. */
  last_progress_date?: string | null;
  weekly_goals: WeeklyGoalTemplate;
}

const localDay = (d: Date) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

/** Hoje no aparelho, "YYYY-MM-DD". */
export const todayLocal = (now: Date = new Date()) => localDay(now);

/**
 * Domingo (início) e sábado (fim) da semana atual, como "YYYY-MM-DD", no dia
 * do aparelho. Antes a conta passava por UTC: no Brasil, depois das 21h a
 * semana "pulava" um dia e as metas sumiam da tela até a meia-noite.
 */
export const getCurrentWeekRange = (now: Date = new Date()): { weekStart: string; weekEnd: string } => {
  const start = new Date(now.getFullYear(), now.getMonth(), now.getDate() - now.getDay());
  const end = new Date(start.getFullYear(), start.getMonth(), start.getDate() + 6);
  return { weekStart: localDay(start), weekEnd: localDay(end) };
};

/**
 * Conta a atividade nas metas da semana da categoria (respiração, sons,
 * humor...). O servidor soma numa operação só, um passo por dia nas metas
 * "todo dia" e nos desafios, e devolve as que acabaram de ser concluídas.
 */
export const recordGoalActivity = async (category: string): Promise<string[]> => {
  const { data, error } = await supabase.rpc('record_goal_progress' as never, {
    p_category: category,
    p_local_date: todayLocal(),
  } as never);
  if (error) {
    console.error('Error recording goal progress:', error);
    return [];
  }
  const done = ((data ?? []) as { title: string; completed_now: boolean }[]).filter((r) => r.completed_now).map((r) => r.title);
  done.forEach((title) => toast.success(`Meta da semana concluída: ${title}`));
  return done;
};

/**
 * `autoLoad: false` para quem não mostra as metas ao abrir (a janela de
 * escolha, fechada na tela inicial; o perfil): antes cada abertura da tela
 * inicial chamava ensure_week_goals e buscava as metas sem mostrar nada.
 */
export const useWeeklyGoals = ({ autoLoad = true }: { autoLoad?: boolean } = {}) => {
  const { user } = useAuth();
  const [goals, setGoals] = useState<PatientWeeklyGoal[]>([]);
  const [loading, setLoading] = useState(true);
  const [newlyCompleted, setNewlyCompleted] = useState<PatientWeeklyGoal | null>(null);
  const [selectedGoals, setSelectedGoals] = useState<string[]>([]);

  const fetchSelectedGoals = useCallback(async () => {
    if (!user?.id) return;

    try {
      const { data, error } = await supabase
        .from('patients')
        .select('weekly_goals')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      setSelectedGoals(data?.weekly_goals || []);
    } catch (error) {
      console.error('Error fetching selected goals:', error);
      setSelectedGoals([]);
    }
  }, [user]);

  /** Escolhe as metas: o servidor grava a escolha e cria/tira as da semana. */
  const updateSelectedGoals = useCallback(async (goalIds: string[]) => {
    if (!user?.id) return;

    try {
      const { error } = await supabase.rpc('set_week_goals' as never, {
        p_goal_ids: goalIds,
        p_local_date: todayLocal(),
      } as never);

      if (error) throw error;

      setSelectedGoals(goalIds);
      toast.success('Metas da semana atualizadas');
    } catch (error) {
      console.error('Error updating selected goals:', error);
      toast.error('Erro ao atualizar as metas da semana');
      throw error;
    }
  }, [user]);

  const fetchGoals = useCallback(async () => {
    if (!user?.id) {
      setLoading(false);
      return;
    }

    try {
      const { weekStart } = getCurrentWeekRange();
      // As metas escolhidas continuam na semana nova sozinhas.
      await supabase.rpc('ensure_week_goals' as never, { p_local_date: todayLocal() } as never);

      const { data, error } = await supabase
        .from('patient_weekly_goals')
        .select('*, weekly_goals(*)')
        .eq('user_id', user.id)
        .eq('week_start_date', weekStart)
        .order('created_at', { ascending: false });

      if (error) throw error;

      setGoals((data as PatientWeeklyGoal[]) || []);
    } catch (error) {
      console.error('Error fetching goals:', error);
      setGoals([]);
    } finally {
      setLoading(false);
    }
  }, [user]);

  /** Um passo numa meta (ex.: "Fiz o passo de hoje" do desafio). */
  const updateGoalProgress = useCallback(async (goalId: string) => {
    const goal = goals.find((g) => g.id === goalId);
    if (!goal) return;
    const done = await recordGoalActivity(goal.weekly_goals.category);
    if (done.length > 0) setNewlyCompleted({ ...goal, progress: goal.target, completed: true });
    await fetchGoals();
  }, [goals, fetchGoals]);

  const checkAndUpdateGoals = useCallback(async (category: string) => {
    await recordGoalActivity(category);
    await fetchGoals();
  }, [fetchGoals]);

  const fetchDefaultGoals = useCallback(async () => {
    try {
      const { data, error } = await supabase
        .from('weekly_goals')
        .select('*')
        .eq('active', true)
        .order('category');

      if (error) throw error;
      return data as WeeklyGoalTemplate[];
    } catch (error) {
      console.error('Error fetching default goals:', error);
      return [];
    }
  }, []);

  const setShowWeeklyGoalModal = useCallback(async (value: boolean) => {
    if (!user?.id) return;

    try {
      forgetPatientHomeRow();
      const { error } = await supabase
        .from('patients')
        .update({ show_weekly_goal_modal: value })
        .eq('user_id', user.id);

      if (error) throw error;
    } catch (error) {
      console.error('Error updating weekly goal modal preference:', error);
      throw error;
    }
  }, [user]);

  const setShowGoalModal = useCallback(async (value: boolean) => {
    if (!user?.id) return;

    try {
      forgetPatientHomeRow();
      const { error } = await supabase
        .from('patients')
        .update({ show_goal_modal: value })
        .eq('user_id', user.id);

      if (error) throw error;
      
      toast.success(value ? 'Lembrete das metas da semana ativado' : 'Lembrete das metas da semana desativado');
    } catch (error) {
      console.error('Error updating goal modal preference:', error);
      toast.error('Erro ao atualizar preferência');
      throw error;
    }
  }, [user]);

  const getShowGoalModalPreference = useCallback(async () => {
    if (!user?.id) return true;

    try {
      const { data, error } = await supabase
        .from('patients')
        .select('show_goal_modal')
        .eq('user_id', user.id)
        .maybeSingle();

      if (error) throw error;
      return data?.show_goal_modal ?? true;
    } catch (error) {
      console.error('Error fetching goal modal preference:', error);
      return true;
    }
  }, [user]);

  const dismissCompletionModal = useCallback(() => {
    setNewlyCompleted(null);
  }, []);

  useEffect(() => {
    if (!autoLoad) {
      setLoading(false);
      return;
    }
    fetchGoals();
    fetchSelectedGoals();
  }, [fetchGoals, fetchSelectedGoals, autoLoad]);

  return {
    goals,
    loading,
    newlyCompleted,
    dismissCompletionModal,
    fetchGoals,
    updateGoalProgress,
    checkAndUpdateGoals,
    fetchDefaultGoals,
    setShowWeeklyGoalModal,
    setShowGoalModal,
    getShowGoalModalPreference,
    selectedGoals,
    fetchSelectedGoals,
    updateSelectedGoals,
  };
};

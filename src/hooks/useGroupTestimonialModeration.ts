import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import type { BlockDurationChoice } from '@/utils/psychologistBlock';

export interface AdminGroupTestimonial {
  testimonial_id: string;
  group_id: string;
  group_nome: string;
  autor_nome: string | null;
  anonimo: boolean;
  texto: string;
  humor: number;
  likes_positivos: number;
  likes_negativos: number;
  flagged: boolean;
  criado_em: string;
  /** Pending reports from other users (see report_group_testimonial). */
  pending_reports: number;
  report_reasons: string[];
  /** Autor real (também quando o depoimento aparece como anônimo para os outros). */
  autor_user_id: string;
  autor_email: string | null;
  /** Autor impedido de criar depoimentos (admin_block_testimonials). */
  autor_bloqueado: boolean;
  autor_bloqueado_ate: string | null;
}

/** Admin moderation of support-group testimonials: replaces the old
 * auto-delete-at-10-dislikes behavior. Testimonials that hit the threshold
 * now just sort first here (`flagged`) for an admin to review and edit or
 * delete manually — no silent removal, no vector for coordinated abuse. */
export const useGroupTestimonialModeration = () => {
  const [testimonials, setTestimonials] = useState<AdminGroupTestimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const [savingId, setSavingId] = useState<string | null>(null);
  const { toast } = useToast();

  const load = useCallback(async () => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_group_testimonials');
      if (error) throw error;
      setTestimonials(data ?? []);
    } catch (error) {
      console.error('Erro ao carregar depoimentos para moderação:', error);
      toast({
        title: 'Erro',
        description: 'Erro ao carregar depoimentos dos grupos de apoio',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    void load();
  }, [load]);

  const updateTestimonial = async (testimonialId: string, texto: string): Promise<boolean> => {
    setSavingId(testimonialId);
    try {
      const { error } = await supabase.rpc('admin_update_testimonial', {
        p_testimonial_id: testimonialId,
        p_texto: texto,
      });
      if (error) throw error;

      toast({ title: 'Depoimento atualizado' });
      await load();
      return true;
    } catch (error: unknown) {
      console.error('Erro ao editar depoimento:', error);
      toast({
        title: 'Erro ao salvar',
        description: getFriendlyErrorMessage(error, 'Não foi possível editar o depoimento.'),
        variant: 'destructive',
      });
      return false;
    } finally {
      setSavingId(null);
    }
  };

  const deleteTestimonial = async (testimonialId: string): Promise<boolean> => {
    setSavingId(testimonialId);
    try {
      const { error } = await supabase.rpc('admin_delete_testimonial', { p_testimonial_id: testimonialId });
      if (error) throw error;

      toast({ title: 'Depoimento excluído' });
      await load();
      return true;
    } catch (error: unknown) {
      console.error('Erro ao excluir depoimento:', error);
      toast({
        title: 'Erro',
        description: getFriendlyErrorMessage(error, 'Não foi possível excluir o depoimento.'),
        variant: 'destructive',
      });
      return false;
    } finally {
      setSavingId(null);
    }
  };

  const dismissReports = async (testimonialId: string): Promise<boolean> => {
    setSavingId(testimonialId);
    try {
      const { error } = await supabase.rpc('admin_dismiss_testimonial_reports', { p_testimonial_id: testimonialId });
      if (error) throw error;

      toast({ title: 'Denúncias arquivadas' });
      await load();
      return true;
    } catch (error: unknown) {
      console.error('Erro ao arquivar denúncias:', error);
      toast({
        title: 'Erro',
        description: getFriendlyErrorMessage(error, 'Não foi possível arquivar as denúncias.'),
        variant: 'destructive',
      });
      return false;
    } finally {
      setSavingId(null);
    }
  };

  /** Impede o autor de criar (e editar) depoimentos pelo período escolhido. */
  const blockAuthor = async (userId: string, choice: BlockDurationChoice, reason?: string): Promise<boolean> => {
    setSavingId(userId);
    try {
      const { error } = await supabase.rpc('admin_block_testimonials', {
        p_user_id: userId,
        p_unit: choice.kind === 'indefinite' ? 'indefinite' : choice.unit,
        p_amount: choice.kind === 'indefinite' ? null : choice.amount,
        p_reason: reason?.trim() || null,
      });
      if (error) throw error;
      toast({ title: 'Depoimentos bloqueados', description: 'O paciente continua lendo, mas não cria novos depoimentos.' });
      await load();
      return true;
    } catch (error: unknown) {
      console.error('Erro ao bloquear depoimentos:', error);
      toast({
        title: 'Erro',
        description: getFriendlyErrorMessage(error, 'Não foi possível bloquear os depoimentos do paciente.'),
        variant: 'destructive',
      });
      return false;
    } finally {
      setSavingId(null);
    }
  };

  const unblockAuthor = async (userId: string): Promise<boolean> => {
    setSavingId(userId);
    try {
      const { error } = await supabase.rpc('admin_unblock_testimonials', { p_user_id: userId });
      if (error) throw error;
      toast({ title: 'Depoimentos desbloqueados' });
      await load();
      return true;
    } catch (error: unknown) {
      console.error('Erro ao desbloquear depoimentos:', error);
      toast({
        title: 'Erro',
        description: getFriendlyErrorMessage(error, 'Não foi possível desbloquear os depoimentos do paciente.'),
        variant: 'destructive',
      });
      return false;
    } finally {
      setSavingId(null);
    }
  };

  return {
    testimonials,
    loading,
    savingId,
    updateTestimonial,
    deleteTestimonial,
    dismissReports,
    blockAuthor,
    unblockAuthor,
    reload: load,
  };
};

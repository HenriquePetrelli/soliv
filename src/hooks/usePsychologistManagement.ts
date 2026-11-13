import { useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { errorText, getFriendlyErrorMessage } from '@/utils/errorMessage';
import type { CfpRow } from '@/lib/crpVerification';

export interface PsychologistData {
  id: string;
  user_id?: string;
  full_name: string;
  email: string;
  cpf?: string;
  crp_number: string;
  specialization?: string;
  bio?: string;
  state?: string;
  city?: string;
  address?: string;
  document_url?: string;
  submitted_at: string;
  documents?: string[];
  approval_status: 'pending' | 'approved' | 'rejected';
  reviewed_at?: string;
  reviewed_by?: string;
  rejection_reason?: string;
  pix_key?: string;
  pix_type?: string;
  is_blocked?: boolean;
  blocked_until?: string | null;
  blocked_reason?: string | null;
  blocked_at?: string | null;
  /** Última consulta ao CFP (null = nunca conferido). */
  crp_status?: 'ativo' | 'irregular' | 'nao_encontrado' | null;
  crp_situacao?: string | null;
  crp_verified_at?: string | null;
}

export interface PsychologistRegistration {
  user_id: string;
  full_name: string;
  email: string;
  cpf?: string;
  crp_number: string;
  specialization: string;
  bio: string;
  state: string;
  city: string;
  address?: string | null;
  document_url: string;
}

export const usePsychologistManagement = () => {
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pendingPsychologists, setPendingPsychologists] = useState<PsychologistData[]>([]);


  const registerPsychologist = async (data: PsychologistRegistration) => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('psychologist-management?action=register', {
        method: 'POST',
        body: data,
      });

      if (error) throw error;
      if (!result.success) throw new Error(result.error || 'Erro no cadastro');

      toast.success(result.message);
      return { success: true, data: result.data };
    } catch (error: unknown) {
      console.error('Erro ao cadastrar psicólogo:', error);
      toast.error(getFriendlyErrorMessage(error, 'Erro ao realizar cadastro'));
      return { success: false, error: errorText(error) };
    } finally {
      setLoading(false);
    }
  };

  const getPendingPsychologists = async () => {
    setLoading(true);
    setError(null);
    try {
      const { data: result, error } = await supabase.functions.invoke('psychologist-management?action=all', {
        method: 'GET'
      });

      if (error) throw error;
      if (!result.success) throw new Error(result.error || 'Erro ao buscar psicólogos');

      setPendingPsychologists(result.data);
      return result.data;
    } catch (err: unknown) {
      console.error('Erro ao buscar psicólogos:', err);
      setError(getFriendlyErrorMessage(err, 'Erro ao carregar psicólogos.'));
      toast.error(getFriendlyErrorMessage(err, 'Erro ao carregar psicólogos.'));
      return [];
    } finally {
      setLoading(false);
    }
  };


  const getPsychologistDetails = async (psychologistId: string) => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke(`psychologist-management?id=${psychologistId}`, {
        method: 'GET'
      });

      if (error) throw error;
      if (!result.success) throw new Error(result.error || 'Erro ao buscar detalhes');

      return result.data;
    } catch (error: unknown) {
      console.error('Erro ao buscar detalhes do psicólogo:', error);
      toast.error(getFriendlyErrorMessage(error, 'Erro ao carregar detalhes'));
      return null;
    } finally {
      setLoading(false);
    }
  };

  const approvePsychologist = async (psychologistId: string, adminUserId: string) => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('psychologist-management?action=approve', {
        method: 'POST',
        body: {
          psychologist_id: psychologistId,
          admin_user_id: adminUserId
        },
      });

      if (error) throw error;
      if (!result.success) throw new Error(result.error || 'Erro na aprovação');

      toast.success(result.message);
      // Atualizar lista de pendentes
      await getPendingPsychologists();
      return { success: true };
    } catch (error: unknown) {
      console.error('Erro ao aprovar psicólogo:', error);
      toast.error(getFriendlyErrorMessage(error, 'Erro ao aprovar psicólogo'));
      return { success: false, error: errorText(error) };
    } finally {
      setLoading(false);
    }
  };

  /**
   * Guarda a consulta do CRP no CFP. `row` é a linha da tabela do CFP com o
   * CRP do psicólogo, ou null quando ele não aparece na busca.
   */
  const verifyCrp = async (psychologistId: string, row: CfpRow | null, notes?: string) => {
    try {
      const { data: result, error } = await supabase.functions.invoke('psychologist-management?action=crp-verify', {
        method: 'POST',
        body: { psychologist_id: psychologistId, row, notes },
      });
      if (error) throw error;
      if (!result.success) throw new Error(result.error || 'Erro ao salvar a verificação');
      setPendingPsychologists((list) => list.map((p) => (p.id === psychologistId ? { ...p, ...result.data } : p)));
      return { success: true as const, data: result.data as PsychologistData };
    } catch (error: unknown) {
      console.error('Erro ao salvar verificação do CRP:', error);
      toast.error(getFriendlyErrorMessage(error, 'Erro ao salvar a verificação do CRP'));
      return { success: false as const, error: errorText(error) };
    }
  };

  const rejectPsychologist = async (psychologistId: string, adminUserId: string, rejectionReason?: string) => {
    setLoading(true);
    try {
      const { data: result, error } = await supabase.functions.invoke('psychologist-management?action=reject', {
        method: 'POST',
        body: {
          psychologist_id: psychologistId,
          admin_user_id: adminUserId,
          rejection_reason: rejectionReason
        },
      });

      if (error) throw error;
      if (!result.success) throw new Error(result.error || 'Erro na rejeição');

      toast.success(result.message);
      // Atualizar lista de pendentes
      await getPendingPsychologists();
      return { success: true };
    } catch (error: unknown) {
      console.error('Erro ao rejeitar psicólogo:', error);
      toast.error(getFriendlyErrorMessage(error, 'Erro ao rejeitar psicólogo'));
      return { success: false, error: errorText(error) };
    } finally {
      setLoading(false);
    }
  };

  const checkPsychologistApproval = async (userId: string) => {
    try {
      // Verificar tabela psychologists
      const { data: psychologist, error: psychError } = await supabase
        .from('psychologists')
        .select('approval_status, approved, id, is_blocked, blocked_until, blocked_reason')
        .eq('user_id', userId)
        .single();

      if (psychError) {
        // Se não existe registro, usuário não é psicólogo
        return { isApproved: false, status: 'not_registered' };
      }

      const blocked = (psychologist).is_blocked === true &&
        (!(psychologist).blocked_until || new Date((psychologist).blocked_until).getTime() > Date.now());

      if (blocked) {
        return {
          isApproved: false,
          status: 'blocked',
          blockedUntil: (psychologist).blocked_until as string | null,
          blockedReason: (psychologist).blocked_reason as string | null,
        };
      }

      // Verificar tabela psychologist_registrations
      const { data: registration, error: regError } = await supabase
        .from('psychologist_registrations')
        .select('status')
        .eq('user_id', userId)
        .single();

      // Para aprovação, ambas as tabelas devem ter status 'approved'
      const isPsychApproved = psychologist.approved && psychologist.approval_status === 'approved';
      const isRegApproved = registration && !regError && registration.status === 'approved';

      return {
        isApproved: isPsychApproved && isRegApproved,
        status: psychologist.approval_status
      };
    } catch (error: unknown) {
      console.error('Erro ao verificar aprovação:', error);
      return { isApproved: false, status: 'error' };
    }
  };

  const validateCrpUnique = async (crp: string, excludeId?: string) => {
    try {
      const { data, error } = await supabase.rpc('validate_unique_crp', {
        crp_input: crp,
        exclude_id: excludeId || null
      });

      if (error) throw error;
      return data;
    } catch (error: unknown) {
      console.error('Erro ao validar CRP:', error);
      return false;
    }
  };

  return {
    loading,
    error,
    pendingPsychologists,
    registerPsychologist,
    getPendingPsychologists,
    getPsychologistDetails,
    approvePsychologist,
    rejectPsychologist,
    verifyCrp,
    checkPsychologistApproval,
    validateCrpUnique
  };
};
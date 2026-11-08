import { addMonths } from 'date-fns';
import { useState, useEffect } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useAuth } from '@/contexts/AuthContext';
import { useToast } from '@/hooks/use-toast';

export interface Conversa {
  id: string;
  paciente_id: string;
  psicologo_id: string;
  data_inicio: string;
  data_fim?: string;
  status: 'ativa' | 'somente_leitura' | 'expirada';
  created_at: string;
  updated_at: string;
  // Dados do psicólogo ou paciente (dependendo do tipo de usuário)
  outro_usuario?: {
    full_name: string;
    user_type: string;
  };
  ultima_mensagem?: {
    conteudo: string;
    created_at: string;
    tipo: string;
  };
  /** Mensagens do outro participante ainda não lidas. */
  nao_lidas: number;
}

export interface PsicologoDisponivel {
  id: string;
  user_id: string;
  full_name: string;
  specialization: string;
  ultima_consulta: string;
}

export const useConversas = () => {
  const [conversas, setConversas] = useState<Conversa[]>([]);
  const [psicologosDisponiveis, setPsicologosDisponiveis] = useState<PsicologoDisponivel[]>([]);
  const [loading, setLoading] = useState(false);
  /** A lista já veio do servidor ao menos uma vez (para dizer "conversa não encontrada"). */
  const [carregado, setCarregado] = useState(false);
  const { user, userType } = useAuth();
  const { toast } = useToast();

  /**
   * `silencioso`: atualização em segundo plano (tempo real). Não mostra o
   * carregando nem o aviso de erro — a lista atual continua na tela e a
   * próxima atualização corrige.
   */
  const fetchConversas = async (silencioso = false) => {
    if (!user) return;

    try {
      if (!silencioso) setLoading(true);

      // Uma consulta só: conversa, nome do outro participante, última
      // mensagem e quantas não lidas (antes eram 2 consultas por conversa).
      const { data, error } = await supabase.rpc('listar_conversas');
      if (error) throw error;

      setConversas(
        (data ?? []).map((row) => ({
          id: row.id,
          paciente_id: row.paciente_id,
          psicologo_id: row.psicologo_id,
          data_inicio: row.data_inicio,
          // A rotina diária muda o status; até ela rodar, a data já vale
          // (o banco recusa mensagem 1 mês depois de a conversa abrir).
          status:
            row.status === 'ativa' && addMonths(new Date(row.data_inicio), 1) <= new Date()
              ? 'somente_leitura'
              : (row.status as Conversa['status']),
          created_at: row.created_at,
          updated_at: row.updated_at,
          outro_usuario: row.outro_nome
            ? { full_name: row.outro_nome, user_type: userType === 'patient' ? 'psychologist' : 'patient' }
            : undefined,
          ultima_mensagem: row.ultima_em
            ? { conteudo: row.ultima_conteudo ?? '', created_at: row.ultima_em, tipo: row.ultima_tipo ?? 'texto' }
            : undefined,
          nao_lidas: row.nao_lidas ?? 0,
        })),
      );
      setCarregado(true);
    } catch (error) {
      console.error('Erro ao buscar conversas:', error);
      if (silencioso) return;
      toast({
        title: 'Erro',
        description: 'Erro ao carregar conversas',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  };

  const fetchPsicologosDisponiveis = async () => {
    if (!user || userType !== 'patient') return;

    try {
      // Buscar psicólogos com consultas finalizadas nos últimos 30 dias
      const { data: appointments, error } = await supabase
        .from('appointments')
        .select(`
          psychologist_id,
          scheduled_at,
          psychologists!inner(
            id,
            user_id,
            full_name,
            specialization
          )
        `)
        .eq('patient_id', user.id)
        .eq('status', 'completed')
        .gte('scheduled_at', new Date(Date.now() - 30 * 24 * 60 * 60 * 1000).toISOString())
        .order('scheduled_at', { ascending: false });

      if (error) throw error;

      // Filtrar psicólogos únicos e verificar se já existe conversa
      const psicologosUnicos = appointments?.reduce((acc: PsicologoDisponivel[], curr) => {
        const psicologo = curr.psychologists;
        const exists = acc.find(p => p.user_id === psicologo.user_id);
        
        if (!exists) {
          acc.push({
            id: psicologo.id,
            user_id: psicologo.user_id,
            full_name: psicologo.full_name,
            specialization: psicologo.specialization,
            ultima_consulta: curr.scheduled_at
          });
        }
        
        return acc;
      }, []) || [];

      // Filtrar apenas psicólogos que não têm conversa ativa
      const conversasExistentes = conversas.map(c => c.psicologo_id);
      const psicologosDisponiveis = psicologosUnicos.filter(
        p => !conversasExistentes.includes(p.user_id)
      );

      setPsicologosDisponiveis(psicologosDisponiveis);
    } catch (error) {
      console.error('Erro ao buscar psicólogos disponíveis:', error);
    }
  };

  const criarConversa = async (psicologoId: string) => {
    if (!user) return null;

    try {
      // Reabre a conversa que já existe (inclusive uma que o paciente ocultou)
      // ou cria uma nova; o banco confere a consulta nos últimos 30 dias.
      const { data: conversaId, error } = await supabase.rpc('abrir_conversa', { p_psicologo_id: psicologoId });

      if (error) throw error;

      await fetchConversas();
      return conversaId ? { id: conversaId as string } : null;
    } catch (error) {
      console.error('Erro ao criar conversa:', error);
      toast({
        title: 'Não foi possível iniciar a conversa',
        description: 'O chat abre com psicólogos com quem você teve consulta nos últimos 30 dias.',
        variant: 'destructive',
      });
      return null;
    }
  };

  // Some só da lista de quem excluiu (o outro lado continua com o histórico);
  // volta se chegar mensagem nova.
  const excluirConversa = async (conversaId: string) => {
    try {
      const { error } = await supabase.rpc('ocultar_conversa', { p_conversa_id: conversaId });

      if (error) throw error;

      toast({ title: 'Conversa removida da sua lista' });

      await fetchConversas();
    } catch (error) {
      console.error('Erro ao excluir conversa:', error);
      toast({
        title: 'Não foi possível remover a conversa',
        description: 'Tente de novo em instantes.',
        variant: 'destructive',
      });
    }
  };

  useEffect(() => {
    if (user) {
      fetchConversas();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, [user, userType]);

  useEffect(() => {
    if (user && userType === 'patient') {
      fetchPsicologosDisponiveis();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, [user, userType, conversas]);

  // Tempo real: muda a conversa (status, nova conversa) ou chega/é lida uma
  // mensagem → atualiza lista, última mensagem e não lidas.
  useEffect(() => {
    if (!user) return;

    const channel = supabase
      .channel(`conversas-${user.id}-${Math.random().toString(36).slice(2)}`)
      .on(
        'postgres_changes',
        {
          event: '*',
          schema: 'public',
          table: 'conversas',
          filter: userType === 'patient'
            ? `paciente_id=eq.${user.id}`
            : `psicologo_id=eq.${user.id}`
        },
        () => {
          fetchConversas(true);
        }
      )
      .on('postgres_changes', { event: '*', schema: 'public', table: 'mensagens' }, () => {
        fetchConversas(true);
      })
      .subscribe();

    return () => {
      supabase.removeChannel(channel);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [user, userType]);

  return {
    conversas,
    psicologosDisponiveis,
    loading,
    carregado,
    criarConversa,
    excluirConversa,
    refetch: () => fetchConversas()
  };
};
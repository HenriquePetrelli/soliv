import { useState, useEffect, useRef } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { getSessionUser } from '@/lib/currentUser';
import { useToast } from '@/hooks/use-toast';
import { useSubscription } from '@/contexts/SubscriptionContext';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import { hasPaidPlan } from '@/lib/plans';

export interface SupportGroup {
  id: string;
  nome: string;
  descricao: string;
  criado_em: string;
  is_favorited?: boolean;
}

export interface GroupTestimonial {
  id: string;
  group_id: string;
  anonimo: boolean;
  sintoma_id: string | null;
  sintoma_texto: string | null;
  humor: number;
  texto: string;
  criado_em: string;
  likes_positivos: number;
  likes_negativos: number;
  /** Author's name — always null for anonymous testimonials. The author's
   * user_id is never sent to other users (see get_group_testimonials). */
  autor_nome: string | null;
  is_mine: boolean;
  reported_by_me: boolean;
  /** 3+ denúncias pendentes: só o autor vê, até a moderação revisar. */
  under_review?: boolean;
  user_like?: {
    tipo: 'positivo' | 'negativo';
  } | null;
}

export type TestimonialReportReason = 'ofensivo' | 'risco' | 'spam' | 'dados_pessoais' | 'outro';

export interface GroupSymptom {
  id: string;
  transtorno: string;
  sintomas: string[];
}

export const useSupportGroups = () => {
  const [groups, setGroups] = useState<SupportGroup[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();

  const fetchGroups = async () => {
    try {
      setLoading(true);
      
      const { data: groupsData, error: groupsError } = await supabase
        .from('support_groups')
        .select('*')
        .order('nome');

      if (groupsError) throw groupsError;

      // Fetch user's favorites
      const { data: favoritesData } = await supabase
        .from('group_favorites')
        .select('group_id')
        .eq('user_id', (await getSessionUser()).data.user?.id);

      const favoriteIds = favoritesData?.map(fav => fav.group_id) || [];

      const groupsWithFavorites = groupsData.map(group => ({
        ...group,
        is_favorited: favoriteIds.includes(group.id)
      }));

      // Sort: favorites first, then alphabetically
      groupsWithFavorites.sort((a, b) => {
        if (a.is_favorited && !b.is_favorited) return -1;
        if (!a.is_favorited && b.is_favorited) return 1;
        return a.nome.localeCompare(b.nome);
      });

      setGroups(groupsWithFavorites);
    } catch (error) {
      console.error('Error fetching groups:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os grupos de apoio",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const toggleFavorite = async (groupId: string) => {
    try {
      const user = (await getSessionUser()).data.user;
      if (!user) return;

      const group = groups.find(g => g.id === groupId);
      if (!group) return;

      if (group.is_favorited) {
        // Remove from favorites
        const { error } = await supabase
          .from('group_favorites')
          .delete()
          .eq('user_id', user.id)
          .eq('group_id', groupId);

        if (error) throw error;
      } else {
        // Add to favorites
        const { error } = await supabase
          .from('group_favorites')
          .insert({
            user_id: user.id,
            group_id: groupId
          });

        if (error) throw error;
      }

      // Update local state
      setGroups(prev => {
        const updated = prev.map(g => 
          g.id === groupId 
            ? { ...g, is_favorited: !g.is_favorited }
            : g
        );

        // Re-sort after toggling
        return updated.sort((a, b) => {
          if (a.is_favorited && !b.is_favorited) return -1;
          if (!a.is_favorited && b.is_favorited) return 1;
          return a.nome.localeCompare(b.nome);
        });
      });

      toast({
        title: group.is_favorited ? "Removido dos favoritos" : "Adicionado aos favoritos",
        description: `${group.nome} foi ${group.is_favorited ? 'removido dos' : 'adicionado aos'} seus favoritos`,
      });
    } catch (error) {
      console.error('Error toggling favorite:', error);
      toast({
        title: "Erro",
        description: "Não foi possível alterar os favoritos",
        variant: "destructive"
      });
    }
  };

  useEffect(() => {
    fetchGroups();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, []);

  return {
    groups,
    loading,
    toggleFavorite,
    refetch: fetchGroups
  };
};

export const useGroupTestimonials = (groupId: string, filterByUser: boolean = false) => {
  const [testimonials, setTestimonials] = useState<GroupTestimonial[]>([]);
  const [loading, setLoading] = useState(true);
  const { toast } = useToast();
  const { subscribed, subscriptionTier } = useSubscription();
  const reactionQueueRef = useRef(new Map<string, Promise<unknown>>());

  const fetchTestimonials = async (userFilter: boolean = filterByUser) => {
    if (!groupId) return;
    
    try {
      setLoading(true);
      // Served by an RPC instead of a direct select: RLS can't hide a
      // column, so reading the table directly shipped every anonymous
      // author's user_id to every reader. The RPC never returns user_id and
      // only returns the name for non-anonymous testimonials.
      const { data, error } = await supabase.rpc('get_group_testimonials', {
        p_group_id: groupId,
        p_only_mine: userFilter,
      });

      if (error) throw error;

      const rows: GroupTestimonial[] = (data ?? []).map((row) => ({
        ...row,
        user_like: row.user_like ? { tipo: row.user_like as 'positivo' | 'negativo' } : null,
      }));

      setTestimonials(rows);
    } catch (error) {
      console.error('Error fetching testimonials:', error);
      toast({
        title: "Erro",
        description: "Não foi possível carregar os depoimentos",
        variant: "destructive"
      });
    } finally {
      setLoading(false);
    }
  };

  const addTestimonial = async (testimonial: {
    anonimo: boolean;
    sintoma_id: string | null;
    sintoma_texto: string | null;
    humor: number;
    texto: string;
  }, id?: string) => {
    try {
      // Check subscription for premium features
      if (!hasPaidPlan(subscribed, subscriptionTier)) {
        toast({
          title: 'Disponível nos planos pagos',
          description: 'Essa funcionalidade está disponível nos planos Essencial, Flex e Completo.',
          variant: 'destructive',
        });
        return false;
      }

      const user = (await getSessionUser()).data.user;
      if (!user) throw new Error('Usuário não autenticado');

      // id do aparelho: salvar de novo depois de uma resposta perdida não
      // publica o mesmo depoimento duas vezes.
      const { error } = await supabase
        .from('group_testimonials')
        .insert({
          ...(id ? { id } : {}),
          group_id: groupId,
          user_id: user.id,
          ...testimonial
        });

      if (error && error.code !== '23505') throw error;

      toast({ title: "Depoimento adicionado" });

      fetchTestimonials(); // Refresh list
      return true;
    } catch (error) {
      console.error('Error adding testimonial:', error);
      toast({
        title: "Erro",
        description: getFriendlyErrorMessage(error, 'Não foi possível adicionar o depoimento.'),
        variant: "destructive"
      });
      return false;
    }
  };

  const updateTestimonial = async (testimonialId: string, updates: {
    anonimo: boolean;
    sintoma_id: string | null;
    sintoma_texto: string | null;
    humor: number;
    texto: string;
  }) => {
    try {
      const { error } = await supabase
        .from('group_testimonials')
        .update(updates)
        .eq('id', testimonialId);

      if (error) throw error;

      toast({ title: "Depoimento atualizado" });

      await fetchTestimonials(filterByUser); // Refresh list
      return true;
    } catch (error) {
      console.error('Error updating testimonial:', error);
      toast({
        title: "Erro",
        description: getFriendlyErrorMessage(error, 'Não foi possível atualizar o depoimento.'),
        variant: "destructive"
      });
      return false;
    }
  };

  const deleteTestimonial = async (testimonialId: string) => {
    try {
      const { error } = await supabase
        .from('group_testimonials')
        .delete()
        .eq('id', testimonialId);

      if (error) throw error;

      toast({ title: "Depoimento excluído" });

      await fetchTestimonials(filterByUser); // Refresh list
      return true;
    } catch (error) {
      console.error('Error deleting testimonial:', error);
      toast({
        title: "Erro",
        description: getFriendlyErrorMessage(error, 'Não foi possível excluir o depoimento.'),
        variant: "destructive"
      });
      return false;
    }
  };
  const reportTestimonial = async (testimonialId: string, reason: TestimonialReportReason, details?: string) => {
    try {
      const { error } = await supabase.rpc('report_group_testimonial', {
        p_testimonial_id: testimonialId,
        p_reason: reason,
        p_details: details ?? null,
      });
      if (error) throw error;

      setTestimonials(prev => prev.map(t => (t.id === testimonialId ? { ...t, reported_by_me: true } : t)));
      toast({
        title: 'Denúncia enviada',
        description: 'Nossa equipe vai revisar este depoimento.',
      });
      return true;
    } catch (error) {
      console.error('Error reporting testimonial:', error);
      toast({
        title: 'Não foi possível enviar a denúncia',
        description: getFriendlyErrorMessage(error, 'Tente novamente em instantes.'),
        variant: 'destructive',
      });
      return false;
    }
  };


  useEffect(() => {
    fetchTestimonials();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, [groupId, filterByUser]); // Remove real-time subscription complexity for now

  const likeTestimonial = async (testimonialId: string, tipo: 'positivo' | 'negativo' | 'none') => {
    try {
      // Check subscription for premium features
      if (!hasPaidPlan(subscribed, subscriptionTier)) {
        toast({
          title: 'Disponível nos planos pagos',
          description: 'Essa funcionalidade está disponível nos planos Essencial, Flex e Completo.',
          variant: 'destructive',
        });
        return false;
      }

      const { data: user } = await getSessionUser();
      if (!user.user) return false;

      // Optimistic update - update UI immediately for better UX
      setTestimonials(prev => {
        return prev.map(testimonial => {
          if (testimonial.id === testimonialId) {
            const currentLike = testimonial.user_like?.tipo as ('positivo' | 'negativo' | undefined);
            
            // If user is clearing the reaction
            if (tipo === 'none') {
              if (!currentLike) return testimonial; // nothing to clear
              return {
                ...testimonial,
                user_like: null,
                likes_positivos: currentLike === 'positivo' ? Math.max(0, testimonial.likes_positivos - 1) : testimonial.likes_positivos,
                likes_negativos: currentLike === 'negativo' ? Math.max(0, testimonial.likes_negativos - 1) : testimonial.likes_negativos,
              };
            }

            // Otherwise user is setting a reaction
            const newLike: { tipo: 'positivo' | 'negativo' } | null = { tipo } as { tipo: 'positivo' | 'negativo' };
            let newPositives = testimonial.likes_positivos;
            let newNegatives = testimonial.likes_negativos;

            if (currentLike === tipo) {
              // Mesma reação de novo: nada muda (para tirar, a tela manda 'none',
              // igual ao que o servidor faz).
              return testimonial;
            } else if (currentLike) {
              // Switch reaction
              if (currentLike === 'positivo') {
                newPositives = Math.max(0, newPositives - 1);
                newNegatives = newNegatives + 1;
              } else {
                newNegatives = Math.max(0, newNegatives - 1);
                newPositives = newPositives + 1;
              }
            } else {
              // Add new reaction
              if (tipo === 'positivo') newPositives = newPositives + 1; else newNegatives = newNegatives + 1;
            }

            return {
              ...testimonial,
              user_like: newLike,
              likes_positivos: newPositives,
              likes_negativos: newNegatives
            };
          }
          return testimonial;
        });
      });

      // Uma operação só no servidor (pôr, trocar ou tirar), na ordem dos
      // toques: dois toques rápidos não se atropelam mais.
      const previous = reactionQueueRef.current.get(testimonialId) ?? Promise.resolve();
      const run = previous.catch(() => undefined).then(async () => {
        const { data, error } = await supabase.rpc('react_to_testimonial' as never, {
          p_testimonial_id: testimonialId,
          p_tipo: tipo,
        } as never);
        if (error) throw error;
        return data as unknown as { likes_positivos: number; likes_negativos: number } | null;
      });
      reactionQueueRef.current.set(testimonialId, run);
      const totals = await run;
      if (reactionQueueRef.current.get(testimonialId) === run) {
        reactionQueueRef.current.delete(testimonialId);
        // Último toque da fila: os totais do servidor valem (outras pessoas
        // podem ter reagido ao mesmo tempo).
        if (totals) {
          setTestimonials((prev) =>
            prev.map((t) =>
              t.id === testimonialId
                ? { ...t, likes_positivos: totals.likes_positivos, likes_negativos: totals.likes_negativos }
                : t,
            ),
          );
        }
      }

      return true;
    } catch (error) {
      console.error('Error liking testimonial:', error);
      
      // Revert optimistic update on error by fetching fresh data
      await fetchTestimonials(filterByUser);
      
      toast({
        title: "Erro",
        description: getFriendlyErrorMessage(error, 'Não foi possível processar sua avaliação.'),
        variant: "destructive",
      });
      return false;
    }
  };

  return {
    testimonials,
    loading,
    addTestimonial,
    updateTestimonial,
    deleteTestimonial,
    reportTestimonial,
    likeTestimonial,
    refetch: (userFilter: boolean = filterByUser) => fetchTestimonials(userFilter)
  };
};

export const useGroupSymptoms = (groupName: string) => {
  const [symptoms, setSymptoms] = useState<string[]>([]);
  const [symptomId, setSymptomId] = useState<string | null>(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchSymptoms = async () => {
      if (!groupName) return;
      
      try {
        setLoading(true);
        
        const { data, error } = await supabase
          .from('transtornos_sintomas')
          .select('*')
          .eq('transtorno', groupName)
          .single();

        if (error) {
          console.warn('No symptoms found for group:', groupName);
          setSymptoms([]);
          setSymptomId(null);
        } else {
          setSymptoms(data.sintomas || []);
          setSymptomId(data.id);
        }
      } catch (error) {
        console.error('Error fetching symptoms:', error);
        setSymptoms([]);
        setSymptomId(null);
      } finally {
        setLoading(false);
      }
    };

    fetchSymptoms();
  }, [groupName]);

  return { symptoms, symptomId, loading };
};
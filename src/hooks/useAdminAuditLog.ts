import { useCallback, useEffect, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

export interface AuditLogEntry {
  id: string;
  admin_id: string;
  admin_name: string | null;
  action: string;
  target_type: string;
  target_id: string | null;
  target_name: string | null;
  details: Record<string, unknown>;
  created_at: string;
}

const PAGE_SIZE = 50;

export const useAdminAuditLog = () => {
  const [entries, setEntries] = useState<AuditLogEntry[]>([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(0);
  const [hasMore, setHasMore] = useState(true);
  const { toast } = useToast();

  const load = useCallback(async (nextPage: number) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('get_admin_audit_log', {
        p_limit: PAGE_SIZE,
        p_offset: nextPage * PAGE_SIZE,
      });

      if (error) throw error;

      const rows = (data || []) as AuditLogEntry[];
      setEntries((prev) => (nextPage === 0 ? rows : [...prev, ...rows]));
      setHasMore(rows.length === PAGE_SIZE);
      setPage(nextPage);
    } catch (error: unknown) {
      console.error('Error fetching audit log:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar o histórico de ações administrativas.',
        variant: 'destructive',
      });
    } finally {
      setLoading(false);
    }
  }, [toast]);

  useEffect(() => {
    load(0);
  }, [load]);

  return {
    entries,
    loading,
    hasMore,
    loadMore: () => load(page + 1),
    refetch: () => load(0),
  };
};

import { useCallback, useState } from 'react';
import { supabase } from '@/integrations/supabase/client';
import type { AccessLogRow } from '@/lib/accessLogsCsv';

export interface AccessLogFilters {
  search: string;
  from: string | null;
  to: string | null;
  event: string | null;
}

const PAGE_SIZE = 50;

const toArgs = (f: AccessLogFilters) => ({
  p_search: f.search.trim() || undefined,
  p_from: f.from ?? undefined,
  p_to: f.to ?? undefined,
  p_event: f.event ?? undefined,
});

/** Consulta dos registros de acesso pelo admin. Cada busca nova fica na Auditoria (o banco registra). */
export const useAdminAccessLogs = () => {
  const [entries, setEntries] = useState<AccessLogRow[]>([]);
  const [total, setTotal] = useState(0);
  const [loading, setLoading] = useState(false);
  const [searched, setSearched] = useState(false);
  const [filters, setFilters] = useState<AccessLogFilters | null>(null);

  const load = useCallback(async (next: AccessLogFilters, offset: number) => {
    setLoading(true);
    try {
      const { data, error } = await supabase.rpc('admin_get_access_logs', {
        ...toArgs(next),
        p_limit: PAGE_SIZE,
        p_offset: offset,
      });
      if (error) throw error;
      const rows = (data || []) as (AccessLogRow & { total_count: number })[];
      setEntries((prev) => (offset === 0 ? rows : [...prev, ...rows]));
      if (offset === 0) setTotal(rows[0]?.total_count ?? 0);
      setFilters(next);
      setSearched(true);
    } finally {
      setLoading(false);
    }
  }, []);

  const search = useCallback((next: AccessLogFilters) => load(next, 0), [load]);
  const loadMore = useCallback(() => (filters ? load(filters, entries.length) : Promise.resolve()), [filters, entries.length, load]);

  const exportAll = useCallback(async (reason: string) => {
    if (!filters) return [];
    const { data, error } = await supabase.rpc('admin_export_access_logs', { ...toArgs(filters), p_reason: reason });
    if (error) throw error;
    return (data || []) as AccessLogRow[];
  }, [filters]);

  return { entries, total, loading, searched, filters, search, loadMore, exportAll, hasMore: entries.length < total };
};

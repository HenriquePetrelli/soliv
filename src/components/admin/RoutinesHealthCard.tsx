import { useCallback, useEffect, useState } from 'react';
import { Timer } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { supabase } from '@/integrations/supabase/client';
import { routinesNeedingAttention, type RoutineHealth } from '@/components/admin/routinesHealth';


const formatWhen = (iso: string | null) =>
  iso ? new Date(iso).toLocaleString('pt-BR', { timeZone: 'America/Sao_Paulo', dateStyle: 'short', timeStyle: 'short' }) : 'sem registro';

/**
 * Saúde das rotinas automáticas (lembretes, pushes, fechamento de consultas,
 * expirações) na Visão geral do admin. Antes, saber se uma rotina tinha
 * parado exigia abrir o banco.
 */
const RoutinesHealthCard = () => {
  const [rows, setRows] = useState<RoutineHealth[] | null>(null);
  const [error, setError] = useState(false);
  const [loading, setLoading] = useState(false);

  const load = useCallback(async () => {
    setLoading(true);
    const { data, error: rpcError } = await supabase.rpc('get_routines_health' as never);
    setLoading(false);
    if (rpcError) {
      setError(true);
      return;
    }
    setError(false);
    setRows((data as unknown as RoutineHealth[]) ?? []);
  }, []);

  useEffect(() => {
    void load();
  }, [load]);

  const problems = rows ? routinesNeedingAttention(rows) : [];

  return (
    <Card data-testid="routines-health">
      <CardHeader className="pb-3">
        <CardTitle className="flex items-center gap-2 text-base">
          <span className="flex h-8 w-8 items-center justify-center rounded-lg bg-primary/10 text-primary" aria-hidden="true">
            <Timer className="h-4 w-4" />
          </span>
          Rotinas automáticas
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-2 text-sm">
        {error ? (
          <div className="flex items-center justify-between gap-2">
            <p className="text-muted-foreground">Não foi possível conferir as rotinas agora.</p>
            <Button size="sm" variant="outline" onClick={() => void load()} disabled={loading}>
              Tentar de novo
            </Button>
          </div>
        ) : rows === null ? (
          <p className="text-muted-foreground">Conferindo...</p>
        ) : problems.length === 0 ? (
          <p className="text-muted-foreground">Todas as {rows.length} rotinas estão ativas e sem falhas nas últimas 24 h.</p>
        ) : (
          <>
            <p className="font-medium text-destructive">
              {problems.length === 1 ? '1 rotina precisa de atenção' : `${problems.length} rotinas precisam de atenção`}
            </p>
            <ul className="space-y-2">
              {problems.map((r) => (
                <li key={r.jobname} className="rounded-lg border border-border p-2">
                  <p className="font-medium text-foreground">{r.jobname}</p>
                  <p className="text-xs text-muted-foreground">
                    {!r.active
                      ? 'Desligada'
                      : `${r.failures_24h} ${r.failures_24h === 1 ? 'falha' : 'falhas'} em 24 h · última execução: ${formatWhen(r.last_start)}`}
                  </p>
                  {r.last_error && <p className="mt-1 break-words text-xs text-muted-foreground">{r.last_error}</p>}
                </li>
              ))}
            </ul>
          </>
        )}
      </CardContent>
    </Card>
  );
};

export default RoutinesHealthCard;

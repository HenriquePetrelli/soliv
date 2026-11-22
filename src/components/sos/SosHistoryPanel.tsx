import React from 'react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { ChevronLeft, ChevronRight } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonList } from '@/components/skeletons/Skeletons';
import { useSosHistory, type SosMetrics } from '@/hooks/useSosHistory';
import {
  SOS_TONE_CLASS,
  describeEndReason,
  endedByLabel,
  formatDateTime,
  formatDuration,
  formatPercent,
  formatRating,
  sosStatusLabel,
  sosStatusTone,
  waitSeconds,
} from '@/lib/sosHistory';
import LifeRingIcon from '@/components/icons/LifeRingIcon';

interface SosHistoryPanelProps {
  /** When set, only this patient's requests are listed. */
  patientId?: string | null;
  /** Show the aggregated operational metrics (admin view). */
  withMetrics?: boolean;
  title?: string;
}

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border bg-card px-3 py-2.5">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-lg font-semibold text-foreground">{value}</p>
  </div>
);

/** Números do SOS (admin): totais, tempos, taxas e motivos de encerramento. */
export const SosMetricsSummary: React.FC<{ metrics: SosMetrics }> = ({ metrics }) => (
  <>
        <div className="grid grid-cols-2 gap-3 md:grid-cols-3 lg:grid-cols-6">
          <Metric label="Solicitações (30d)" value={String(metrics.total)} />
          <Metric label="Atendidas" value={String(metrics.attended)} />
          <Metric label="Sem atendimento" value={String(metrics.unattended)} />
          <Metric label="Em aberto" value={String(metrics.in_flight)} />
          <Metric label="Tempo até aceite" value={formatDuration(metrics.avg_accept_seconds)} />
          <Metric label="Duração média" value={formatDuration(metrics.avg_duration_seconds)} />
          <Metric label="Concluídas" value={String(metrics.completed)} />
          <Metric label="Taxa de aceite" value={formatPercent(metrics.acceptance_rate)} />
          <Metric label="Crise resolvida" value={formatPercent(metrics.crisis_resolved_rate)} />
          <Metric label="Avaliação média" value={formatRating(metrics.avg_rating)} />
        </div>

      {Object.keys(metrics.end_reasons ?? {}).length > 0 && (
        <Card>
          <CardHeader className="pb-2">
            <CardTitle>Motivos de encerramento (30 dias)</CardTitle>
          </CardHeader>
          <CardContent className="flex flex-wrap gap-2">
            {Object.entries(metrics.end_reasons).map(([reason, qty]) => (
              <Badge key={reason} variant="outline" className="font-normal">
                {describeEndReason(reason)} · {qty}
              </Badge>
            ))}
          </CardContent>
        </Card>
      )}
  </>
);

/** SOS request history — reused by the patient view and the admin dashboard. */
export const SosHistoryPanel: React.FC<SosHistoryPanelProps> = ({
  patientId,
  withMetrics = false,
  title = 'Histórico de solicitações SOS',
}) => {
  const { rows, loading, page, setPage, totalPages, total, metrics } = useSosHistory({
    patientId,
    withMetrics,
  });

  return (
    <div className="space-y-4">
      {withMetrics && metrics && <SosMetricsSummary metrics={metrics} />}

      <Card>
        <CardHeader className="pb-2">
          <CardTitle className="flex items-center gap-2 text-base">
            <LifeRingIcon className="h-4 w-4 text-primary" aria-hidden="true" />
            {title}
          </CardTitle>
        </CardHeader>
        <CardContent className="space-y-3">
          {loading ? (
            <SkeletonList count={4} />
          ) : rows.length === 0 ? (
            <EmptyState
              icon={LifeRingIcon}
              title="Nenhuma solicitação registrada"
              description="As solicitações de atendimento emergencial aparecerão aqui."
            />
          ) : (
            <>
              <ul className="space-y-2">
                {rows.map((row) => {
                  const wait = waitSeconds(row);
                  return (
                    <li
                      key={row.id}
                      className="rounded-lg border bg-card px-3 py-3 transition-colors hover:bg-muted/40"
                    >
                      <div className="flex flex-wrap items-center justify-between gap-2">
                        <span className="text-sm font-medium text-foreground">{formatDateTime(row.created_at)}</span>
                        <Badge variant="outline" className={SOS_TONE_CLASS[sosStatusTone(row.status)]}>
                          {sosStatusLabel(row.status)}
                        </Badge>
                      </div>
                      <div className="mt-1.5 grid grid-cols-2 gap-x-4 gap-y-1 text-xs text-muted-foreground md:grid-cols-4">
                        <span>Espera: {wait == null ? '—' : formatDuration(wait)}</span>
                        <span>Duração: {formatDuration(row.duration)}</span>
                        <span>Encerrada por: {endedByLabel(row.ended_by_type)}</span>
                        <span>Motivo: {describeEndReason(row.end_reason)}</span>
                      </div>
                    </li>
                  );
                })}
              </ul>

              {totalPages > 1 && (
                <div className="flex items-center justify-between pt-1">
                  <span className="text-xs text-muted-foreground">
                    Página {page} de {totalPages} · {total} registros
                  </span>
                  <div className="flex gap-2">
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === 1}
                      onClick={() => setPage(page - 1)}
                      aria-label="Página anterior"
                    >
                      <ChevronLeft className="h-4 w-4" />
                    </Button>
                    <Button
                      variant="outline"
                      size="sm"
                      disabled={page === totalPages}
                      onClick={() => setPage(page + 1)}
                      aria-label="Próxima página"
                    >
                      <ChevronRight className="h-4 w-4" />
                    </Button>
                  </div>
                </div>
              )}
            </>
          )}
        </CardContent>
      </Card>
    </div>
  );
};

export default SosHistoryPanel;

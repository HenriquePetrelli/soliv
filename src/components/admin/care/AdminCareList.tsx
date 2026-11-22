import { useCallback, useEffect, useState } from 'react';
import { CalendarClock, ChevronLeft, ChevronRight, FileText, Star } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { SkeletonList } from '@/components/skeletons/Skeletons';
import LifeRingIcon from '@/components/icons/LifeRingIcon';
import { formatDateTime, formatDuration } from '@/lib/sosHistory';
import {
  CARE_TONE_CLASS,
  careStatusLabel,
  careStatusTone,
  fetchCareList,
  type CareKind,
  type CareListRow,
} from '@/lib/adminCare';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';

interface AdminCareListProps {
  kind: CareKind;
  title: string;
  psychologistId?: string | null;
  patientId?: string | null;
  onSelect: (row: CareListRow) => void;
  /** Avisa as linhas carregadas (ex.: para mostrar o nome da pessoa filtrada). */
  onRowsLoaded?: (rows: CareListRow[]) => void;
  pageSize?: number;
}

const Rating = ({ label, value }: { label: string; value: number | null }) => (
  <span className="inline-flex items-center gap-1">
    {label}:
    {value ? (
      <>
        <Star className="h-3 w-3 fill-yellow-400 text-warning" aria-hidden="true" />
        {value}
      </>
    ) : (
      ' —'
    )}
  </span>
);

/** Lista paginada de consultas ou SOS; cada linha abre os detalhes. */
const AdminCareList = ({ kind, title, psychologistId, patientId, onSelect, onRowsLoaded, pageSize = 10 }: AdminCareListProps) => {
  const [rows, setRows] = useState<CareListRow[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => setPage(1), [kind, psychologistId, patientId]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCareList(kind, { psychologistId, patientId, page, pageSize });
      setRows(result.rows);
      setTotal(result.total);
      onRowsLoaded?.(result.rows);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Não foi possível carregar os atendimentos.'));
    } finally {
      setLoading(false);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- onRowsLoaded é um aviso; mudar a função não recarrega a lista
  }, [kind, psychologistId, patientId, page, pageSize]);

  useEffect(() => {
    void load();
  }, [load]);

  const totalPages = Math.max(1, Math.ceil(total / pageSize));
  const Icon = kind === 'appointment' ? CalendarClock : LifeRingIcon;

  return (
    <Card>
      <CardHeader className="pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Icon className="h-4 w-4 text-primary" aria-hidden="true" />
          {title}
        </CardTitle>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <SkeletonList count={4} />
        ) : error ? (
          <ErrorState description={error} onRetry={() => void load()} />
        ) : rows.length === 0 ? (
          <EmptyState
            icon={Icon}
            title={kind === 'appointment' ? 'Nenhuma consulta registrada' : 'Nenhuma solicitação registrada'}
            description={kind === 'appointment' ? 'As consultas agendadas aparecerão aqui.' : 'Os pedidos de SOS aparecerão aqui.'}
          />
        ) : (
          <>
            <ul className="space-y-2" data-testid="admin-care-list">
              {rows.map((row) => (
                <li key={row.id}>
                  <button
                    type="button"
                    onClick={() => onSelect(row)}
                    className="w-full rounded-lg border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                    aria-label={`Ver detalhes: ${kind === 'appointment' ? 'consulta' : 'SOS'} de ${formatDateTime(row.at)}, ${row.patient_name}`}
                  >
                    <div className="flex flex-wrap items-center justify-between gap-2">
                      <span className="text-sm font-medium text-foreground">{formatDateTime(row.at)}</span>
                      <div className="flex items-center gap-1.5">
                        {row.has_transcript && (
                          <Badge variant="outline" className="gap-1 font-normal">
                            <FileText className="h-3 w-3" aria-hidden="true" /> Transcrição
                          </Badge>
                        )}
                        <Badge variant="outline" className={CARE_TONE_CLASS[careStatusTone(row.status)]}>
                          {careStatusLabel(kind, row.status)}
                        </Badge>
                      </div>
                    </div>
                    <div className="mt-1.5 grid grid-cols-1 gap-x-4 gap-y-1 text-xs text-muted-foreground sm:grid-cols-2 lg:grid-cols-4">
                      <span className="truncate">Paciente: {row.patient_name}</span>
                      <span className="truncate">
                        Psicólogo: {row.psychologist_name || (kind === 'sos' ? 'ninguém atendeu' : '—')}
                      </span>
                      <span>Duração: {formatDuration(row.seconds)}</span>
                      <span className="flex flex-wrap gap-x-3">
                        <Rating label="Nota do paciente" value={row.patient_rating} />
                        <Rating label="Nota do psicólogo" value={row.psychologist_rating} />
                      </span>
                    </div>
                  </button>
                </li>
              ))}
            </ul>

            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">
                  Página {page} de {totalPages} · {total} registros
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Página anterior">
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
  );
};

export default AdminCareList;

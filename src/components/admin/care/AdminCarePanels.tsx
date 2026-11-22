import { useCallback, useEffect, useState } from 'react';
import { useSearchParams } from 'react-router-dom';
import { ArrowLeft, ChevronLeft, ChevronRight, Search, Users } from 'lucide-react';
import { Card, CardContent, CardHeader, CardTitle } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { SkeletonList } from '@/components/skeletons/Skeletons';
import { SosMetricsSummary } from '@/components/sos/SosHistoryPanel';
import type { SosMetrics } from '@/hooks/useSosHistory';
import { supabase } from '@/integrations/supabase/client';
import { formatDateTime, formatDuration, formatRating } from '@/lib/sosHistory';
import {
  fetchAppointmentMetrics,
  fetchCarePeople,
  type AppointmentMetrics,
  type CareKind,
  type CareListRow,
  type CarePerson,
  type CareRole,
} from '@/lib/adminCare';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import AdminCareList from './AdminCareList';
import AdminCareDetailDialog from './AdminCareDetailDialog';

/** Lista + detalhes; o atendimento aberto fica na URL (?atendimento=id). */
const CareListWithDetail = ({
  kind,
  title,
  psychologistId,
  patientId,
  onRowsLoaded,
}: {
  kind: CareKind;
  title: string;
  psychologistId?: string | null;
  patientId?: string | null;
  onRowsLoaded?: (rows: CareListRow[]) => void;
}) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const openId = searchParams.get('atendimento');
  const setOpenId = (id: string | null) => {
    const next = new URLSearchParams(searchParams);
    if (id) next.set('atendimento', id);
    else next.delete('atendimento');
    setSearchParams(next);
  };
  return (
    <>
      <AdminCareList
        kind={kind}
        title={title}
        psychologistId={psychologistId}
        patientId={patientId}
        onSelect={(row) => setOpenId(row.id)}
        onRowsLoaded={onRowsLoaded}
      />
      <AdminCareDetailDialog kind={kind} id={openId} onClose={() => setOpenId(null)} />
    </>
  );
};

const Metric = ({ label, value }: { label: string; value: string }) => (
  <div className="rounded-lg border bg-card px-3 py-2.5">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-lg font-semibold text-foreground">{value}</p>
  </div>
);

/** Página "Consultas agendadas" do admin: números dos últimos 30 dias e a lista. */
export const AdminAppointmentsPanel = () => {
  const [metrics, setMetrics] = useState<AppointmentMetrics | null>(null);
  useEffect(() => {
    let active = true;
    fetchAppointmentMetrics(30)
      .then((data) => active && setMetrics(data))
      .catch((err) => console.error('Consultas: falha nos números', err));
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      {metrics && (
        <div className="grid grid-cols-2 gap-3 md:grid-cols-4" data-testid="admin-appointment-metrics">
          <Metric label="Consultas (30d)" value={String(metrics.total)} />
          <Metric label="Realizadas" value={String(metrics.completed)} />
          <Metric label="Canceladas" value={String(metrics.cancelled)} />
          <Metric label="Não compareceu" value={String(metrics.no_show)} />
          <Metric label="Próximas (30d)" value={String(metrics.upcoming)} />
          <Metric label="Tempo médio em chamada" value={formatDuration(metrics.avg_call_seconds)} />
          <Metric label="Com transcrição" value={String(metrics.transcribed)} />
          <Metric label="Avaliação do paciente" value={formatRating(metrics.avg_patient_rating)} />
        </div>
      )}
      <CareListWithDetail kind="appointment" title="Todas as consultas agendadas" />
    </div>
  );
};

/** Página "SOS" do admin: os números de sempre e a lista com detalhes. */
export const AdminSosPanel = () => {
  const [metrics, setMetrics] = useState<SosMetrics | null>(null);
  useEffect(() => {
    let active = true;
    void (async () => {
      const { data } = await supabase.rpc('get_sos_metrics', { p_days: 30 });
      if (active) setMetrics((data as unknown as SosMetrics) ?? null);
    })();
    return () => {
      active = false;
    };
  }, []);

  return (
    <div className="space-y-4">
      {metrics && <SosMetricsSummary metrics={metrics} />}
      <CareListWithDetail kind="sos" title="Todas as solicitações SOS" />
    </div>
  );
};

const PAGE_SIZE = 15;

/**
 * Psicólogos (ou pacientes) com consultas (ou SOS). Clicando numa pessoa,
 * os atendimentos dela; clicando num atendimento, os detalhes.
 * A pessoa aberta fica na URL (?pessoa=id).
 */
export const AdminCarePeoplePanel = ({ role, kind }: { role: CareRole; kind: CareKind }) => {
  const [searchParams, setSearchParams] = useSearchParams();
  const personId = searchParams.get('pessoa');
  const [people, setPeople] = useState<CarePerson[]>([]);
  const [total, setTotal] = useState(0);
  const [page, setPage] = useState(1);
  const [search, setSearch] = useState('');
  const [query, setQuery] = useState('');
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState<string | null>(null);
  const [selectedName, setSelectedName] = useState<string | null>(null);

  // Busca depois de uma pausa na digitação.
  useEffect(() => {
    const t = setTimeout(() => {
      setQuery(search);
      setPage(1);
    }, 300);
    return () => clearTimeout(t);
  }, [search]);

  const load = useCallback(async () => {
    setLoading(true);
    setError(null);
    try {
      const result = await fetchCarePeople(role, kind, { search: query, page, pageSize: PAGE_SIZE });
      setPeople(result.rows);
      setTotal(result.total);
    } catch (err) {
      setError(getFriendlyErrorMessage(err, 'Não foi possível carregar a lista.'));
    } finally {
      setLoading(false);
    }
  }, [role, kind, query, page]);

  useEffect(() => {
    if (!personId) void load();
  }, [load, personId]);

  const roleLabel = role === 'psychologist' ? 'Psicólogo' : 'Paciente';
  const careLabel = kind === 'appointment' ? 'consultas agendadas' : 'SOS';

  const openPerson = (person: CarePerson) => {
    setSelectedName(person.full_name);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.set('pessoa', person.user_id);
      next.delete('atendimento');
      return next;
    });
  };
  const closePerson = () => {
    setSelectedName(null);
    setSearchParams((prev) => {
      const next = new URLSearchParams(prev);
      next.delete('pessoa');
      next.delete('atendimento');
      return next;
    });
  };

  if (personId) {
    const name = selectedName ?? people.find((p) => p.user_id === personId)?.full_name ?? roleLabel;
    return (
      <div className="space-y-3">
        <Button variant="ghost" size="sm" onClick={closePerson}>
          <ArrowLeft className="h-4 w-4" aria-hidden="true" />
          Voltar para a lista
        </Button>
        <CareListWithDetail
          kind={kind}
          title={`${kind === 'appointment' ? 'Consultas agendadas' : 'SOS'} · ${name}`}
          psychologistId={role === 'psychologist' ? personId : null}
          patientId={role === 'patient' ? personId : null}
          onRowsLoaded={(rows) => {
            const first = rows[0];
            if (!selectedName && first) setSelectedName(role === 'psychologist' ? first.psychologist_name : first.patient_name);
          }}
        />
      </div>
    );
  }

  const totalPages = Math.max(1, Math.ceil(total / PAGE_SIZE));

  return (
    <Card>
      <CardHeader className="space-y-3 pb-2">
        <CardTitle className="flex items-center gap-2 text-base">
          <Users className="h-4 w-4 text-primary" aria-hidden="true" />
          {role === 'psychologist' ? 'Psicólogos' : 'Pacientes'} com {careLabel}
        </CardTitle>
        <div className="relative">
          <Search className="pointer-events-none absolute left-3 top-1/2 h-4 w-4 -translate-y-1/2 text-muted-foreground" aria-hidden="true" />
          <Input
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Buscar por nome ou e-mail"
            aria-label="Buscar por nome ou e-mail"
            className="pl-9"
          />
        </div>
      </CardHeader>
      <CardContent className="space-y-3">
        {loading ? (
          <SkeletonList count={5} />
        ) : error ? (
          <ErrorState description={error} onRetry={() => void load()} />
        ) : people.length === 0 ? (
          <EmptyState
            icon={Users}
            title={query ? 'Ninguém encontrado' : `Nenhum ${roleLabel.toLowerCase()} com ${careLabel}`}
            description={query ? 'Tente outro nome ou e-mail.' : 'Quando houver atendimentos, eles aparecem aqui.'}
          />
        ) : (
          <>
            <ul className="space-y-2" data-testid="admin-care-people">
              {people.map((person) => (
                <li key={person.user_id}>
                  <button
                    type="button"
                    onClick={() => openPerson(person)}
                    className="flex w-full flex-wrap items-center justify-between gap-2 rounded-lg border bg-card px-3 py-3 text-left transition-colors hover:bg-muted/40 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-ring"
                  >
                    <span className="min-w-0">
                      <span className="block truncate text-sm font-medium text-foreground">{person.full_name}</span>
                      {person.email && <span className="block truncate text-xs text-muted-foreground">{person.email}</span>}
                    </span>
                    <span className="text-right text-xs text-muted-foreground">
                      <span className="block font-medium text-foreground">
                        {person.care_count} {kind === 'appointment' ? (person.care_count === 1 ? 'consulta' : 'consultas') : 'SOS'}
                      </span>
                      Último: {formatDateTime(person.last_at)}
                    </span>
                  </button>
                </li>
              ))}
            </ul>
            {totalPages > 1 && (
              <div className="flex items-center justify-between pt-1">
                <span className="text-xs text-muted-foreground">
                  Página {page} de {totalPages} · {total} pessoas
                </span>
                <div className="flex gap-2">
                  <Button variant="outline" size="sm" disabled={page === 1} onClick={() => setPage(page - 1)} aria-label="Página anterior">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <Button variant="outline" size="sm" disabled={page === totalPages} onClick={() => setPage(page + 1)} aria-label="Próxima página">
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

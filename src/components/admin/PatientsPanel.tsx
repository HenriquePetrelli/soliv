import { useMemo, useState } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import {
  AlertDialog,
  AlertDialogAction,
  AlertDialogCancel,
  AlertDialogContent,
  AlertDialogDescription,
  AlertDialogFooter,
  AlertDialogHeader,
  AlertDialogTitle,
} from '@/components/ui/alert-dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import {
  AlertTriangle,
  Ban,
  IdCard,
  ShieldCheck,
  ChevronLeft,
  ChevronRight,
  Download,
  Eye,
  MapPin,
  MoreHorizontal,
  Pencil,
  Search,
  Trash2,
  Unlock,
  UserCheck,
  Users,
} from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import { usePatientManagement, type AdminPatient } from '@/hooks/usePatientManagement';
import { BlockPatientModal } from './BlockPatientModal';
import { EditPatientModal } from './EditPatientModal';
import { isCurrentlyBlocked, formatBlockPeriod, formatRemainingTime } from '@/utils/psychologistBlock';
import { SkeletonTable } from '@/components/skeletons/Skeletons';
import { ContentTransition } from '@/components/skeletons/ContentTransition';
import { EmptyState } from '@/components/EmptyState';
import { ErrorState } from '@/components/ErrorState';
import { IdentityStatusBadge } from './IdentityStatusBadge';
import { IdentityVerificationDialog } from './IdentityVerificationDialog';
import { IDENTITY_STATUS_LABEL, parseIdentityStatus, type IdentityStatus } from '@/lib/identityVerification';

type IdentityFilter = 'all' | IdentityStatus;

export const PatientsPanel = ({ onDataChange }: { onDataChange?: () => void } = {}) => {
  const { patients, loading, error, fetchPatients, setPatients } = usePatientManagement();
  const [identityFilter, setIdentityFilter] = useState<IdentityFilter>('all');
  const [identityTarget, setIdentityTarget] = useState<AdminPatient | null>(null);
  // Fila de verificação (igual à rotina do CRP): ids na ordem de envio.
  const [routine, setRoutine] = useState<{ queue: string[]; index: number; approved: number; rejected: number } | null>(null);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [detailPatient, setDetailPatient] = useState<AdminPatient | null>(null);
  const [editPatient, setEditPatient] = useState<AdminPatient | null>(null);
  const [blockTarget, setBlockTarget] = useState<{ patient: AdminPatient; mode: 'block' | 'unblock' } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminPatient | null>(null);
  const [deleting, setDeleting] = useState(false);

  const identityCounts = useMemo(() => {
    const counts: Record<IdentityStatus, number> = { nao_enviado: 0, pendente: 0, aprovado: 0, recusado: 0 };
    patients.forEach((p) => { counts[parseIdentityStatus(p.identity_status)] += 1; });
    return counts;
  }, [patients]);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    const byIdentity = identityFilter === 'all'
      ? patients
      : patients.filter((p) => parseIdentityStatus(p.identity_status) === identityFilter);
    const list = identityFilter === 'pendente'
      ? [...byIdentity].sort((a, b) => (a.identity_submitted_at ?? '').localeCompare(b.identity_submitted_at ?? ''))
      : byIdentity;
    if (!term) return list;
    return list.filter((p) =>
      [p.full_name, p.email, p.cpf, p.city, p.state].some((v) => (v || '').toLowerCase().includes(term))
    );
  }, [patients, search, identityFilter]);

  // Mais antigos primeiro: o prazo prometido ao paciente é de 24 horas.
  const pendingQueue = useMemo(
    () => patients
      .filter((p) => parseIdentityStatus(p.identity_status) === 'pendente')
      .sort((a, b) => (a.identity_submitted_at ?? '').localeCompare(b.identity_submitted_at ?? ''))
      .map((p) => p.id),
    [patients],
  );
  const overdueCount = useMemo(
    () => patients.filter((p) =>
      parseIdentityStatus(p.identity_status) === 'pendente' &&
      p.identity_submitted_at &&
      Date.now() - new Date(p.identity_submitted_at).getTime() > 24 * 60 * 60 * 1000,
    ).length,
    [patients],
  );

  const startRoutine = () => {
    if (pendingQueue.length === 0) return toast.info('Nenhuma identidade aguardando verificação.');
    setRoutine({ queue: pendingQueue, index: 0, approved: 0, rejected: 0 });
  };

  const finishRoutine = (r: { approved: number; rejected: number }) => {
    setRoutine(null);
    if (r.approved + r.rejected > 0) toast.success(`Verificação encerrada: ${r.approved} aprovada(s), ${r.rejected} recusada(s).`);
  };

  const advanceRoutine = (result: 'approved' | 'rejected' | 'skipped') => {
    if (!routine) return;
    const next = {
      ...routine,
      index: routine.index + 1,
      approved: routine.approved + (result === 'approved' ? 1 : 0),
      rejected: routine.rejected + (result === 'rejected' ? 1 : 0),
    };
    if (next.index >= next.queue.length) finishRoutine(next);
    else setRoutine(next);
  };

  const handleIdentityReviewed = (patientId: string, approved: boolean) => {
    const now = new Date().toISOString();
    // Atualiza a lista na hora (sem esperar recarregar) para a fila seguir.
    setPatients((prev) => prev.map((p) => (p.id === patientId
      ? { ...p, identity_status: approved ? 'aprovado' : 'recusado', identity_reviewed_at: now }
      : p)));
    onDataChange?.();
    if (routine) {
      advanceRoutine(approved ? 'approved' : 'rejected');
    } else {
      setIdentityTarget(null);
      void fetchPatients();
    }
  };

  const routinePatient = routine ? patients.find((p) => p.id === routine.queue[routine.index]) ?? null : null;

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleExportCsv = () => {
    if (filtered.length === 0) return toast.error('Nenhum paciente para exportar');
    const headers = ['Nome', 'Email', 'CPF', 'Telefone', 'Estado', 'Cidade', 'Status', 'Identidade', 'Cadastro'];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = filtered.map((p) => [
      p.full_name,
      p.email,
      p.cpf || '',
      p.phone || '',
      p.state || '',
      p.city || '',
      isCurrentlyBlocked(p) ? 'Bloqueado' : 'Ativo',
      IDENTITY_STATUS_LABEL[parseIdentityStatus(p.identity_status)],
      p.created_at ? new Date(p.created_at).toLocaleDateString('pt-BR') : '',
    ]);
    const csv = [headers, ...rows].map((r) => r.map(escape).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `pacientes-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`${filtered.length} registro(s) exportado(s)`);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    setDeleting(true);
    try {
      const { data, error: fnError } = await supabase.functions.invoke('admin-delete-patient', {
        body: { patient_id: deleteTarget.id },
      });
      if (fnError) throw fnError;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.warning || data?.message || 'Paciente excluído');
      setDeleteTarget(null);
      fetchPatients();
    } catch (err: unknown) {
      toast.error(getFriendlyErrorMessage(err, 'Erro ao excluir paciente'));
    } finally {
      setDeleting(false);
    }
  };

  const statusBadge = (p: AdminPatient) =>
    isCurrentlyBlocked(p) ? (
      <Badge className="bg-foreground text-background hover:bg-foreground">Bloqueado</Badge>
    ) : (
      <Badge className="bg-success/15 text-success hover:bg-success/15 border-success/20">Ativo</Badge>
    );

  return (
    <div className="space-y-4">
      <div className="flex sm:justify-end">
        <div className="flex flex-wrap gap-2 w-full sm:w-auto">
          <Button
            variant="outline"
            size="sm"
            onClick={startRoutine}
            disabled={loading || !!routine}
            className="flex-1 sm:flex-none"
          >
            <ShieldCheck className="h-4 w-4 mr-2" />
            Verificar identidades{identityCounts.pendente > 0 ? ` (${identityCounts.pendente})` : ''}
          </Button>
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={filtered.length === 0} className="flex-1 sm:flex-none">
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
          <Button onClick={fetchPatients} disabled={loading} size="sm" className="flex-1 sm:flex-none">
            {loading ? 'Carregando...' : 'Atualizar'}
          </Button>
        </div>
      </div>

      {identityCounts.pendente > 0 && identityFilter !== 'pendente' && (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
            <span>
              {identityCounts.pendente} paciente(s) aguardando verificação de identidade
              {overdueCount > 0 ? `, ${overdueCount} há mais de 24 horas` : ''}. Sem a verificação, eles não usam o SOS nem agendam consultas.
            </span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => { setIdentityFilter('pendente'); setPage(1); }}>
              Ver lista
            </Button>
            <Button size="sm" onClick={startRoutine} disabled={!!routine}>
              <ShieldCheck className="h-4 w-4 mr-2" />
              Iniciar verificação
            </Button>
          </div>
        </div>
      )}

      <Tabs value={identityFilter} onValueChange={(v) => { setIdentityFilter(v as IdentityFilter); setPage(1); }} className="w-full">
        <TabsList className="w-full h-auto p-1 bg-muted/60 grid grid-cols-2 sm:grid-cols-5 gap-1 rounded-lg">
          <TabsTrigger value="all" className="text-xs sm:text-sm data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">Todos ({patients.length})</TabsTrigger>
          <TabsTrigger value="pendente" className="text-xs sm:text-sm data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">Verificar identidade ({identityCounts.pendente})</TabsTrigger>
          <TabsTrigger value="aprovado" className="text-xs sm:text-sm data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">Confirmadas ({identityCounts.aprovado})</TabsTrigger>
          <TabsTrigger value="recusado" className="text-xs sm:text-sm data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">Recusadas ({identityCounts.recusado})</TabsTrigger>
          <TabsTrigger value="nao_enviado" className="text-xs sm:text-sm data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">Não enviadas ({identityCounts.nao_enviado})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => handleSearch(e.target.value)}
          placeholder="Pesquisar por nome, e-mail, CPF ou cidade"
          className="pl-9"
        />
      </div>

      {error ? (
        <ErrorState description={error} onRetry={fetchPatients} retrying={loading} />
      ) : (
        <ContentTransition loading={loading} skeleton={<SkeletonTable rows={6} cols={5} />}>
          {filtered.length === 0 ? (
            <EmptyState
              icon={Users}
              title={identityFilter === 'pendente' && !search ? 'Nenhuma identidade para verificar' : 'Nenhum paciente encontrado'}
              description={
                search
                  ? 'Ajuste a pesquisa para encontrar outros pacientes.'
                  : identityFilter === 'pendente'
                    ? 'Todas as identidades enviadas já foram conferidas.'
                    : identityFilter !== 'all'
                      ? 'Nenhum paciente nesta situação.'
                      : 'Ainda não há pacientes cadastrados.'
              }
            />
          ) : (
            <Card className="overflow-hidden">
              <div className="overflow-x-auto">
                <Table>
                  <TableHeader>
                    <TableRow className="bg-muted/60 hover:bg-muted/60">
                      <TableHead>Nome</TableHead>
                      <TableHead className="hidden md:table-cell">E-mail</TableHead>
                      <TableHead className="hidden lg:table-cell">CPF</TableHead>
                      <TableHead className="hidden lg:table-cell">Localização</TableHead>
                      <TableHead className="hidden sm:table-cell">Identidade</TableHead>
                      <TableHead>Status</TableHead>
                      <TableHead className="w-14 text-right">Ações</TableHead>
                    </TableRow>
                  </TableHeader>
                  <TableBody>
                    {paginated.map((p) => {
                      const blocked = isCurrentlyBlocked(p);
                      return (
                        <TableRow
                          key={p.id}
                          className="cursor-pointer"
                          onClick={() => setDetailPatient(p)}
                        >
                          <TableCell className="font-medium">
                            <div>{p.full_name}</div>
                            <div className="text-xs text-muted-foreground md:hidden">{p.email}</div>
                          </TableCell>
                          <TableCell className="hidden md:table-cell text-sm">{p.email}</TableCell>
                          <TableCell className="hidden lg:table-cell text-sm">{p.cpf || '—'}</TableCell>
                          <TableCell className="hidden lg:table-cell text-sm">
                            {[p.city, p.state].filter(Boolean).join(' - ') || '—'}
                          </TableCell>
                          <TableCell className="hidden sm:table-cell" onClick={(e) => e.stopPropagation()}>
                            <button type="button" onClick={() => setIdentityTarget(p)} title="Verificar identidade">
                              <IdentityStatusBadge patient={p} />
                            </button>
                          </TableCell>
                          <TableCell>{statusBadge(p)}</TableCell>
                          <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                            <DropdownMenu>
                              <DropdownMenuTrigger asChild>
                                <Button variant="ghost" size="icon" className="h-8 w-8" aria-label="Mais opções">
                                  <MoreHorizontal className="h-4 w-4" />
                                </Button>
                              </DropdownMenuTrigger>
                              <DropdownMenuContent align="end">
                                <DropdownMenuItem onClick={() => setDetailPatient(p)}>
                                  <Eye className="h-4 w-4 mr-2" /> Detalhes
                                </DropdownMenuItem>
                                <DropdownMenuItem onClick={() => setIdentityTarget(p)}>
                                  <IdCard className="h-4 w-4 mr-2" /> Verificar identidade
                                </DropdownMenuItem>
                                <DropdownMenuItem
                                  onClick={() => setBlockTarget({ patient: p, mode: blocked ? 'unblock' : 'block' })}
                                >
                                  {blocked ? (
                                    <>
                                      <Unlock className="h-4 w-4 mr-2" /> Desbloquear
                                    </>
                                  ) : (
                                    <>
                                      <Ban className="h-4 w-4 mr-2" /> Bloquear
                                    </>
                                  )}
                                </DropdownMenuItem>
                                <DropdownMenuItem className="text-destructive focus:text-destructive" onClick={() => setDeleteTarget(p)}>
                                  <Trash2 className="h-4 w-4 mr-2" /> Excluir
                                </DropdownMenuItem>
                              </DropdownMenuContent>
                            </DropdownMenu>
                          </TableCell>
                        </TableRow>
                      );
                    })}
                  </TableBody>
                </Table>
              </div>

              <div className="flex flex-col sm:flex-row items-center justify-between gap-3 p-3 border-t">
                <p className="text-xs text-muted-foreground">
                  Mostrando {(currentPage - 1) * pageSize + 1}–{Math.min(currentPage * pageSize, filtered.length)} de {filtered.length}
                </p>
                <div className="flex items-center gap-2">
                  <Select value={String(pageSize)} onValueChange={(v) => { setPageSize(Number(v)); setPage(1); }}>
                    <SelectTrigger className="h-8 w-[92px]">
                      <SelectValue />
                    </SelectTrigger>
                    <SelectContent>
                      {[10, 25, 50].map((n) => (
                        <SelectItem key={n} value={String(n)}>{n} / pág</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage <= 1} onClick={() => setPage(currentPage - 1)} aria-label="Página anterior">
                    <ChevronLeft className="h-4 w-4" />
                  </Button>
                  <span className="text-xs text-muted-foreground">{currentPage} / {totalPages}</span>
                  <Button variant="outline" size="icon" className="h-8 w-8" disabled={currentPage >= totalPages} onClick={() => setPage(currentPage + 1)} aria-label="Próxima página">
                    <ChevronRight className="h-4 w-4" />
                  </Button>
                </div>
              </div>
            </Card>
          )}
        </ContentTransition>
      )}

      {/* Detalhes */}
      <Dialog open={!!detailPatient} onOpenChange={(open) => !open && setDetailPatient(null)}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Detalhes do Paciente</DialogTitle>
            <DialogDescription>Informações completas do cadastro</DialogDescription>
          </DialogHeader>
          {detailPatient && (
            <div className="space-y-6">
              <div className="flex justify-end">
                <Button variant="outline" size="sm" onClick={() => setEditPatient(detailPatient)}>
                  <Pencil className="h-4 w-4 mr-2" />
                  Editar informações
                </Button>
              </div>

              {/* Seção de Status */}
              <div className="border rounded-lg p-4 bg-muted/20">
                <div className="flex items-center gap-2 mb-3">
                  <UserCheck className="h-4 w-4" />
                  <span className="text-sm font-medium">Status da Conta</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status Atual</label>
                    <div className="mt-1">{statusBadge(detailPatient)}</div>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Data de Cadastro</label>
                    <p className="text-sm text-muted-foreground mt-1">
                      {detailPatient.created_at ? new Date(detailPatient.created_at).toLocaleString('pt-BR') : 'Não informado'}
                    </p>
                  </div>
                </div>
                {isCurrentlyBlocked(detailPatient) && (
                  <div className="mt-4 space-y-2">
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bloqueio</label>
                    <div className="text-sm p-3 bg-muted rounded-md border">
                      <p className="font-medium">
                        {formatBlockPeriod(detailPatient)} ({formatRemainingTime(detailPatient.blocked_until)})
                      </p>
                      <p className="text-muted-foreground mt-1">
                        Motivo: {detailPatient.blocked_reason || 'Não informado'}
                      </p>
                    </div>
                  </div>
                )}
              </div>

              {/* Identidade */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center justify-between gap-2 mb-3">
                  <div className="flex items-center gap-2">
                    <IdCard className="h-4 w-4" />
                    <span className="text-sm font-medium">Identidade</span>
                  </div>
                  <IdentityStatusBadge patient={detailPatient} />
                </div>
                <p className="text-sm text-muted-foreground">
                  {parseIdentityStatus(detailPatient.identity_status) === 'aprovado'
                    ? 'Identidade confirmada: SOS e agendamento liberados.'
                    : parseIdentityStatus(detailPatient.identity_status) === 'pendente'
                      ? 'Documento enviado, aguardando a sua verificação.'
                      : parseIdentityStatus(detailPatient.identity_status) === 'recusado'
                        ? `Recusada${detailPatient.identity_rejection_reason ? `: ${detailPatient.identity_rejection_reason}` : ''}. Aguardando novo envio.`
                        : 'O paciente ainda não enviou o documento. SOS e agendamento ficam bloqueados.'}
                </p>
                <Button
                  variant="outline"
                  size="sm"
                  className="mt-3"
                  onClick={() => { setIdentityTarget(detailPatient); setDetailPatient(null); }}
                >
                  <ShieldCheck className="h-4 w-4 mr-2" />
                  {parseIdentityStatus(detailPatient.identity_status) === 'pendente' ? 'Verificar documento' : 'Ver verificação'}
                </Button>
              </div>

              {/* Seção de Informações Básicas */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <Users className="h-4 w-4" />
                  <span className="text-sm font-medium">Informações Básicas</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nome Completo</label>
                    <p className="text-sm text-muted-foreground mt-1">{detailPatient.full_name}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CPF</label>
                    <p className="text-sm text-muted-foreground mt-1">{detailPatient.cpf || 'Não informado'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">E-mail</label>
                    <p className="text-sm text-muted-foreground mt-1 break-words">{detailPatient.email}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Telefone</label>
                    <p className="text-sm text-muted-foreground mt-1">{detailPatient.phone || 'Não informado'}</p>
                  </div>
                </div>
              </div>

              {/* Seção de Localização */}
              <div className="border rounded-lg p-4">
                <div className="flex items-center gap-2 mb-3">
                  <MapPin className="h-4 w-4" />
                  <span className="text-sm font-medium">Localização</span>
                </div>
                <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Estado</label>
                    <p className="text-sm text-muted-foreground mt-1">{detailPatient.state || 'Não informado'}</p>
                  </div>
                  <div>
                    <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cidade</label>
                    <p className="text-sm text-muted-foreground mt-1">{detailPatient.city || 'Não informado'}</p>
                  </div>
                </div>
              </div>

              <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
                {isCurrentlyBlocked(detailPatient) ? (
                  <Button
                    className="flex-1 bg-success text-success-foreground hover:bg-success/90"
                    onClick={() => { setBlockTarget({ patient: detailPatient, mode: 'unblock' }); setDetailPatient(null); }}
                  >
                    <Unlock className="h-4 w-4 mr-2" /> Desbloquear
                  </Button>
                ) : (
                  <Button
                    variant="destructive"
                    className="flex-1"
                    onClick={() => { setBlockTarget({ patient: detailPatient, mode: 'block' }); setDetailPatient(null); }}
                  >
                    <Ban className="h-4 w-4 mr-2" /> Bloquear
                  </Button>
                )}
              </div>
            </div>
          )}
        </DialogContent>
      </Dialog>


      {routine && routinePatient ? (
        <IdentityVerificationDialog
          open
          onOpenChange={(o) => { if (!o) finishRoutine(routine); }}
          patient={routinePatient}
          onReviewed={handleIdentityReviewed}
          routine={{
            position: routine.index + 1,
            total: routine.queue.length,
            onSkip: () => advanceRoutine('skipped'),
            onStop: () => finishRoutine(routine),
          }}
        />
      ) : identityTarget && (
        <IdentityVerificationDialog
          open={!!identityTarget}
          onOpenChange={(o) => { if (!o) setIdentityTarget(null); }}
          patient={identityTarget}
          onReviewed={handleIdentityReviewed}
        />
      )}

      {blockTarget && (
        <BlockPatientModal
          open={!!blockTarget}
          onOpenChange={(open) => !open && setBlockTarget(null)}
          patientId={blockTarget.patient.id}
          patientName={blockTarget.patient.full_name}
          mode={blockTarget.mode}
          blockInfo={blockTarget.patient}
          onDone={() => { setBlockTarget(null); fetchPatients(); }}
        />
      )}

      <EditPatientModal
        open={!!editPatient}
        onOpenChange={(open) => !open && setEditPatient(null)}
        patient={editPatient}
        onSaved={() => { setEditPatient(null); fetchPatients(); }}
      />

      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir paciente permanentemente?</AlertDialogTitle>
            <AlertDialogDescription>
              Todos os dados de {deleteTarget?.full_name} serão removidos definitivamente, incluindo consultas,
              registros e a conta de acesso. Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={deleting}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => { e.preventDefault(); handleDelete(); }}
              disabled={deleting}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {deleting ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>
    </div>
  );
};

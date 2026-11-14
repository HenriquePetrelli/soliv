import { useState, useEffect, useMemo } from 'react';
import { Card } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle, AlertDialogTrigger } from '@/components/ui/alert-dialog';
import { Tabs, TabsList, TabsTrigger } from '@/components/ui/tabs';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { DropdownMenu, DropdownMenuContent, DropdownMenuItem, DropdownMenuTrigger } from '@/components/ui/dropdown-menu';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Eye, CheckCircle, XCircle, FileText, Download, MapPin, UserCheck, User, Users, Pencil, Ban, Unlock, Search, MoreHorizontal, Trash2, ChevronLeft, ChevronRight, ShieldCheck, AlertTriangle } from 'lucide-react';
import { usePsychologistManagement, PsychologistData } from '@/hooks/usePsychologistManagement';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import { DocumentViewer } from './DocumentViewer';
import { EditPsychologistModal } from './EditPsychologistModal';
import { BlockPsychologistModal } from './BlockPsychologistModal';
import { isCurrentlyBlocked, formatBlockPeriod } from '@/utils/psychologistBlock';
import { SkeletonCardGrid } from '@/components/skeletons/Skeletons';
import { ContentTransition } from '@/components/skeletons/ContentTransition';
import { extractDocumentRef, openStorageDocument } from '@/lib/storageDocument';

import { EmptyState } from '@/components/EmptyState';
import { CrpStatusBadge } from './CrpStatusBadge';
import { CrpVerificationDialog } from './CrpVerificationDialog';
import { canApproveWithCrp, CRP_APPROVAL_MAX_AGE_DAYS, needsCrpCheck } from '@/lib/crpVerification';
import { ErrorState } from '@/components/ErrorState';


interface PsychologistApprovalPanelProps {
  adminUserId: string;
  onDataChange?: () => void;
}

export const PsychologistApprovalPanel = ({ adminUserId, onDataChange }: PsychologistApprovalPanelProps) => {
  const [selectedPsychologist, setSelectedPsychologist] = useState<PsychologistData | null>(null);
  const [rejectionReason, setRejectionReason] = useState('');
  const [filter, setFilter] = useState<'all' | 'pending' | 'approved' | 'rejected' | 'crp'>('pending');
  const [editOpen, setEditOpen] = useState(false);
  const [blockTarget, setBlockTarget] = useState<PsychologistData | null>(null);
  const [blockMode, setBlockMode] = useState<'block' | 'unblock'>('block');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);
  const [detailsOpen, setDetailsOpen] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState<PsychologistData | null>(null);
  const [deletingId, setDeletingId] = useState<string | null>(null);
  const [crpTarget, setCrpTarget] = useState<PsychologistData | null>(null);
  // Verificação de rotina: fila fixa no início, um psicólogo por vez.
  const [routine, setRoutine] = useState<{ ids: string[]; index: number; ok: number; problems: number; skipped: number } | null>(null);

  const {
    loading,
    error,
    pendingPsychologists,
    getPendingPsychologists,
    getPsychologistDetails,
    approvePsychologist,
    rejectPsychologist,
    verifyCrp
  } = usePsychologistManagement();

  useEffect(() => {
    getPendingPsychologists();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, []);

  const handleViewDetails = async (psychologist: PsychologistData) => {
    setSelectedPsychologist(psychologist);
    setDetailsOpen(true);
    const details = await getPsychologistDetails(psychologist.id);
    if (details) {
      setSelectedPsychologist(details);
    }
  };


  const handleApprove = async (psychologistId: string) => {
    const result = await approvePsychologist(psychologistId, adminUserId);
    if (result.success) {
      setDetailsOpen(false);
      setSelectedPsychologist(null);
      onDataChange?.();
    }
  };

  const handleReject = async (psychologistId: string) => {
    const result = await rejectPsychologist(psychologistId, adminUserId, rejectionReason);
    if (result.success) {
      setDetailsOpen(false);
      setSelectedPsychologist(null);
      setRejectionReason('');
      onDataChange?.();
    }
  };


  const getStatusBadge = (status: string, psych?: PsychologistData) => {
    if (isCurrentlyBlocked(psych)) {
      return <Badge className="bg-black text-white hover:bg-black">Bloqueado</Badge>;
    }
    switch (status) {
      case 'pending':
        return <Badge variant="secondary">Pendente</Badge>;
      case 'approved':
        return <Badge variant="default" className="bg-success">Aprovado</Badge>;
      case 'rejected':
        return <Badge variant="destructive">Rejeitado</Badge>;
      default:
        return <Badge variant="outline">Desconhecido</Badge>;
    }
  };

  const filteredPsychologists = useMemo(() => {
    const term = search.trim().toLowerCase();
    return pendingPsychologists.filter((psych) => {
      const statusOk =
        filter === 'all' ||
        (filter === 'crp' ? psych.approval_status === 'approved' && needsCrpCheck(psych) : psych.approval_status === filter);
      if (!statusOk) return false;
      if (!term) return true;
      return (
        psych.full_name?.toLowerCase().includes(term) ||
        psych.email?.toLowerCase().includes(term) ||
        psych.crp_number?.toLowerCase().includes(term)
      );
    });
  }, [pendingPsychologists, filter, search]);

  // Verificação de rotina: aprovados com CRP nunca conferido, conferido há
  // mais de 6 meses ou com problema na última consulta ao CFP.
  const crpDueCount = useMemo(
    () => pendingPsychologists.filter((p) => p.approval_status === 'approved' && needsCrpCheck(p)).length,
    [pendingPsychologists]
  );

  const handleCrpVerified = (updated: PsychologistData) => {
    setSelectedPsychologist((current) => (current?.id === updated.id ? { ...current, ...updated } : current));
    onDataChange?.();
    if (routine) advanceRoutine(updated.crp_status === 'ativo' ? 'ok' : 'problems');
  };

  const startRoutine = () => {
    // Problemas da última consulta primeiro, depois nunca conferidos, depois os mais antigos.
    const rank = (p: PsychologistData) => (p.crp_status === 'irregular' || p.crp_status === 'nao_encontrado' ? 0 : p.crp_verified_at ? 2 : 1);
    const ids = pendingPsychologists
      .filter((p) => p.approval_status === 'approved' && needsCrpCheck(p))
      .sort((a, b) => rank(a) - rank(b) || (a.crp_verified_at ?? '').localeCompare(b.crp_verified_at ?? ''))
      .map((p) => p.id);
    if (ids.length === 0) {
      toast.success('Todos os CRPs foram conferidos no CFP nos últimos 6 meses');
      return;
    }
    setCrpTarget(null);
    setDetailsOpen(false);
    setRoutine({ ids, index: 0, ok: 0, problems: 0, skipped: 0 });
  };

  const finishRoutine = (r: NonNullable<typeof routine>, early: boolean) => {
    setRoutine(null);
    const parts = [`${r.ok} ativo(s)`];
    if (r.problems) parts.push(`${r.problems} com problema`);
    if (r.skipped) parts.push(`${r.skipped} pulado(s)`);
    const left = r.ids.length - r.index;
    if (early && left > 0) {
      toast.info(`Rotina pausada: ${parts.join(', ')}. Faltam ${left}; eles continuam na aba Verificar CRP.`);
    } else if (r.problems) {
      toast.warning(`Rotina concluída: ${parts.join(', ')}. Veja os com problema na aba Verificar CRP.`);
    } else {
      toast.success(`Rotina concluída: ${parts.join(', ')}.`);
    }
  };

  const advanceRoutine = (outcome: 'ok' | 'problems' | 'skipped') => {
    if (!routine) return;
    const next = { ...routine, [outcome]: routine[outcome] + 1, index: routine.index + 1 };
    if (next.index >= next.ids.length) finishRoutine(next, false);
    else setRoutine(next);
  };

  const routineTarget = routine ? pendingPsychologists.find((p) => p.id === routine.ids[routine.index]) ?? null : null;

  // Saiu da lista no meio da rotina (excluído, por exemplo): pula.
  useEffect(() => {
    if (routine && !routineTarget) advanceRoutine('skipped');
  // eslint-disable-next-line react-hooks/exhaustive-deps -- só quando o alvo some
  }, [routine, routineTarget]);

  const handleExportCsv = () => {
    if (filteredPsychologists.length === 0) {
      toast.error('Nenhum psicólogo para exportar');
      return;
    }
    const statusLabels: Record<string, string> = {
      pending: 'Pendente',
      approved: 'Aprovado',
      rejected: 'Rejeitado',
    };
    const headers = ['Nome', 'Email', 'CPF', 'CRP', 'Especialização', 'Estado', 'Cidade', 'Status', 'Bloqueado'];
    const escape = (value: unknown) => `"${String(value ?? '').replace(/"/g, '""')}"`;
    const rows = filteredPsychologists.map((p) => [
      p.full_name,
      p.email,
      p.cpf || '',
      p.crp_number,
      p.specialization || '',
      p.state || '',
      p.city || '',
      isCurrentlyBlocked(p) ? 'Bloqueado' : (statusLabels[p.approval_status] || p.approval_status),
      isCurrentlyBlocked(p) ? formatBlockPeriod(p) : 'Não',
    ]);
    const csv = [headers, ...rows].map((row) => row.map(escape).join(';')).join('\n');
    const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `psicologos-${new Date().toISOString().slice(0, 10)}.csv`;
    link.click();
    URL.revokeObjectURL(url);
    toast.success(`${filteredPsychologists.length} registro(s) exportado(s)`);
  };

  const totalPages = Math.max(1, Math.ceil(filteredPsychologists.length / pageSize));
  const currentPage = Math.min(page, totalPages);

  useEffect(() => {
    setPage(1);
  }, [filter, search, pageSize]);

  const pagedPsychologists = useMemo(
    () => filteredPsychologists.slice((currentPage - 1) * pageSize, currentPage * pageSize),
    [filteredPsychologists, currentPage, pageSize]
  );

  const handleDelete = async (psychologist: PsychologistData) => {
    setDeletingId(psychologist.id);
    try {
      const { data, error } = await supabase.functions.invoke('admin-delete-psychologist', {
        body: { psychologist_id: psychologist.id },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      if (data?.warning) toast.warning(data.warning);
      else toast.success('Psicólogo excluído permanentemente');
      setDetailsOpen(false);
      setSelectedPsychologist(null);
      getPendingPsychologists();
      onDataChange?.();
    } catch (err: unknown) {
      toast.error(getFriendlyErrorMessage(err, 'Erro ao excluir psicólogo'));
    } finally {
      setDeletingId(null);
    }
  };


  return (
    <div className="space-y-4 sm:space-y-6">
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
            Verificação de rotina do CRP{crpDueCount > 0 ? ` (${crpDueCount})` : ''}
          </Button>
          <Button
            variant="outline"
            size="sm"
            onClick={handleExportCsv}
            disabled={filteredPsychologists.length === 0}
            className="flex-1 sm:flex-none"
          >
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
          <Button onClick={getPendingPsychologists} disabled={loading} size="sm" className="flex-1 sm:flex-none">
            {loading ? 'Carregando...' : 'Atualizar'}
          </Button>
        </div>
      </div>

      {crpDueCount > 0 && filter !== 'crp' && (
        <div className="flex flex-col gap-2 rounded-lg border border-warning/30 bg-warning/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
          <div className="flex items-start gap-2">
            <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
            <span>
              {crpDueCount} psicólogo(s) aprovado(s) com CRP sem verificação no CFP nos últimos 6 meses (ou com problema na última consulta).
            </span>
          </div>
          <div className="flex gap-2">
            <Button size="sm" variant="outline" onClick={() => setFilter('crp')}>
              Ver lista
            </Button>
            <Button size="sm" onClick={startRoutine} disabled={!!routine}>
              <ShieldCheck className="h-4 w-4 mr-2" />
              Iniciar verificação
            </Button>
          </div>
        </div>
      )}

      <Tabs value={filter} onValueChange={(value) => setFilter(value as typeof filter)} className="w-full">
        <TabsList className="w-full h-auto p-1 bg-muted/60 grid grid-cols-2 sm:grid-cols-5 gap-1 rounded-lg">
          <TabsTrigger value="pending" className="text-xs sm:text-sm data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">Pendentes ({pendingPsychologists.filter(p => p.approval_status === 'pending').length})</TabsTrigger>
          <TabsTrigger value="approved" className="text-xs sm:text-sm data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">Aprovados ({pendingPsychologists.filter(p => p.approval_status === 'approved').length})</TabsTrigger>
          <TabsTrigger value="rejected" className="text-xs sm:text-sm data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">Rejeitados ({pendingPsychologists.filter(p => p.approval_status === 'rejected').length})</TabsTrigger>
          <TabsTrigger value="crp" className="text-xs sm:text-sm data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">Verificar CRP ({crpDueCount})</TabsTrigger>
          <TabsTrigger value="all" className="text-xs sm:text-sm data-[state=active]:bg-card data-[state=active]:text-primary data-[state=active]:shadow-sm">Todos ({pendingPsychologists.length})</TabsTrigger>
        </TabsList>
      </Tabs>

      <div className="relative">
        <Search className="absolute left-3 top-1/2 -translate-y-1/2 h-4 w-4 text-muted-foreground" />
        <Input
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          placeholder="Pesquisar por nome, email ou CRP..."
          className="pl-9"
        />
      </div>

      <ContentTransition
        loading={loading && pendingPsychologists.length === 0}
        skeleton={
          <SkeletonCardGrid
            count={6}
            columns="grid-cols-1 md:grid-cols-2 lg:grid-cols-3"
          />
        }
      >
        {error && pendingPsychologists.length === 0 && !loading ? (
          <ErrorState
            title="Falha ao carregar psicólogos"
            description="Não conseguimos buscar os cadastros agora. Verifique sua conexão e tente novamente."
            onRetry={getPendingPsychologists}
            retrying={loading}
          />
        ) : null}
      </ContentTransition>

      {filteredPsychologists.length > 0 && (
        <Card className="overflow-hidden animate-fade-in">
          <div className="overflow-x-auto">
            <Table>
              <TableHeader>
                <TableRow className="bg-muted/50 hover:bg-muted/50">
                  <TableHead className="min-w-[180px]">Nome</TableHead>
                  <TableHead className="min-w-[200px]">Email</TableHead>
                  <TableHead className="min-w-[120px]">CRP</TableHead>
                  <TableHead className="min-w-[150px]">CFP</TableHead>
                  <TableHead className="min-w-[160px]">Especialização</TableHead>
                  <TableHead className="min-w-[110px]">Status</TableHead>
                  {filter !== 'pending' && <TableHead className="w-[70px] text-right">Ações</TableHead>}
                </TableRow>
              </TableHeader>
              <TableBody>
                {pagedPsychologists.map((psychologist) => (
                  <TableRow
                    key={psychologist.id}
                    className="cursor-pointer"
                    onClick={() => handleViewDetails(psychologist)}
                  >
                    <TableCell className="font-medium">{psychologist.full_name}</TableCell>
                    <TableCell className="text-muted-foreground">{psychologist.email}</TableCell>
                    <TableCell className="text-muted-foreground">{psychologist.crp_number}</TableCell>
                    <TableCell onClick={(e) => e.stopPropagation()}>
                      <button type="button" onClick={() => setCrpTarget(psychologist)} title="Verificar CRP no CFP">
                        <CrpStatusBadge psychologist={psychologist} />
                      </button>
                    </TableCell>
                    <TableCell className="text-muted-foreground">
                      {psychologist.specialization || '—'}
                    </TableCell>
                    <TableCell>{getStatusBadge(psychologist.approval_status, psychologist)}</TableCell>
                    {filter !== 'pending' && (
                    <TableCell className="text-right" onClick={(e) => e.stopPropagation()}>
                      {/* Cadastro pendente: só aprovar ou rejeitar, pelo detalhe (toque na linha). */}
                      {psychologist.approval_status !== 'pending' && (
                      <DropdownMenu>
                        <DropdownMenuTrigger asChild>
                          <Button variant="ghost" size="icon" className="h-8 w-8">
                            <MoreHorizontal className="h-4 w-4" />
                            <span className="sr-only">Ações</span>
                          </Button>
                        </DropdownMenuTrigger>
                        <DropdownMenuContent align="end" className="w-48 bg-popover z-50">
                          <DropdownMenuItem onClick={() => handleViewDetails(psychologist)}>
                            <Eye className="h-4 w-4 mr-2" />
                            Detalhes
                          </DropdownMenuItem>
                          <DropdownMenuItem onClick={() => setCrpTarget(psychologist)}>
                            <ShieldCheck className="h-4 w-4 mr-2" />
                            Verificar CRP no CFP
                          </DropdownMenuItem>
                          {isCurrentlyBlocked(psychologist) ? (
                            <DropdownMenuItem
                              onClick={() => { setBlockTarget(psychologist); setBlockMode('unblock'); }}
                            >
                              <Unlock className="h-4 w-4 mr-2" />
                              Desbloquear
                            </DropdownMenuItem>
                          ) : (
                            <DropdownMenuItem
                              onClick={() => { setBlockTarget(psychologist); setBlockMode('block'); }}
                            >
                              <Ban className="h-4 w-4 mr-2" />
                              Bloquear
                            </DropdownMenuItem>
                          )}
                          <DropdownMenuItem
                            className="text-destructive focus:text-destructive"
                            onClick={() => setDeleteTarget(psychologist)}
                          >
                            <Trash2 className="h-4 w-4 mr-2" />
                            Excluir
                          </DropdownMenuItem>
                        </DropdownMenuContent>
                      </DropdownMenu>
                      )}
                    </TableCell>
                    )}
                  </TableRow>
                ))}
              </TableBody>
            </Table>
          </div>

          <div className="flex flex-col gap-3 border-t p-3 sm:flex-row sm:items-center sm:justify-between">
            <p className="text-xs text-muted-foreground text-center sm:text-left">
              Mostrando {(currentPage - 1) * pageSize + 1}–
              {Math.min(currentPage * pageSize, filteredPsychologists.length)} de{' '}
              {filteredPsychologists.length} psicólogos
            </p>

            <div className="flex items-center justify-center gap-2">
              <Select value={String(pageSize)} onValueChange={(v) => setPageSize(Number(v))}>
                <SelectTrigger className="h-8 w-[110px] text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent className="bg-popover z-50">
                  {[10, 25, 50].map((n) => (
                    <SelectItem key={n} value={String(n)}>{n} por página</SelectItem>
                  ))}
                </SelectContent>
              </Select>

              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(currentPage - 1)}
                disabled={currentPage <= 1}
                aria-label="Página anterior"
              >
                <ChevronLeft className="h-4 w-4" />
              </Button>
              <span className="text-xs text-muted-foreground min-w-[70px] text-center">
                {currentPage} de {totalPages}
              </span>
              <Button
                variant="outline"
                size="icon"
                className="h-8 w-8"
                onClick={() => setPage(currentPage + 1)}
                disabled={currentPage >= totalPages}
                aria-label="Próxima página"
              >
                <ChevronRight className="h-4 w-4" />
              </Button>
            </div>
          </div>
        </Card>
      )}

      <Dialog open={detailsOpen} onOpenChange={(o) => { setDetailsOpen(o); if (!o) setSelectedPsychologist(null); }}>
        <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">

                    <DialogHeader>
                      <DialogTitle>Detalhes do Psicólogo</DialogTitle>
                      <DialogDescription>
                        Informações completas do cadastro
                      </DialogDescription>
                    </DialogHeader>
                    {selectedPsychologist && (
                      <div className="space-y-6">
                        {selectedPsychologist.approval_status !== 'pending' && (
                        <div className="flex justify-end">
                          <Button variant="outline" size="sm" onClick={() => setEditOpen(true)}>
                            <Pencil className="h-4 w-4 mr-2" />
                            Editar informações
                          </Button>
                        </div>
                        )}

                        {/* Seção de Status da Aprovação */}
                        <div className="border rounded-lg p-4 bg-muted/20">
                          <div className="flex items-center gap-2 mb-3">
                            <CheckCircle className="h-4 w-4" />
                            <span className="text-sm font-medium">Status da Aprovação</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Status Atual</label>
                              <div className="mt-1">{getStatusBadge(selectedPsychologist.approval_status, selectedPsychologist)}</div>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Data de Submissão</label>
                              <p className="text-sm text-muted-foreground mt-1">
                                {selectedPsychologist.submitted_at ? new Date(selectedPsychologist.submitted_at).toLocaleString('pt-BR') : 'Não informado'}
                              </p>
                            </div>
                            {selectedPsychologist.reviewed_at && (
                              <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Data de Revisão</label>
                                <p className="text-sm text-muted-foreground mt-1">
                                  {new Date(selectedPsychologist.reviewed_at).toLocaleString('pt-BR')}
                                </p>
                              </div>
                            )}
                            {selectedPsychologist.reviewed_by && (
                              <div>
                                <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Revisado por</label>
                                <p className="text-sm text-muted-foreground mt-1">{selectedPsychologist.reviewed_by}</p>
                              </div>
                            )}
                          </div>
                          {isCurrentlyBlocked(selectedPsychologist) && (
                            <div className="mt-4 space-y-2">
                              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Bloqueio</label>
                              <div className="text-sm p-3 bg-muted rounded-md border">
                                <p className="font-medium">{formatBlockPeriod(selectedPsychologist)}</p>
                                <p className="text-muted-foreground mt-1">
                                  Motivo: {(selectedPsychologist).blocked_reason || 'Não informado'}
                                </p>
                              </div>
                            </div>
                          )}
                          {selectedPsychologist.rejection_reason && (
                            <div className="mt-4">
                              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Motivo da Rejeição</label>
                              <div className="text-sm p-3 bg-destructive/10 border border-destructive/20 rounded-md mt-1">
                                {selectedPsychologist.rejection_reason}
                              </div>
                            </div>
                          )}
                        </div>

                        {/* Seção de Informações Básicas */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <UserCheck className="h-4 w-4" />
                            <span className="text-sm font-medium">Informações Básicas</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Nome Completo</label>
                              <p className="text-sm text-muted-foreground mt-1">{selectedPsychologist.full_name}</p>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CPF</label>
                              <p className="text-sm text-muted-foreground mt-1">
                                {selectedPsychologist.cpf ? 
                                  selectedPsychologist.cpf.replace(/(\d{3})(\d{3})(\d{3})(\d{2})/, '$1.$2.$3-$4') : 
                                  'Não informado'
                                }
                              </p>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Email Pessoal</label>
                              <p className="text-sm text-muted-foreground mt-1">{selectedPsychologist.email}</p>
                            </div>
                          </div>
                        </div>

                        {/* Seção de Dados Profissionais */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <User className="h-4 w-4" />
                            <span className="text-sm font-medium">Dados Profissionais</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4 mb-4">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">CRP</label>
                              <p className="text-sm text-muted-foreground mt-1">{selectedPsychologist.crp_number}</p>
                            </div>
                            <div className="sm:col-span-2">
                              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Situação no CFP</label>
                              <div className="mt-1 flex flex-wrap items-center gap-2">
                                <CrpStatusBadge psychologist={selectedPsychologist} />
                                <Button variant="outline" size="sm" onClick={() => setCrpTarget(selectedPsychologist)}>
                                  <ShieldCheck className="h-4 w-4 mr-2" />
                                  Verificar no CFP
                                </Button>
                              </div>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Especialização</label>
                              <p className="text-sm text-muted-foreground mt-1">
                                {selectedPsychologist.specialization || 'Não informado'}
                              </p>
                            </div>
                          </div>
                        </div>

                        {/* Seção de Informações PIX */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <FileText className="h-4 w-4" />
                            <span className="text-sm font-medium">Informações PIX</span>
                          </div>
                          <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                            <div>
                              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Tipo da chave PIX</label>
                              <p className="text-sm text-muted-foreground mt-1">
                                {selectedPsychologist.pix_type ? 
                                  selectedPsychologist.pix_type.charAt(0).toUpperCase() + selectedPsychologist.pix_type.slice(1) : 
                                  'Não cadastrado'
                                }
                              </p>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Chave PIX</label>
                              <p className="text-sm text-muted-foreground mt-1 font-mono">
                                {selectedPsychologist.pix_key || 'Não cadastrado'}
                              </p>
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
                              <p className="text-sm text-muted-foreground mt-1">{selectedPsychologist.state || 'Não informado'}</p>
                            </div>
                            <div>
                              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Cidade</label>
                              <p className="text-sm text-muted-foreground mt-1">{selectedPsychologist.city || 'Não informado'}</p>
                            </div>
                          </div>
                          {selectedPsychologist.address && (
                            <div className="mt-4">
                              <label className="text-xs font-medium text-muted-foreground uppercase tracking-wide">Endereço do Consultório</label>
                              <p className="text-sm text-muted-foreground mt-1">{selectedPsychologist.address}</p>
                            </div>
                          )}
                        </div>

                        {/* Seção de Biografia */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <FileText className="h-4 w-4" />
                            <span className="text-sm font-medium">Biografia Profissional</span>
                          </div>
                          <div className="bg-muted/50 rounded-lg p-3 text-sm">
                            {selectedPsychologist.bio || 'Nenhuma biografia fornecida'}
                          </div>
                        </div>

                        {/* Seção de Documentos */}
                        <div className="border rounded-lg p-4">
                          <div className="flex items-center gap-2 mb-3">
                            <FileText className="h-4 w-4" />
                            <span className="text-sm font-medium">Documentos</span>
                          </div>
                          {selectedPsychologist.document_url ? (
                            <div className="space-y-4">
                              <div className="flex items-center justify-between p-3 border rounded bg-muted/20">
                                <div className="flex items-center space-x-2">
                                  <FileText className="h-4 w-4" />
                                  <span className="text-sm">Documento Profissional</span>
                                </div>
                                <div className="flex gap-2">
                                  <Button
                                    variant="outline"
                                    size="sm"
                                    onClick={() => void openStorageDocument(selectedPsychologist.document_url)}
                                  >
                                    <Eye className="h-4 w-4 mr-1" />
                                    Visualizar
                                  </Button>
                                  <Button
                                    variant="ghost"
                                    size="sm"
                                    onClick={() => void openStorageDocument(selectedPsychologist.document_url)}
                                  >
                                    <Download className="h-4 w-4" />
                                  </Button>
                                </div>
                              </div>
                              <div className="space-y-4">
                                <DocumentViewer
                                  documentPath={extractDocumentRef(selectedPsychologist.document_url)?.path}
                                  bucket={extractDocumentRef(selectedPsychologist.document_url)?.bucket}
                                  fallbackUrl={selectedPsychologist.document_url}
                                />
                              </div>

                                </div>
                          ) : (
                            <p className="text-sm text-muted-foreground">Nenhum documento anexado</p>
                          )}
                        </div>

                        {selectedPsychologist.approval_status !== 'pending' && (
                        <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t">
                          {isCurrentlyBlocked(selectedPsychologist) ? (
                            <Button
                              className="flex-1 bg-success text-success-foreground hover:bg-success/90"
                              onClick={() => { setBlockTarget(selectedPsychologist); setBlockMode('unblock'); setDetailsOpen(false); }}
                            >
                              <Unlock className="h-4 w-4 mr-2" /> Desbloquear
                            </Button>
                          ) : (
                            <Button
                              variant="destructive"
                              className="flex-1"
                              onClick={() => { setBlockTarget(selectedPsychologist); setBlockMode('block'); setDetailsOpen(false); }}
                            >
                              <Ban className="h-4 w-4 mr-2" /> Bloquear
                            </Button>
                          )}
                        </div>
                        )}

                        {selectedPsychologist.approval_status === 'pending' && !canApproveWithCrp(selectedPsychologist) && (
                          <div className="flex flex-col gap-2 rounded-md border border-warning/30 bg-warning/10 p-3 text-sm sm:flex-row sm:items-center sm:justify-between">
                            <span>
                              Para aprovar, o CRP precisa estar <strong>ATIVO</strong> no CFP numa consulta dos últimos {CRP_APPROVAL_MAX_AGE_DAYS} dias.
                            </span>
                            <Button size="sm" onClick={() => setCrpTarget(selectedPsychologist)}>
                              <ShieldCheck className="h-4 w-4 mr-2" />
                              Verificar no CFP
                            </Button>
                          </div>
                        )}

                        {selectedPsychologist.approval_status === 'pending' && (
                          <div className="flex flex-col sm:flex-row gap-2 pt-4 border-t">


                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button className="flex-1" variant="default" disabled={!canApproveWithCrp(selectedPsychologist)}>
                                  <CheckCircle className="h-4 w-4 mr-2" />
                                  Aprovar
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Aprovar Psicólogo</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Tem certeza que deseja aprovar o cadastro de {selectedPsychologist.full_name}?
                                    Isso permitirá que ele acesse a plataforma como psicólogo.
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <AlertDialogFooter>
                                  <AlertDialogCancel>Cancelar</AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleApprove(selectedPsychologist.id)}
                                    disabled={loading}
                                  >
                                    Confirmar Aprovação
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>

                            <AlertDialog>
                              <AlertDialogTrigger asChild>
                                <Button variant="destructive" className="flex-1">
                                  <XCircle className="h-4 w-4 mr-2" />
                                  Rejeitar
                                </Button>
                              </AlertDialogTrigger>
                              <AlertDialogContent>
                                <AlertDialogHeader>
                                  <AlertDialogTitle>Rejeitar Psicólogo</AlertDialogTitle>
                                  <AlertDialogDescription>
                                    Informe o motivo da rejeição para {selectedPsychologist.full_name}:
                                  </AlertDialogDescription>
                                </AlertDialogHeader>
                                <Textarea
                                  placeholder="Motivo da rejeição (opcional)"
                                  value={rejectionReason}
                                  onChange={(e) => setRejectionReason(e.target.value)}
                                  className="my-4"
                                />
                                <AlertDialogFooter>
                                  <AlertDialogCancel onClick={() => setRejectionReason('')}>
                                    Cancelar
                                  </AlertDialogCancel>
                                  <AlertDialogAction
                                    onClick={() => handleReject(selectedPsychologist.id)}
                                    disabled={loading}
                                    className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
                                  >
                                    Confirmar Rejeição
                                  </AlertDialogAction>
                                </AlertDialogFooter>
                              </AlertDialogContent>
                            </AlertDialog>
                          </div>
                        )}
                      </div>
                    )}
                  </DialogContent>
      </Dialog>


      {filteredPsychologists.length === 0 && !loading && !error && (
        <EmptyState
          icon={Users}
          title="Nenhum psicólogo encontrado"
          description={
            filter === 'pending'
              ? 'Não há cadastros pendentes de aprovação no momento.'
              : ({ crp: 'Todos os CRPs foram conferidos no CFP nos últimos 6 meses.', approved: 'Não há psicólogos aprovados no momento.', rejected: 'Não há cadastros rejeitados.', all: 'Ainda não há psicólogos cadastrados.' } as Record<string, string>)[filter] ?? 'Nenhum resultado.'
          }
          variant={filter === 'pending' ? 'primary' : 'muted'}
        />
      )}

      {blockTarget && (
        <BlockPsychologistModal
          open={!!blockTarget}
          onOpenChange={(o) => { if (!o) setBlockTarget(null); }}
          psychologistId={blockTarget.id}
          psychologistName={blockTarget.full_name}
          mode={blockMode}
          blockInfo={blockTarget}
          onDone={(updated) => {
            if (updated && selectedPsychologist?.id === updated.id) setSelectedPsychologist(updated);
            getPendingPsychologists();
            onDataChange?.();
          }}
        />
      )}

      <AlertDialog open={!!deleteTarget} onOpenChange={(o) => { if (!o) setDeleteTarget(null); }}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir psicólogo</AlertDialogTitle>
            <AlertDialogDescription>
              Esta ação é permanente e removerá o cadastro, os documentos e o acesso de{' '}
              {deleteTarget?.full_name}. Deseja continuar?
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
              disabled={!!deletingId}
              onClick={(e) => {
                e.preventDefault();
                const target = deleteTarget;
                if (target) handleDelete(target).then(() => setDeleteTarget(null));
              }}
            >
              {deletingId ? 'Excluindo...' : 'Confirmar exclusão'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>



      {routine && routineTarget ? (
        <CrpVerificationDialog
          open
          onOpenChange={(o) => { if (!o) finishRoutine(routine, true); }}
          psychologist={routineTarget}
          verifyCrp={verifyCrp}
          onVerified={handleCrpVerified}
          routine={{
            position: routine.index + 1,
            total: routine.ids.length,
            onSkip: () => advanceRoutine('skipped'),
            onStop: () => finishRoutine(routine, true),
          }}
        />
      ) : crpTarget && (
        <CrpVerificationDialog
          open={!!crpTarget}
          onOpenChange={(o) => { if (!o) setCrpTarget(null); }}
          psychologist={crpTarget}
          verifyCrp={verifyCrp}
          onVerified={handleCrpVerified}
        />
      )}

      {selectedPsychologist && (
        <EditPsychologistModal
          open={editOpen}
          onOpenChange={setEditOpen}
          psychologist={selectedPsychologist}
          onUpdated={(data) => {
            if (data) setSelectedPsychologist(data);
            getPendingPsychologists();
            onDataChange?.();
          }}
        />
      )}
    </div>
  );
};
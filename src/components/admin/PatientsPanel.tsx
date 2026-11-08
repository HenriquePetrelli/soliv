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
import {
  Ban,
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

export const PatientsPanel = () => {
  const { patients, loading, error, fetchPatients } = usePatientManagement();
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pageSize, setPageSize] = useState(10);

  const [detailPatient, setDetailPatient] = useState<AdminPatient | null>(null);
  const [editPatient, setEditPatient] = useState<AdminPatient | null>(null);
  const [blockTarget, setBlockTarget] = useState<{ patient: AdminPatient; mode: 'block' | 'unblock' } | null>(null);
  const [deleteTarget, setDeleteTarget] = useState<AdminPatient | null>(null);
  const [deleting, setDeleting] = useState(false);

  const filtered = useMemo(() => {
    const term = search.trim().toLowerCase();
    if (!term) return patients;
    return patients.filter((p) =>
      [p.full_name, p.email, p.cpf, p.city, p.state].some((v) => (v || '').toLowerCase().includes(term))
    );
  }, [patients, search]);

  const totalPages = Math.max(1, Math.ceil(filtered.length / pageSize));
  const currentPage = Math.min(page, totalPages);
  const paginated = filtered.slice((currentPage - 1) * pageSize, currentPage * pageSize);

  const handleSearch = (value: string) => {
    setSearch(value);
    setPage(1);
  };

  const handleExportCsv = () => {
    if (filtered.length === 0) return toast.error('Nenhum paciente para exportar');
    const headers = ['Nome', 'Email', 'CPF', 'Telefone', 'Estado', 'Cidade', 'Status', 'Cadastro'];
    const escape = (v: unknown) => `"${String(v ?? '').replace(/"/g, '""')}"`;
    const rows = filtered.map((p) => [
      p.full_name,
      p.email,
      p.cpf || '',
      p.phone || '',
      p.state || '',
      p.city || '',
      isCurrentlyBlocked(p) ? 'Bloqueado' : 'Ativo',
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
        <div className="flex gap-2 w-full sm:w-auto">
          <Button variant="outline" size="sm" onClick={handleExportCsv} disabled={filtered.length === 0} className="flex-1 sm:flex-none">
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
          <Button onClick={fetchPatients} disabled={loading} size="sm" className="flex-1 sm:flex-none">
            {loading ? 'Carregando...' : 'Atualizar'}
          </Button>
        </div>
      </div>

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
              title="Nenhum paciente encontrado"
              description={search ? 'Ajuste a pesquisa para encontrar outros pacientes.' : 'Ainda não há pacientes cadastrados.'}
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

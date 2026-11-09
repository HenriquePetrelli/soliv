import { useState, type FormEvent } from 'react';
import { toast } from 'sonner';
import { Download, Fingerprint, Search } from 'lucide-react';
import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonTable } from '@/components/skeletons/Skeletons';
import { ContentTransition } from '@/components/skeletons/ContentTransition';
import { useAdminAccessLogs } from '@/hooks/useAdminAccessLogs';
import {
  ACCESS_EVENT_LABELS,
  brasiliaDayEnd,
  brasiliaDayStart,
  buildAccessLogsCsv,
  downloadCsv,
  formatBrasilia,
} from '@/lib/accessLogsCsv';

const errorText = (error: unknown) => {
  const e = error as { message?: string; hint?: string } | null;
  if (e?.message === 'EXPORT_TOO_LARGE' || e?.message === 'EXPORT_REASON_REQUIRED') return e.hint ?? 'Não foi possível exportar.';
  return 'Não foi possível carregar os registros de acesso.';
};

/**
 * Registros de acesso guardados por 7 meses (Marco Civil, art. 15): data,
 * hora e IP de cada login e uso do app. Só para atender pedido de
 * autoridade ou investigar incidente de segurança: toda busca e toda
 * exportação ficam na Auditoria, a exportação com o motivo.
 */
export const AccessLogsPanel = () => {
  const { entries, total, loading, searched, search, loadMore, exportAll, hasMore } = useAdminAccessLogs();
  const [term, setTerm] = useState('');
  const [fromDay, setFromDay] = useState('');
  const [toDay, setToDay] = useState('');
  const [event, setEvent] = useState('all');
  const [exportOpen, setExportOpen] = useState(false);
  const [reason, setReason] = useState('');
  const [exporting, setExporting] = useState(false);

  const handleSearch = async (e?: FormEvent) => {
    e?.preventDefault();
    if (fromDay && toDay && fromDay > toDay) {
      toast.error('A data inicial é depois da final.');
      return;
    }
    try {
      await search({
        search: term,
        from: fromDay ? brasiliaDayStart(fromDay) : null,
        to: toDay ? brasiliaDayEnd(toDay) : null,
        event: event === 'all' ? null : event,
      });
    } catch (error) {
      toast.error(errorText(error));
    }
  };

  const handleExport = async () => {
    if (reason.trim().length < 5) {
      toast.error('Informe o motivo da exportação (ex.: número do ofício ou da ordem judicial).');
      return;
    }
    setExporting(true);
    try {
      const rows = await exportAll(reason.trim());
      downloadCsv(buildAccessLogsCsv(rows), `registros-de-acesso-${new Date().toISOString().slice(0, 10)}.csv`);
      toast.success(`${rows.length} registro(s) exportado(s). A exportação ficou na Auditoria.`);
      setExportOpen(false);
      setReason('');
    } catch (error) {
      toast.error(errorText(error));
    } finally {
      setExporting(false);
    }
  };

  return (
    <div className="space-y-4 sm:space-y-6">
      <p className="text-sm text-muted-foreground">
        Data, hora e IP de cada login e uso do app, guardados por 7 meses como pede o Marco Civil da Internet (art. 15).
        Use só para atender pedido de autoridade ou investigar incidente de segurança: cada busca e cada exportação ficam na Auditoria.
      </p>

      <Card>
        <CardContent className="p-4">
          <form onSubmit={handleSearch} className="grid gap-3 sm:grid-cols-2 lg:grid-cols-[2fr_1fr_1fr_1fr_auto] lg:items-end">
            <div className="space-y-1.5 sm:col-span-2 lg:col-span-1">
              <Label htmlFor="access-search">E-mail, ID da conta ou IP</Label>
              <Input
                id="access-search"
                value={term}
                onChange={(e) => setTerm(e.target.value)}
                placeholder="ex.: maria@email.com ou 187.1.2.3"
              />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="access-from">De</Label>
              <Input id="access-from" type="date" value={fromDay} onChange={(e) => setFromDay(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="access-to">Até</Label>
              <Input id="access-to" type="date" value={toDay} onChange={(e) => setToDay(e.target.value)} />
            </div>
            <div className="space-y-1.5">
              <Label>Evento</Label>
              <Select value={event} onValueChange={setEvent}>
                <SelectTrigger aria-label="Evento">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="all">Todos</SelectItem>
                  <SelectItem value="login">Login</SelectItem>
                  <SelectItem value="app_open">Uso do app</SelectItem>
                </SelectContent>
              </Select>
            </div>
            <Button type="submit" disabled={loading} className="w-full lg:w-auto">
              <Search className="h-4 w-4 mr-2" />
              Buscar
            </Button>
          </form>
        </CardContent>
      </Card>

      {searched && (
        <div className="flex flex-wrap items-center justify-between gap-2">
          <p className="text-sm text-muted-foreground">
            {total.toLocaleString('pt-BR')} registro(s) encontrado(s). Horários em Brasília.
          </p>
          <Button variant="outline" size="sm" onClick={() => setExportOpen(true)} disabled={total === 0}>
            <Download className="h-4 w-4 mr-2" />
            Exportar CSV
          </Button>
        </div>
      )}

      <ContentTransition loading={loading && entries.length === 0} skeleton={<SkeletonTable rows={8} cols={5} />}>
        {entries.length === 0 ? (
          <EmptyState
            icon={Fingerprint}
            title={searched ? 'Nenhum registro encontrado' : 'Busque para ver os registros'}
            description={
              searched
                ? 'Confira o e-mail, o ID ou o IP e o período. Registros com mais de 7 meses já foram apagados.'
                : 'Filtre por pessoa (e-mail ou ID), por IP ou por período. Deixe em branco para ver todos.'
            }
            variant="muted"
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="min-w-[150px]">Quando</TableHead>
                    <TableHead className="min-w-[110px]">Evento</TableHead>
                    <TableHead className="min-w-[200px]">Conta</TableHead>
                    <TableHead className="min-w-[130px]">IP</TableHead>
                    <TableHead className="min-w-[220px]">Navegador / aparelho</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => (
                    <TableRow key={entry.id}>
                      <TableCell className="text-muted-foreground whitespace-nowrap">{formatBrasilia(entry.created_at)}</TableCell>
                      <TableCell>
                        <Badge variant="outline">{ACCESS_EVENT_LABELS[entry.event] ?? entry.event}</Badge>
                      </TableCell>
                      <TableCell>
                        <div className="font-medium">{entry.user_name || entry.email || '—'}</div>
                        {entry.user_name && entry.email && <div className="text-xs text-muted-foreground">{entry.email}</div>}
                        {!entry.user_name && <div className="text-xs text-muted-foreground">conta excluída ou sem nome</div>}
                      </TableCell>
                      <TableCell className="font-mono text-xs">{entry.ip_address || '—'}</TableCell>
                      <TableCell className="text-xs text-muted-foreground break-all">{entry.user_agent || '—'}</TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>

            {hasMore && (
              <CardContent className="flex justify-center border-t p-3">
                <Button
                  variant="outline"
                  size="sm"
                  disabled={loading}
                  onClick={() => loadMore().catch((error) => toast.error(errorText(error)))}
                >
                  {loading ? 'Carregando...' : 'Carregar mais'}
                </Button>
              </CardContent>
            )}
          </Card>
        )}
      </ContentTransition>

      <Dialog open={exportOpen} onOpenChange={(open) => !exporting && setExportOpen(open)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Exportar registros de acesso</DialogTitle>
            <DialogDescription>
              Vão para o arquivo os {total.toLocaleString('pt-BR')} registro(s) da busca atual (até 50 mil). O motivo fica guardado na
              Auditoria junto com quem exportou e quando.
            </DialogDescription>
          </DialogHeader>
          <div className="space-y-1.5">
            <Label htmlFor="export-reason">Motivo</Label>
            <Textarea
              id="export-reason"
              value={reason}
              onChange={(e) => setReason(e.target.value)}
              placeholder="ex.: Ofício nº 123/2026 da Delegacia de Crimes Cibernéticos"
              maxLength={500}
            />
          </div>
          <DialogFooter>
            <Button variant="outline" onClick={() => setExportOpen(false)} disabled={exporting}>
              Cancelar
            </Button>
            <Button onClick={handleExport} disabled={exporting}>
              <Download className="h-4 w-4 mr-2" />
              {exporting ? 'Exportando...' : 'Exportar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>
    </div>
  );
};

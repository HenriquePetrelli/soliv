import { Card, CardContent } from '@/components/ui/card';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import { History, Ban, Eye, Download, Unlock, Pencil, Trash2, CheckCircle2, XCircle, CreditCard, Plus } from 'lucide-react';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonTable } from '@/components/skeletons/Skeletons';
import { ContentTransition } from '@/components/skeletons/ContentTransition';
import { useAdminAuditLog, type AuditLogEntry } from '@/hooks/useAdminAuditLog';

const ACTION_LABELS: Record<string, string> = {
  block_patient: 'Bloqueou paciente',
  unblock_patient: 'Desbloqueou paciente',
  delete_patient: 'Excluiu paciente',
  update_patient: 'Editou paciente',
  block_psychologist: 'Bloqueou psicólogo',
  unblock_psychologist: 'Desbloqueou psicólogo',
  delete_psychologist: 'Excluiu psicólogo',
  update_psychologist: 'Editou psicólogo',
  approve_psychologist: 'Aprovou psicólogo',
  reject_psychologist: 'Recusou psicólogo',
  confirm_payout: 'Confirmou repasse',
  update_group_testimonial: 'Editou depoimento',
  delete_group_testimonial: 'Excluiu depoimento',
  update_testimonial_report: 'Revisou denúncia',
  insert_organization: 'Cadastrou empresa',
  update_organization: 'Alterou empresa',
  delete_organization: 'Excluiu empresa',
  insert_organization_member: 'Vinculou à empresa',
  update_organization_member: 'Alterou vínculo com empresa',
  delete_organization_member: 'Removeu vínculo com empresa',
  view_access_logs: 'Consultou registros de acesso',
  export_access_logs: 'Exportou registros de acesso',
};

const ACTION_ICONS: Record<string, React.ComponentType<{ className?: string }>> = {
  block_patient: Ban,
  block_psychologist: Ban,
  unblock_patient: Unlock,
  unblock_psychologist: Unlock,
  delete_patient: Trash2,
  delete_psychologist: Trash2,
  update_patient: Pencil,
  update_psychologist: Pencil,
  approve_psychologist: CheckCircle2,
  reject_psychologist: XCircle,
  confirm_payout: CreditCard,
  update_group_testimonial: Pencil,
  delete_group_testimonial: Trash2,
  update_testimonial_report: Pencil,
  insert_organization: Plus,
  update_organization: Pencil,
  delete_organization: Trash2,
  insert_organization_member: Plus,
  update_organization_member: Pencil,
  delete_organization_member: Trash2,
  view_access_logs: Eye,
  export_access_logs: Download,
};

const ACTION_BADGE_CLASS: Record<string, string> = {
  block_patient: 'bg-destructive/10 text-destructive border-destructive/20',
  block_psychologist: 'bg-destructive/10 text-destructive border-destructive/20',
  unblock_patient: 'bg-success/10 text-success border-success/20',
  unblock_psychologist: 'bg-success/10 text-success border-success/20',
  delete_patient: 'bg-destructive/10 text-destructive border-destructive/20',
  delete_psychologist: 'bg-destructive/10 text-destructive border-destructive/20',
  update_patient: 'bg-primary/10 text-primary border-primary/20',
  update_psychologist: 'bg-primary/10 text-primary border-primary/20',
  approve_psychologist: 'bg-success/10 text-success border-success/20',
  reject_psychologist: 'bg-destructive/10 text-destructive border-destructive/20',
  confirm_payout: 'bg-success/10 text-success border-success/20',
  delete_group_testimonial: 'bg-destructive/10 text-destructive border-destructive/20',
  delete_organization: 'bg-destructive/10 text-destructive border-destructive/20',
  delete_organization_member: 'bg-destructive/10 text-destructive border-destructive/20',
  export_access_logs: 'bg-warning/10 text-warning border-warning/20',
};

const formatDate = (value: string) =>
  new Date(value).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' });

const formatDetails = (entry: AuditLogEntry): string => {
  const d = entry.details || {};
  const parts: string[] = [];
  if (d.duration) parts.push(`período: ${d.duration}`);
  if (d.reason) parts.push(`motivo: ${d.reason}`);
  if (Array.isArray(d.fields_changed) && d.fields_changed.length > 0) {
    parts.push(`campos: ${d.fields_changed.join(', ')}`);
  }
  if (d.email_changed) parts.push('e-mail alterado');
  if (d.password_changed) parts.push('senha alterada');
  if (typeof d.amount === 'number') parts.push(`valor: ${d.amount.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' })}`);
  if (d.pix_e2e_id) parts.push(`E2E: ${d.pix_e2e_id}`);
  if (d.texto === 'editado') parts.push('texto editado');
  if (entry.target_type === 'access_log') {
    if (typeof d.row_count === 'number') parts.push(`${d.row_count} registro(s)`);
    if (typeof d.event === 'string') parts.push(`evento: ${d.event === 'login' ? 'login' : 'uso do app'}`);
    const day = (v: unknown) => new Date(String(v)).toLocaleDateString('pt-BR', { timeZone: 'America/Sao_Paulo' });
    if (d.from) parts.push(`de ${day(d.from)}`);
    // "to" é o início do dia seguinte ao escolhido.
    if (d.to) parts.push(`até ${day(new Date(new Date(String(d.to)).getTime() - 1).toISOString())}`);
  }
  // Mudanças registradas pelo banco: { campo: { de, para } }.
  for (const [key, value] of Object.entries(d)) {
    if (value && typeof value === 'object' && 'de' in (value as object) && 'para' in (value as object)) {
      const v = value as { de: unknown; para: unknown };
      parts.push(`${key}: ${String(v.de ?? '—')} → ${String(v.para ?? '—')}`);
    }
  }
  return parts.join(' · ') || '—';
};

/** Read-only trail of every block/unblock/edit/delete an admin performed on
 * a patient or psychologist account — written by the admin-* edge
 * functions, never editable from here. */
export const AuditLogPanel = () => {
  const { entries, loading, hasMore, loadMore } = useAdminAuditLog();

  return (
    <div className="space-y-4 sm:space-y-6">
      <p className="text-sm text-muted-foreground">
          Todo bloqueio, edição ou exclusão de conta feito por um admin fica registrado aqui — quem fez, quando e por quê.
      </p>

      <ContentTransition loading={loading && entries.length === 0} skeleton={<SkeletonTable rows={8} cols={5} />}>
        {entries.length === 0 ? (
          <EmptyState
            icon={History}
            title="Nenhuma ação registrada ainda"
            description="Bloqueios, edições e exclusões de contas vão aparecer aqui assim que acontecerem."
            variant="muted"
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/50 hover:bg-muted/50">
                    <TableHead className="min-w-[140px]">Quando</TableHead>
                    <TableHead className="min-w-[140px]">Admin</TableHead>
                    <TableHead className="min-w-[160px]">Ação</TableHead>
                    <TableHead className="min-w-[160px]">Alvo</TableHead>
                    <TableHead className="min-w-[200px]">Detalhes</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {entries.map((entry) => {
                    const Icon = ACTION_ICONS[entry.action] ?? History;
                    return (
                      <TableRow key={entry.id}>
                        <TableCell className="text-muted-foreground whitespace-nowrap">
                          {formatDate(entry.created_at)}
                        </TableCell>
                        <TableCell className="font-medium">{entry.admin_name || 'Admin'}</TableCell>
                        <TableCell>
                          <Badge variant="outline" className={`gap-1.5 ${ACTION_BADGE_CLASS[entry.action] ?? ''}`}>
                            <Icon className="h-3 w-3" />
                            {ACTION_LABELS[entry.action] ?? entry.action}
                          </Badge>
                        </TableCell>
                        <TableCell>{entry.target_name || '—'}</TableCell>
                        <TableCell className="text-muted-foreground text-xs">{formatDetails(entry)}</TableCell>
                      </TableRow>
                    );
                  })}
                </TableBody>
              </Table>
            </div>

            {hasMore && (
              <CardContent className="flex justify-center border-t p-3">
                <Button variant="outline" size="sm" onClick={loadMore} disabled={loading}>
                  {loading ? 'Carregando...' : 'Carregar mais'}
                </Button>
              </CardContent>
            )}
          </Card>
        )}
      </ContentTransition>
    </div>
  );
};

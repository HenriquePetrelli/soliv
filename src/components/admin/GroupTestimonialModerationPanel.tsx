import { useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { Table, TableBody, TableCell, TableHead, TableHeader, TableRow } from '@/components/ui/table';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
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
import {
  AlertTriangle,
  Flag,
  FlagOff,
  MessageSquareOff,
  MessageSquareWarning,
  MessageSquareText,
  Pencil,
  ThumbsDown,
  ThumbsUp,
  Trash2,
} from 'lucide-react';
import BlockTestimonialsModal from '@/components/admin/BlockTestimonialsModal';
import { EmptyState } from '@/components/EmptyState';
import { SkeletonTable } from '@/components/skeletons/Skeletons';
import { ContentTransition } from '@/components/skeletons/ContentTransition';
import {
  useGroupTestimonialModeration,
  type AdminGroupTestimonial,
} from '@/hooks/useGroupTestimonialModeration';

const Metric: React.FC<{ label: string; value: string }> = ({ label, value }) => (
  <div className="rounded-lg border bg-card px-3 py-2.5">
    <p className="text-xs text-muted-foreground">{label}</p>
    <p className="text-lg font-semibold text-foreground">{value}</p>
  </div>
);

const REPORT_REASON_LABELS: Record<string, string> = {
  ofensivo: 'Ofensivo',
  risco: 'Risco',
  dados_pessoais: 'Dados pessoais',
  spam: 'Spam',
  outro: 'Outro',
};

const formatDate = (value: string) => new Date(value).toLocaleDateString('pt-BR', { dateStyle: 'short' });

const authorLabel = (t: { autor_nome: string | null; autor_email: string | null }) =>
  t.autor_nome || t.autor_email || 'Paciente';

/** Quem escreveu: o admin vê o autor real, também dos depoimentos anônimos. */
const AuthorCell = ({ t }: { t: AdminGroupTestimonial }) => (
  <div className="min-w-0 space-y-0.5">
    <p className="font-medium text-foreground truncate">{t.autor_nome || '—'}</p>
    {t.autor_email && <p className="text-xs text-muted-foreground truncate">{t.autor_email}</p>}
    <div className="flex flex-wrap gap-1 pt-0.5">
      {t.anonimo && (
        <Badge variant="outline" className="text-[10px] font-normal" title="Os outros pacientes veem como anônimo">
          Anônimo para os outros
        </Badge>
      )}
      {t.autor_bloqueado && (
        <Badge variant="destructive" className="text-[10px] font-normal">
          {t.autor_bloqueado_ate
            ? `Bloqueado até ${new Date(t.autor_bloqueado_ate).toLocaleString('pt-BR', { dateStyle: 'short', timeStyle: 'short' })}`
            : 'Bloqueado por tempo indeterminado'}
        </Badge>
      )}
    </div>
  </div>
);

/** Admin moderation of support-group testimonials. Testimonials reported by
 * users sort first, then those with 10+ "não gostei" — nothing gets deleted
 * automatically, an admin reviews and decides. */
export const GroupTestimonialModerationPanel = () => {
  const { testimonials, loading, savingId, updateTestimonial, deleteTestimonial, dismissReports, blockAuthor, unblockAuthor } =
    useGroupTestimonialModeration();
  /** Autor a bloquear: aberto logo depois de excluir um depoimento, ou pelo botão da linha. */
  const [blockTarget, setBlockTarget] = useState<{ userId: string; name: string; afterDelete: boolean } | null>(null);
  const [editTarget, setEditTarget] = useState<AdminGroupTestimonial | null>(null);
  const [editText, setEditText] = useState('');
  const [deleteTarget, setDeleteTarget] = useState<AdminGroupTestimonial | null>(null);

  const flaggedCount = testimonials.filter((t) => t.flagged).length;
  const reportedCount = testimonials.filter((t) => t.pending_reports > 0).length;

  const openEdit = (t: AdminGroupTestimonial) => {
    setEditTarget(t);
    setEditText(t.texto);
  };

  const handleSaveEdit = async () => {
    if (!editTarget) return;
    const ok = await updateTestimonial(editTarget.testimonial_id, editText.trim());
    if (ok) setEditTarget(null);
  };

  const handleDelete = async () => {
    if (!deleteTarget) return;
    const target = deleteTarget;
    const ok = await deleteTestimonial(target.testimonial_id);
    if (!ok) return;
    setDeleteTarget(null);
    // Depois de excluir, oferece bloquear novos depoimentos do autor.
    if (target.autor_user_id) {
      setBlockTarget({ userId: target.autor_user_id, name: authorLabel(target), afterDelete: true });
    }
  };

  return (
    <div className="space-y-4">
      <p className="text-sm text-muted-foreground">
          Depoimentos denunciados por usuários ou com 10 ou mais "não gostei" ficam sinalizados aqui para revisão —
          nada é excluído automaticamente. Edite, exclua ou arquive as denúncias quando necessário.
      </p>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-3">
        <Metric label="Depoimentos totais" value={String(testimonials.length)} />
        <Metric label="Sinalizados p/ revisão" value={String(flaggedCount)} />
        <Metric label="Com denúncias" value={String(reportedCount)} />
      </div>

      <ContentTransition loading={loading} skeleton={<SkeletonTable rows={5} cols={5} />}>
        {testimonials.length === 0 ? (
          <EmptyState
            icon={MessageSquareWarning}
            title="Nenhum depoimento registrado"
            description="Os depoimentos dos grupos de apoio aparecerão aqui."
          />
        ) : (
          <Card className="overflow-hidden">
            <div className="overflow-x-auto">
              <Table>
                <TableHeader>
                  <TableRow className="bg-muted/60 hover:bg-muted/60">
                    <TableHead>Grupo</TableHead>
                    <TableHead>Autor</TableHead>
                    <TableHead className="hidden md:table-cell">Depoimento</TableHead>
                    <TableHead className="hidden sm:table-cell">Reações</TableHead>
                    <TableHead className="hidden lg:table-cell">Data</TableHead>
                    <TableHead className="w-28 text-right">Ações</TableHead>
                  </TableRow>
                </TableHeader>
                <TableBody>
                  {testimonials.map((t) => (
                    <TableRow key={t.testimonial_id} className={t.flagged ? 'bg-destructive/5' : undefined}>
                      <TableCell className="font-medium">
                        <div className="flex items-center gap-2">
                          {t.flagged && <AlertTriangle className="h-4 w-4 text-destructive shrink-0" />}
                          {t.group_nome}
                        </div>
                      </TableCell>
                      <TableCell className="max-w-[14rem]">
                        <AuthorCell t={t} />
                      </TableCell>
                      <TableCell className="hidden md:table-cell max-w-xs">
                        <p className="text-sm text-muted-foreground truncate">{t.texto}</p>
                      </TableCell>
                      <TableCell className="hidden sm:table-cell">
                        <div className="flex items-center gap-2 text-sm">
                          <span className="flex items-center gap-1 text-success">
                            <ThumbsUp className="h-3.5 w-3.5" />
                            {t.likes_positivos}
                          </span>
                          <span className={`flex items-center gap-1 ${t.flagged ? 'text-destructive font-semibold' : 'text-muted-foreground'}`}>
                            <ThumbsDown className="h-3.5 w-3.5" />
                            {t.likes_negativos}
                          </span>
                          {t.flagged && (
                            <Badge variant="destructive" className="text-xs">
                              Revisar
                            </Badge>
                          )}
                        </div>
                        {t.pending_reports > 0 && (
                          <div className="mt-1 flex items-center gap-1 text-xs text-destructive">
                            <Flag className="h-3.5 w-3.5" />
                            {t.pending_reports} {t.pending_reports === 1 ? 'denúncia' : 'denúncias'}:{' '}
                            {t.report_reasons.map((r) => REPORT_REASON_LABELS[r] ?? r).join(', ')}
                          </div>
                        )}
                      </TableCell>
                      <TableCell className="hidden lg:table-cell text-sm text-muted-foreground">
                        {formatDate(t.criado_em)}
                      </TableCell>
                      <TableCell className="text-right">
                        <div className="flex items-center justify-end gap-1">
                          {t.pending_reports > 0 && (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-foreground"
                              onClick={() => dismissReports(t.testimonial_id)}
                              disabled={savingId === t.testimonial_id}
                              aria-label="Arquivar denúncias (manter depoimento)"
                              title="Arquivar denúncias (manter depoimento)"
                            >
                              <FlagOff className="h-4 w-4" />
                            </Button>
                          )}
                          {t.autor_bloqueado ? (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-destructive hover:text-foreground"
                              onClick={() => unblockAuthor(t.autor_user_id)}
                              disabled={savingId === t.autor_user_id}
                              aria-label="Desbloquear depoimentos do autor"
                              title="Desbloquear depoimentos do autor"
                            >
                              <MessageSquareText className="h-4 w-4" />
                            </Button>
                          ) : (
                            <Button
                              variant="ghost"
                              size="icon"
                              className="h-8 w-8 text-muted-foreground hover:text-destructive"
                              onClick={() => setBlockTarget({ userId: t.autor_user_id, name: authorLabel(t), afterDelete: false })}
                              disabled={!t.autor_user_id}
                              aria-label="Bloquear novos depoimentos do autor"
                              title="Bloquear novos depoimentos do autor"
                            >
                              <MessageSquareOff className="h-4 w-4" />
                            </Button>
                          )}
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-foreground"
                            onClick={() => openEdit(t)}
                            aria-label="Editar depoimento"
                            title="Editar depoimento"
                          >
                            <Pencil className="h-4 w-4" />
                          </Button>
                          <Button
                            variant="ghost"
                            size="icon"
                            className="h-8 w-8 text-muted-foreground hover:text-destructive"
                            onClick={() => setDeleteTarget(t)}
                            aria-label="Excluir depoimento"
                            title="Excluir depoimento"
                          >
                            <Trash2 className="h-4 w-4" />
                          </Button>
                        </div>
                      </TableCell>
                    </TableRow>
                  ))}
                </TableBody>
              </Table>
            </div>
          </Card>
        )}
      </ContentTransition>

      {/* Edit dialog */}
      <Dialog open={!!editTarget} onOpenChange={(open) => !open && setEditTarget(null)}>
        <DialogContent>
          <DialogHeader>
            <DialogTitle>Editar depoimento</DialogTitle>
            <DialogDescription>
              {editTarget?.group_nome} — {editTarget ? authorLabel(editTarget) : '—'}
              {editTarget?.anonimo ? ' (anônimo para os outros)' : ''}
            </DialogDescription>
          </DialogHeader>
          <Textarea
            value={editText}
            onChange={(e) => setEditText(e.target.value)}
            className="min-h-[140px]"
            maxLength={1000}
          />
          <DialogFooter>
            <Button variant="outline" onClick={() => setEditTarget(null)}>
              Cancelar
            </Button>
            <Button
              onClick={handleSaveEdit}
              disabled={!editText.trim() || savingId === editTarget?.testimonial_id}
            >
              {savingId === editTarget?.testimonial_id ? 'Salvando...' : 'Salvar'}
            </Button>
          </DialogFooter>
        </DialogContent>
      </Dialog>

      {/* Delete confirmation */}
      <AlertDialog open={!!deleteTarget} onOpenChange={(open) => !open && setDeleteTarget(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle className="flex items-center gap-2">
              <Trash2 className="h-5 w-5 text-destructive" />
              Excluir este depoimento?
            </AlertDialogTitle>
            <AlertDialogDescription>
              O depoimento de {deleteTarget ? authorLabel(deleteTarget) : 'usuário'}
              {deleteTarget?.anonimo ? ' (publicado como anônimo)' : ''} em "{deleteTarget?.group_nome}" será excluído
              permanentemente. Essa ação não pode ser desfeita. Em seguida, você pode bloquear novos depoimentos dessa
              pessoa.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel disabled={!!savingId}>Cancelar</AlertDialogCancel>
            <AlertDialogAction
              onClick={(e) => {
                e.preventDefault();
                handleDelete();
              }}
              disabled={!!savingId}
              className="bg-destructive text-destructive-foreground hover:bg-destructive/90"
            >
              {savingId === deleteTarget?.testimonial_id ? 'Excluindo...' : 'Excluir'}
            </AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <BlockTestimonialsModal
        open={!!blockTarget}
        onOpenChange={(open) => !open && setBlockTarget(null)}
        authorName={blockTarget?.name ?? 'o paciente'}
        afterDelete={blockTarget?.afterDelete}
        saving={!!blockTarget && savingId === blockTarget.userId}
        onConfirm={(choice, reason) => (blockTarget ? blockAuthor(blockTarget.userId, choice, reason) : Promise.resolve(false))}
      />
    </div>
  );
};

export default GroupTestimonialModerationPanel;

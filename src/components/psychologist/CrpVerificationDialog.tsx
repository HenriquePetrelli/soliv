import { useEffect, useMemo, useRef, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Badge } from '@/components/ui/badge';
import { Textarea } from '@/components/ui/textarea';
import { AlertTriangle, BadgeCheck, Bookmark, ClipboardPaste, ExternalLink, Loader2, SearchX, SkipForward, Square } from 'lucide-react';
import { Progress } from '@/components/ui/progress';
import { toast } from 'sonner';
import type { PsychologistData } from '@/hooks/usePsychologistManagement';
import {
  buildCfpBookmarkletHref,
  CFP_ORIGIN,
  CFP_SEARCH_URL,
  CFP_WINDOW_NAME,
  isCfpActive,
  matchCfpRows,
  parseCfpCapture,
  parseCrp,
  type CfpCapture,
  type CfpRow,
} from '@/lib/crpVerification';
import { CrpStatusBadge } from './CrpStatusBadge';

interface CrpVerificationDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  psychologist: PsychologistData;
  verifyCrp: (
    psychologistId: string,
    row: CfpRow | null,
    notes?: string,
  ) => Promise<{ success: true; data: PsychologistData } | { success: false; error: string }>;
  onVerified: (updated: PsychologistData) => void;
  /** Verificação de rotina: posição na fila e como pular ou encerrar. */
  routine?: { position: number; total: number; onSkip: () => void; onStop: () => void };
}

const rowKey = (row: CfpRow) => `${row.regiao}|${row.registro}|${row.nome}`;

const copyText = async (text: string) => {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
};

/** Linha do CFP em destaque, com a situação. */
const CfpRowCard = ({ row, selected, onSelect }: { row: CfpRow; selected?: boolean; onSelect?: () => void }) => (
  <button
    type="button"
    onClick={onSelect}
    disabled={!onSelect}
    className={`w-full text-left rounded-md border p-3 text-sm transition-colors ${
      selected ? 'border-primary bg-primary/5' : 'bg-muted/20'
    } ${onSelect ? 'hover:bg-muted/40 cursor-pointer' : 'cursor-default'}`}
  >
    <div className="flex items-start justify-between gap-2">
      <span className="font-medium">{row.nome}</span>
      <Badge
        className={isCfpActive(row.situacao) ? 'bg-success text-success-foreground hover:bg-success' : ''}
        variant={isCfpActive(row.situacao) ? 'default' : 'destructive'}
      >
        {row.situacao || 'Sem situação'}
      </Badge>
    </div>
    <p className="text-muted-foreground mt-1">
      {row.regiao} · Nº {row.registro}
      {row.inscricao ? ` · inscrição ${row.inscricao}` : ''}
    </p>
  </button>
);

export const CrpVerificationDialog = ({ open, onOpenChange, psychologist, verifyCrp, onVerified, routine }: CrpVerificationDialogProps) => {
  const [capture, setCapture] = useState<CfpCapture | null>(null);
  const [pasteOpen, setPasteOpen] = useState(false);
  const [pasted, setPasted] = useState('');
  const [chosen, setChosen] = useState<string | null>(null);
  const [saving, setSaving] = useState(false);
  const bookmarkletRef = useRef<HTMLAnchorElement>(null);

  const crp = parseCrp(psychologist.crp_number);
  const bookmarkletHref = useMemo(() => buildCfpBookmarkletHref(window.location.origin), []);

  // O React avisa sobre href "javascript:"; o atalho precisa ser um, então vai direto no DOM.
  useEffect(() => {
    bookmarkletRef.current?.setAttribute('href', bookmarkletHref);
  });

  // Limpa ao fechar e ao passar para o próximo psicólogo da rotina.
  useEffect(() => {
    setCapture(null);
    setPasted('');
    setPasteOpen(false);
    setChosen(null);
  }, [open, psychologist.id]);

  // Resultado enviado pelo atalho, da janela do CFP aberta pelo botão abaixo.
  useEffect(() => {
    if (!open) return;
    const onMessage = (event: MessageEvent) => {
      if (event.origin !== CFP_ORIGIN) return;
      const parsed = parseCfpCapture(event.data);
      if (!parsed) return;
      setCapture(parsed);
      setChosen(null);
      window.focus();
      toast.success(`${parsed.rows.length} resultado(s) recebido(s) do CFP`);
    };
    window.addEventListener('message', onMessage);
    return () => window.removeEventListener('message', onMessage);
  }, [open]);

  const match = useMemo(() => (capture ? matchCfpRows(psychologist, capture.rows) : null), [capture, psychologist]);

  const selectedRow: CfpRow | null = useMemo(() => {
    if (!match) return null;
    if (match.kind === 'found') return match.row;
    if (match.kind === 'ambiguous') return match.rows.find((r) => rowKey(r) === chosen) ?? null;
    return null;
  }, [match, chosen]);

  const openCfp = async () => {
    const copied = await copyText(psychologist.full_name);
    const win = window.open(CFP_SEARCH_URL, CFP_WINDOW_NAME, 'popup,width=1150,height=850');
    if (!win) {
      toast.error('O navegador bloqueou a janela do CFP. Permita pop-ups para o painel e tente de novo.');
      return;
    }
    toast.info(copied ? 'Nome copiado: cole na busca do CFP' : 'Digite o nome na busca do CFP');
  };

  const handlePaste = () => {
    const parsed = parseCfpCapture(pasted);
    if (!parsed) {
      toast.error('Não reconheci o texto colado. Use o atalho "Soliv: ler CFP" na página de resultados do CFP.');
      return;
    }
    setCapture(parsed);
    setChosen(null);
    setPasteOpen(false);
    setPasted('');
  };

  const save = async (row: CfpRow | null) => {
    setSaving(true);
    const result = await verifyCrp(psychologist.id, row, capture?.query ? `Busca no CFP: "${capture.query}"` : undefined);
    setSaving(false);
    if (!result.success) return;
    const status = result.data.crp_status;
    if (status === 'ativo') toast.success('CRP ativo no CFP: verificação salva');
    else toast.warning('Verificação salva: CRP sem situação ativa no CFP');
    onVerified(result.data);
    // Na rotina, quem chamou passa para o próximo; fora dela, fecha.
    if (!routine) onOpenChange(false);
  };

  const hitLimit = (capture?.rows.length ?? 0) >= 100;

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>{routine ? `Verificação de rotina · ${routine.position} de ${routine.total}` : 'Verificar CRP no CFP'}</DialogTitle>
          <DialogDescription>
            {psychologist.full_name} · CRP {psychologist.crp_number}
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 text-sm">
          {routine && (
            <div className="space-y-2">
              <Progress value={((routine.position - 1) / routine.total) * 100} className="h-2" />
              <div className="flex gap-2">
                <Button variant="outline" size="sm" className="flex-1" onClick={routine.onSkip} disabled={saving}>
                  <SkipForward className="h-4 w-4 mr-2" />
                  Pular este
                </Button>
                <Button variant="ghost" size="sm" className="flex-1" onClick={routine.onStop} disabled={saving}>
                  <Square className="h-4 w-4 mr-2" />
                  Encerrar rotina
                </Button>
              </div>
            </div>
          )}

          <div className="flex items-center gap-2 text-muted-foreground">
            <span>Última verificação:</span>
            <CrpStatusBadge psychologist={psychologist} />
          </div>

          {!crp && (
            <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
              <AlertTriangle className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
              <p>
                O CRP cadastrado não tem número legível. Corrija o cadastro (formato <strong>08/09958</strong>) antes de verificar.
              </p>
            </div>
          )}

          <ol className="list-decimal pl-5 space-y-1 text-muted-foreground">
            <li>Abra o CFP pelo botão abaixo (o nome já vai copiado).</li>
            <li>
              Cole o nome
              {crp?.region ? <>, escolha a <strong>{String(crp.region).padStart(2, '0')}ª Região</strong></> : ''}, resolva o
              reCAPTCHA e clique em Buscar.
            </li>
            <li>
              Na página de resultados, clique no atalho <strong>Soliv: ler CFP</strong> da barra de favoritos.
            </li>
          </ol>

          <div className="flex flex-col sm:flex-row gap-2">
            <Button onClick={openCfp} className="flex-1" disabled={!crp}>
              <ExternalLink className="h-4 w-4 mr-2" />
              Abrir CFP e copiar nome
            </Button>
            <Button variant="outline" onClick={() => setPasteOpen((v) => !v)} className="flex-1">
              <ClipboardPaste className="h-4 w-4 mr-2" />
              Colar resultado
            </Button>
          </div>

          {pasteOpen && (
            <div className="space-y-2">
              <Textarea
                value={pasted}
                onChange={(e) => setPasted(e.target.value)}
                placeholder="Cole aqui o que o atalho copiou na página do CFP"
                rows={3}
              />
              <Button size="sm" onClick={handlePaste} disabled={!pasted.trim()}>
                Ler resultado colado
              </Button>
            </div>
          )}

          {!capture && crp && (
            <div className="flex items-center gap-2 rounded-md border border-dashed p-3 text-muted-foreground">
              <Loader2 className="h-4 w-4 animate-spin" />
              Aguardando o resultado do CFP…
            </div>
          )}

          {capture && match && (
            <div className="space-y-3 rounded-lg border p-3">
              <p className="text-xs text-muted-foreground">
                {capture.rows.length} resultado(s) lido(s) do CFP{capture.query ? ` para "${capture.query}"` : ''}.
              </p>

              {match.kind === 'found' && (
                <>
                  <CfpRowCard row={match.row} />
                  {!match.nameMatches && (
                    <div className="flex gap-2 rounded-md border border-warning/30 bg-warning/10 p-3">
                      <AlertTriangle className="h-4 w-4 shrink-0 text-warning mt-0.5" />
                      <p>
                        O número bate, mas o nome no CFP é diferente do cadastro ({psychologist.full_name}). Confira se é a
                        mesma pessoa antes de confirmar.
                      </p>
                    </div>
                  )}
                </>
              )}

              {match.kind === 'ambiguous' && (
                <div className="space-y-2">
                  <p>Mais de um registro com esse número. Escolha o da pessoa cadastrada:</p>
                  {match.rows.map((row) => (
                    <CfpRowCard key={rowKey(row)} row={row} selected={chosen === rowKey(row)} onSelect={() => setChosen(rowKey(row))} />
                  ))}
                </div>
              )}

              {match.kind === 'not_found' && (
                <div className="flex gap-2 rounded-md border border-destructive/30 bg-destructive/10 p-3">
                  <SearchX className="h-4 w-4 shrink-0 text-destructive mt-0.5" />
                  <div className="space-y-1">
                    <p>O CRP {psychologist.crp_number} não está entre os resultados.</p>
                    {hitLimit && (
                      <p className="text-muted-foreground">
                        A busca bateu no limite de 100 do CFP: use o nome completo ou a busca avançada e leia de novo.
                      </p>
                    )}
                    <p className="text-muted-foreground">Confira a região e o nome antes de marcar como não encontrado.</p>
                  </div>
                </div>
              )}

              {(match.kind === 'found' || match.kind === 'ambiguous') && (
                <Button className="w-full" onClick={() => save(selectedRow)} disabled={!selectedRow || saving}>
                  <BadgeCheck className="h-4 w-4 mr-2" />
                  {saving
                    ? 'Salvando…'
                    : selectedRow
                      ? `Confirmar: ${selectedRow.situacao || 'sem situação'} no CFP`
                      : 'Escolha um registro'}
                </Button>
              )}

              {match.kind === 'not_found' && (
                <Button variant="destructive" className="w-full" onClick={() => save(null)} disabled={saving}>
                  {saving ? 'Salvando…' : 'Marcar como não encontrado no CFP'}
                </Button>
              )}
            </div>
          )}

          <details className="rounded-md border p-3">
            <summary className="cursor-pointer font-medium flex items-center gap-2">
              <Bookmark className="h-4 w-4" />
              Instalar o atalho (uma vez só)
            </summary>
            <div className="mt-3 space-y-2 text-muted-foreground">
              <p>
                Mostre a barra de favoritos (Ctrl+Shift+B ou ⌘+Shift+B) e <strong>arraste</strong> o botão abaixo até ela.
              </p>
              <a
                ref={bookmarkletRef}
                onClick={(e) => {
                  e.preventDefault();
                  toast.info('Arraste este botão para a barra de favoritos; ele só funciona na página do CFP.');
                }}
                className="inline-flex items-center gap-2 rounded-md border bg-primary px-3 py-1.5 font-medium text-primary-foreground"
                draggable
              >
                <Bookmark className="h-4 w-4" />
                Soliv: ler CFP
              </a>
              <p>
                O atalho só lê a tabela de resultados que já está na tela do CFP e manda para este painel. A busca e o
                reCAPTCHA continuam com você.
              </p>
            </div>
          </details>
        </div>
      </DialogContent>
    </Dialog>
  );
};

import { useState, useEffect, useRef } from 'react';
import { useAuth } from '@/contexts/AuthContext';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription, DialogFooter } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Textarea } from '@/components/ui/textarea';
import { Label } from '@/components/ui/label';
import { JournalEntry } from '@/hooks/usePrivateJournal';
import { usePatientStatistics } from '@/hooks/usePatientStatistics';
import { JOURNAL_MOODS, DEFAULT_JOURNAL_MOOD } from './journalMoods';
import { cn } from '@/lib/utils';

interface JournalEntryModalProps {
  isOpen: boolean;
  onClose: () => void;
  onSave: (texto: string, humor: number, id?: string) => Promise<void>;
  editingEntry?: JournalEntry | null;
  loading?: boolean;
}

const JournalEntryModal = ({ 
  isOpen, 
  onClose, 
  onSave, 
  editingEntry, 
  loading = false 
}: JournalEntryModalProps) => {
  const [texto, setTexto] = useState('');
  const [humor, setHumor] = useState<number>(DEFAULT_JOURNAL_MOOD);
  const { addActivity } = usePatientStatistics({ load: false });
  const { user } = useAuth();
  // Rascunho da anotação nova no aparelho: fechar sem querer, recarregar ou
  // falhar o envio não apaga o que foi escrito. Sai ao salvar ou ao sair da conta.
  const draftKey = user ? `diario:rascunho:${user.id}` : null;
  const entryIdRef = useRef<string | null>(null);

  useEffect(() => {
    if (!isOpen) return;
    if (editingEntry) {
      setTexto(editingEntry.texto);
      setHumor(editingEntry.humor);
      return;
    }
    let draft: { texto?: string; humor?: number; id?: string } | null = null;
    try {
      draft = draftKey ? JSON.parse(localStorage.getItem(draftKey) ?? 'null') : null;
    } catch {
      draft = null;
    }
    setTexto(draft?.texto ?? '');
    setHumor(typeof draft?.humor === 'number' ? draft.humor : DEFAULT_JOURNAL_MOOD);
    entryIdRef.current =
      draft?.id ?? (typeof crypto !== 'undefined' && typeof crypto.randomUUID === 'function' ? crypto.randomUUID() : null);
  }, [editingEntry, isOpen, draftKey]);

  useEffect(() => {
    if (!isOpen || editingEntry || !draftKey) return;
    try {
      if (texto.trim()) localStorage.setItem(draftKey, JSON.stringify({ texto, humor, id: entryIdRef.current }));
      else localStorage.removeItem(draftKey);
    } catch {
      /* sem armazenamento */
    }
  }, [texto, humor, isOpen, editingEntry, draftKey]);

  const handleSave = async () => {
    if (!texto.trim()) return;
    try {
      await onSave(texto.trim(), humor, editingEntry ? undefined : entryIdRef.current ?? undefined);
    } catch {
      // onSave já mostra o erro (toast) — mantém a modal aberta com o texto
      // digitado pra não perder a anotação (ex.: limite diário atingido).
      return;
    }

    // Track activity only for new entries
    if (!editingEntry) {
      addActivity("Diário Privado");
    }

    handleClose();
  };

  const handleClose = () => {
    setTexto('');
    setHumor(DEFAULT_JOURNAL_MOOD);
    onClose();
  };

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="p-0 gap-0 max-w-full w-screen h-[100dvh] sm:h-auto sm:max-h-[90vh] sm:max-w-[500px] sm:rounded-2xl rounded-none flex flex-col">
        <DialogHeader className="sticky top-0 z-10 bg-background border-b px-6 py-4 text-left">
          <DialogTitle>
            {editingEntry ? 'Editar Anotação' : 'Nova Anotação do Diário'}
          </DialogTitle>
          <DialogDescription>
            {editingEntry 
              ? 'Modifique o texto e humor da sua anotação do diário.' 
              : 'Crie uma nova anotação no seu diário pessoal.'
            }
          </DialogDescription>
        </DialogHeader>

        <div className="flex-1 overflow-y-auto px-6 py-4">
          <div className="space-y-4">
            {/* Seletor de humor — mesmo layout do registro de humor */}
            <div className="space-y-2">
              <Label>Como está se sentindo hoje?</Label>
              <div className="grid grid-cols-2 sm:grid-cols-3 lg:grid-cols-5 gap-3 pt-2">
                {JOURNAL_MOODS.map((mood) => {
                  const Icon = mood.Icon;
                  const isSelected = humor === mood.value;
                  return (
                    <button
                      key={mood.value}
                      type="button"
                      onClick={() => setHumor(mood.value)}
                      className={cn(
                        'flex flex-col items-center justify-center gap-2 p-4 rounded-xl border-2 transition-all duration-200 bg-background',
                        isSelected ? `${mood.borderClass} ${mood.bgClass}` : 'border-border hover:border-foreground/20'
                      )}
                    >
                      <Icon className={cn('w-7 h-7', isSelected ? mood.colorClass : 'text-muted-foreground')} />
                      <span className={cn('text-sm font-medium', isSelected ? mood.colorClass : 'text-muted-foreground')}>
                        {mood.label}
                      </span>
                    </button>
                  );
                })}
              </div>
            </div>

            {/* Campo de texto */}
            <div className="space-y-2">
              <Label htmlFor="texto">Sua anotação</Label>
              <Textarea
                id="texto"
                placeholder="Escreva seus pensamentos e sentimentos..."
                value={texto}
                onChange={(e) => setTexto(e.target.value)}
                className="min-h-[120px] resize-none"
                maxLength={1000}
              />
              <div className="text-xs text-muted-foreground text-right">
                {texto.length}/1000 caracteres
              </div>
            </div>

            <DialogFooter className="pt-2 pb-8 sm:pb-2">
              <Button 
                onClick={handleSave} 
                disabled={!texto.trim() || loading}
                className="w-full sm:w-auto"
              >
                {loading ? 'Salvando...' : 'Salvar'}
              </Button>
            </DialogFooter>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

export default JournalEntryModal;
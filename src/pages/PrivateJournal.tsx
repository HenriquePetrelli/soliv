import { useState, useEffect } from 'react';
import { Button } from '@/components/ui/button';
import { Plus, BookOpen } from 'lucide-react';
import { usePrivateJournal, JournalEntry } from '@/hooks/usePrivateJournal';
import JournalEntryCard from '@/components/journal/JournalEntryCard';
import JournalEntryModal from '@/components/journal/JournalEntryModal';
import MoodFilter from '@/components/journal/MoodFilter';
import PatientBottomNav from '@/components/PatientBottomNav';
import PageHeader from '@/components/PageHeader';
import { Skeleton } from '@/components/ui/skeleton';
import SubscriptionUpgradeModal from '@/components/SubscriptionUpgradeModal';
import { usePlanLimits } from '@/hooks/usePlanLimits';
import { AlertDialog, AlertDialogAction, AlertDialogCancel, AlertDialogContent, AlertDialogDescription, AlertDialogFooter, AlertDialogHeader, AlertDialogTitle } from '@/components/ui/alert-dialog';

const PrivateJournal = () => {
  const {
    entries,
    loading,
    fetchEntries,
    createEntry,
    updateEntry,
    deleteEntry,
  } = usePrivateJournal();

  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingEntry, setEditingEntry] = useState<JournalEntry | null>(null);
  const [selectedMood, setSelectedMood] = useState<number | null>(null);
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [modalLoading, setModalLoading] = useState(false);
  const [showUpgrade, setShowUpgrade] = useState(false);
  // Plano Grátis: o diário é só para leitura (o banco também recusa).
  const readOnly = usePlanLimits().isFree;

  useEffect(() => {
    fetchEntries(selectedMood ?? undefined);
  }, [fetchEntries, selectedMood]);

  const handleCreateEntry = () => {
    if (readOnly) {
      setShowUpgrade(true);
      return;
    }
    setEditingEntry(null);
    setIsModalOpen(true);
  };

  const handleEditEntry = (entry: JournalEntry) => {
    if (readOnly) {
      setShowUpgrade(true);
      return;
    }
    setEditingEntry(entry);
    setIsModalOpen(true);
  };

  const handleSaveEntry = async (texto: string, humor: number, id?: string) => {
    setModalLoading(true);
    try {
      if (editingEntry) {
        await updateEntry(editingEntry.id, texto, humor);
      } else {
        await createEntry(texto, humor, id);
      }
    } finally {
      setModalLoading(false);
    }
  };

  const handleDeleteEntry = (id: string) => {
    setDeleteId(id);
  };

  const confirmDelete = async () => {
    if (deleteId) {
      await deleteEntry(deleteId);
      setDeleteId(null);
    }
  };

  const handleMoodFilter = (mood: number | null) => {
    setSelectedMood(mood);
  };

  return (
    <div className="has-tabs">
      <div className="screen">
        {/* Header */}
        <div className="sticky top-0 z-10 bg-background/95 backdrop-blur-sm">
          <PageHeader
            title="Meu Diário"
            backTo="/home"
            rightAction={
              <Button
                onClick={handleCreateEntry}
                size="icon"
                aria-label="Adicionar anotação"
                className="rounded-full bg-white/15 text-white hover:bg-white/25 hover:text-white h-10 w-10"
                variant="ghost"
              >
                <Plus className="h-5 w-5" />
              </Button>
            }
          />
          <div className="px-4 py-4 border-b">
            <MoodFilter
              selectedMood={selectedMood}
              onMoodSelect={handleMoodFilter}
            />
          </div>
        </div>

        {/* Conteúdo */}
        <main className="p-4">
          {readOnly && (
            <div role="note" className="mb-4 rounded-lg border border-primary/30 bg-primary/5 p-3 text-sm">
              No Plano Grátis o diário é só para leitura.{' '}
              <button type="button" className="font-medium text-primary underline underline-offset-2" onClick={() => setShowUpgrade(true)}>
                Ver planos
              </button>{' '}
              para voltar a escrever.
            </div>
          )}
          {loading ? (
            <div className="space-y-4">
              {[...Array(3)].map((_, i) => (
                <div key={i} className="space-y-3">
                  <Skeleton className="h-4 w-1/3" />
                  <Skeleton className="h-20 w-full" />
                  <Skeleton className="h-4 w-1/4" />
                </div>
              ))}
            </div>
          ) : entries.length === 0 ? (
            <div className="text-center py-12">
              <BookOpen className="w-16 h-16 mx-auto mb-4 text-muted-foreground" />
              <h2 className="text-lg font-medium mb-2">Seu diário está vazio</h2>
              <p className="text-muted-foreground mb-6">
                {selectedMood !== null 
                  ? 'Não há anotações com esse humor.' 
                  : 'Comece escrevendo sua primeira anotação!'
                }
              </p>
              {selectedMood === null && (
                <Button onClick={handleCreateEntry}>
                  <Plus className="h-4 w-4 mr-2" />
                  Criar Primeira Anotação
                </Button>
              )}
            </div>
          ) : (
            <div className="space-y-4">
              {entries.map((entry) => (
                <JournalEntryCard
                  key={entry.id}
                  entry={entry}
                  onEdit={handleEditEntry}
                  onDelete={handleDeleteEntry}
                />
              ))}
            </div>
          )}
        </main>
      </div>

      <SubscriptionUpgradeModal
        isOpen={showUpgrade}
        onClose={() => setShowUpgrade(false)}
        feature="Escrever no diário"
        description="No Plano Grátis o diário é só para leitura. Para escrever e editar anotações, escolha o Essencial, o Flex ou o Completo."
      />

      {/* Modal de anotação */}
      <JournalEntryModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        onSave={handleSaveEntry}
        editingEntry={editingEntry}
        loading={modalLoading}
      />

      {/* Dialog de confirmação de exclusão */}
      <AlertDialog open={!!deleteId} onOpenChange={() => setDeleteId(null)}>
        <AlertDialogContent>
          <AlertDialogHeader>
            <AlertDialogTitle>Excluir Anotação</AlertDialogTitle>
            <AlertDialogDescription>
              Tem certeza de que deseja excluir esta anotação? Esta ação não pode ser desfeita.
            </AlertDialogDescription>
          </AlertDialogHeader>
          <AlertDialogFooter>
            <AlertDialogCancel>Cancelar</AlertDialogCancel>
            <AlertDialogAction onClick={confirmDelete}>Excluir</AlertDialogAction>
          </AlertDialogFooter>
        </AlertDialogContent>
      </AlertDialog>

      <PatientBottomNav />
    </div>
  );
};

export default PrivateJournal;
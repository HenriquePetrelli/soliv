import React, { useState, useEffect } from 'react';
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
} from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Checkbox } from '@/components/ui/checkbox';
import { Label } from '@/components/ui/label';
import { ScrollArea } from '@/components/ui/scroll-area';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';
import { toast as notify } from 'sonner';
import { Loader2 } from 'lucide-react';

interface EditSymptomsModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  userId: string;
}

export const EditSymptomsModal: React.FC<EditSymptomsModalProps> = ({
  open,
  onOpenChange,
  userId
}) => {
  const { toast } = useToast();
  const [allSymptoms, setAllSymptoms] = useState<string[]>([]);
  const [selectedSymptoms, setSelectedSymptoms] = useState<string[]>([]);
  const [loading, setLoading] = useState(true);
  const [saving, setSaving] = useState(false);

  useEffect(() => {
    if (open) {
      loadSymptoms();
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, [open, userId]);

  const loadSymptoms = async () => {
    setLoading(true);
    try {
      // Buscar todos os sintomas da tabela transtornos_sintomas
      const { data: transtornosData, error: transtornosError } = await supabase
        .from('transtornos_sintomas')
        .select('sintomas');

      if (transtornosError) throw transtornosError;

      // Extrair e unificar todos os sintomas em um array único
      const allSymptomsSet = new Set<string>();
      transtornosData?.forEach(row => {
        if (Array.isArray(row.sintomas)) {
          row.sintomas.forEach(symptom => allSymptomsSet.add(symptom));
        }
      });

      const symptomsArray = Array.from(allSymptomsSet).sort();

      // Buscar sintomas já selecionados pelo paciente
      const { data: patientData, error: patientError } = await supabase
        .from('patients')
        .select('sintomas_selecionados')
        .eq('user_id', userId)
        .single();

      if (patientError && patientError.code !== 'PGRST116') {
        throw patientError;
      }

      const currentSelected = patientData?.sintomas_selecionados || [];
      
      // Ordenar: sintomas selecionados primeiro
      const sortedSymptoms = [
        ...symptomsArray.filter(s => currentSelected.includes(s)),
        ...symptomsArray.filter(s => !currentSelected.includes(s))
      ];

      setAllSymptoms(sortedSymptoms);
      setSelectedSymptoms(currentSelected);
    } catch (error) {
      console.error('Error loading symptoms:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível carregar os sintomas.',
        variant: 'destructive'
      });
    } finally {
      setLoading(false);
    }
  };

  const handleToggleSymptom = (symptom: string) => {
    setSelectedSymptoms(prev => {
      if (prev.includes(symptom)) {
        return prev.filter(s => s !== symptom);
      } else {
        return [...prev, symptom];
      }
    });
  };

  const handleSave = async () => {
    setSaving(true);
    try {
      const { error } = await supabase
        .from('patients')
        .update({ sintomas_selecionados: selectedSymptoms })
        .eq('user_id', userId);

      if (error) throw error;

      // Fecha a janela primeiro e avisa na tela de trás, depois da animação de
      // saída: o aviso disparado com a janela aberta sumia junto com ela.
      onOpenChange(false);
      window.setTimeout(() => {
        notify.success('Sintomas atualizados', {
          description: 'Vamos usar suas respostas para indicar o cuidado certo para você.',
        });
      }, 250);
    } catch (error) {
      console.error('Error saving symptoms:', error);
      toast({
        title: 'Erro',
        description: 'Não foi possível salvar as alterações.',
        variant: 'destructive'
      });
    } finally {
      setSaving(false);
    }
  };

  const handleCancel = () => {
    onOpenChange(false);
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[80vh]">
        <DialogHeader>
          <DialogTitle>Meus sintomas</DialogTitle>
          <DialogDescription>
            Selecione os sintomas que você está sentindo. Você pode marcar ou desmarcar conforme necessário.
          </DialogDescription>
        </DialogHeader>

        {loading ? (
          <div className="flex items-center justify-center py-8">
            <Loader2 className="w-8 h-8 animate-spin text-primary" />
          </div>
        ) : (
          <ScrollArea className="h-[400px] pr-4">
            <div className="space-y-4">
              {allSymptoms.map((symptom) => {
                const isSelected = selectedSymptoms.includes(symptom);
                return (
                  <div
                    key={symptom}
                    className={`flex items-center space-x-3 p-3 rounded-lg border transition-colors ${
                      isSelected
                        ? 'border-primary bg-primary/5'
                        : 'border-border hover:border-primary/50'
                    }`}
                  >
                    <Checkbox
                      id={symptom}
                      checked={isSelected}
                      onCheckedChange={() => handleToggleSymptom(symptom)}
                    />
                    <Label
                      htmlFor={symptom}
                      className="flex-1 cursor-pointer text-sm font-medium leading-relaxed"
                    >
                      {symptom}
                    </Label>
                  </div>
                );
              })}
            </div>
          </ScrollArea>
        )}

        <DialogFooter>
          <Button
            variant="outline"
            onClick={handleCancel}
            disabled={saving}
          >
            Cancelar
          </Button>
          <Button
            onClick={handleSave}
            disabled={saving || loading}
          >
            {saving ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Salvando...
              </>
            ) : (
              'Confirmar'
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default EditSymptomsModal;

import React, { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { useToast } from '@/hooks/use-toast';

interface PixModalProps {
  isOpen: boolean;
  onClose: () => void;
  userId: string;
  /** "required": primeiro cadastro, não fecha sem a chave. "edit": troca pelo Perfil. */
  mode?: 'required' | 'edit';
}

const PIX_TYPES = [
  { value: 'cpf', label: 'CPF' },
  { value: 'cnpj', label: 'CNPJ' },
  { value: 'email', label: 'Email' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'aleatoria', label: 'Chave aleatória' }
];

export const PixModal: React.FC<PixModalProps> = ({ isOpen, onClose, userId, mode = 'required' }) => {
  const [pixType, setPixType] = useState<string>('');
  const [pixKey, setPixKey] = useState<string>('');
  const [isLoading, setIsLoading] = useState(false);
  const { toast } = useToast();
  const editing = mode === 'edit';

  // Na troca, já abre com a chave atual.
  useEffect(() => {
    if (!isOpen || !editing) return;
    let cancelled = false;
    void supabase.rpc('get_my_psychologist_private').then(({ data }) => {
      const row = data?.[0];
      if (cancelled || !row?.pix_key) return;
      setPixType(row.pix_type ?? '');
      setPixKey(row.pix_key);
    });
    return () => {
      cancelled = true;
    };
  }, [isOpen, editing]);

  const formatPixKey = (type: string, value: string): string => {
    const numbers = value.replace(/\D/g, '');
    
    switch (type) {
      case 'cpf':
        return numbers
          .replace(/(\d{3})(\d)/, '$1.$2')
          .replace(/(\d{3})(\d)/, '$1.$2')
          .replace(/(\d{3})(\d{1,2})/, '$1-$2')
          .replace(/(-\d{2})\d+?$/, '$1');
      case 'cnpj':
        return numbers
          .replace(/(\d{2})(\d)/, '$1.$2')
          .replace(/(\d{3})(\d)/, '$1.$2')
          .replace(/(\d{3})(\d)/, '$1/$2')
          .replace(/(\d{4})(\d{1,2})/, '$1-$2')
          .replace(/(-\d{2})\d+?$/, '$1');
      case 'telefone':
        if (numbers.length <= 10) {
          return numbers
            .replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{4})(\d)/, '$1-$2')
            .replace(/(-\d{4})\d+?$/, '$1');
        } else {
          return numbers
            .replace(/(\d{2})(\d)/, '($1) $2')
            .replace(/(\d{5})(\d)/, '$1-$2')
            .replace(/(-\d{4})\d+?$/, '$1');
        }
      default:
        return value;
    }
  };

  const validatePixKey = (type: string, key: string): boolean => {
    if (!key.trim()) return false;

    switch (type) {
      case 'cpf': {
        const cpfNumbers = key.replace(/\D/g, '');
        if (cpfNumbers.length !== 11) return false;

        // Validação básica de CPF
        let sum = 0;
        let remainder;

        if (cpfNumbers === "00000000000") return false;

        for (let i = 1; i <= 9; i++) {
          sum = sum + parseInt(cpfNumbers.substring(i-1, i)) * (11 - i);
        }
        remainder = (sum * 10) % 11;

        if ((remainder === 10) || (remainder === 11)) remainder = 0;
        if (remainder !== parseInt(cpfNumbers.substring(9, 10))) return false;

        sum = 0;
        for (let i = 1; i <= 10; i++) {
          sum = sum + parseInt(cpfNumbers.substring(i-1, i)) * (12 - i);
        }
        remainder = (sum * 10) % 11;

        if ((remainder === 10) || (remainder === 11)) remainder = 0;
        if (remainder !== parseInt(cpfNumbers.substring(10, 11))) return false;

        return true;
      }

      case 'cnpj': {
        const cnpjNumbers = key.replace(/\D/g, '');
        return cnpjNumbers.length === 14;
      }

      case 'email': {
        const emailRegex = /^[^\s@]+@[^\s@]+\.[^\s@]+$/;
        return emailRegex.test(key);
      }

      case 'telefone': {
        const phoneNumbers = key.replace(/\D/g, '');
        return phoneNumbers.length >= 10 && phoneNumbers.length <= 11;
      }

      case 'aleatoria': {
        // Chave aleatória deve ter pelo menos 10 caracteres e seguir padrão UUID
        const uuidRegex = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
        return key.length >= 10 && (uuidRegex.test(key) || key.length >= 32);
      }

      default:
        return false;
    }
  };

  const handlePixKeyChange = (value: string) => {
    if (!pixType) {
      setPixKey(value);
      return;
    }

    if (pixType === 'cpf' || pixType === 'cnpj' || pixType === 'telefone') {
      const formatted = formatPixKey(pixType, value);
      setPixKey(formatted);
    } else {
      setPixKey(value);
    }
  };

  const handleSave = async () => {
    if (!pixType || !pixKey) {
      toast({
        title: "Campos obrigatórios",
        description: "Preencha o tipo e a chave PIX.",
        variant: "destructive"
      });
      return;
    }

    if (!validatePixKey(pixType, pixKey)) {
      toast({
        title: "Chave PIX inválida",
        description: "Chave PIX inválida para o tipo selecionado.",
        variant: "destructive"
      });
      return;
    }

    setIsLoading(true);

    try {
      const { error } = await supabase
        .from('psychologists')
        .update({
          pix_type: pixType,
          pix_key: pixKey
        })
        .eq('user_id', userId);

      if (error) throw error;

      toast({ title: editing ? "Chave PIX atualizada" : "Chave PIX cadastrada" });

      onClose();
    } catch (error: unknown) {
      console.error('Erro ao salvar PIX:', error);
      toast({
        title: "Erro ao salvar",
        description: "Não foi possível salvar a chave PIX.",
        variant: "destructive"
      });
    } finally {
      setIsLoading(false);
    }
  };

  const getPixKeyPlaceholder = () => {
    switch (pixType) {
      case 'cpf':
        return '000.000.000-00';
      case 'cnpj':
        return '00.000.000/0000-00';
      case 'email':
        return 'exemplo@email.com';
      case 'telefone':
        return '(11) 99999-9999';
      case 'aleatoria':
        return 'Digite sua chave aleatória';
      default:
        return 'Selecione um tipo primeiro';
    }
  };

  return (
    <Dialog open={isOpen} onOpenChange={(open) => { if (!open && editing) onClose(); }}>
      <DialogContent className="sm:max-w-md"
        onInteractOutside={(e) => { if (!editing) e.preventDefault(); }}
        onEscapeKeyDown={(e) => { if (!editing) e.preventDefault(); }}
      >
        <DialogHeader>
          <DialogTitle>{editing ? 'Chave PIX' : 'Cadastro de Chave PIX'}</DialogTitle>
        </DialogHeader>
        
        <div className="space-y-4 py-4">
          <p className="text-sm text-muted-foreground">
            {editing
              ? 'Os repasses das suas consultas e SOS são feitos para esta chave.'
              : 'Para continuar, é necessário cadastrar uma chave PIX para recebimento de pagamentos.'}
          </p>
          
          <div className="space-y-2">
            <Label htmlFor="pix-type">Tipo da chave PIX *</Label>
            <Select value={pixType} onValueChange={setPixType}>
              <SelectTrigger>
                <SelectValue placeholder="Selecione o tipo da chave" />
              </SelectTrigger>
              <SelectContent className="bg-background border border-border">
                {PIX_TYPES.map((type) => (
                  <SelectItem key={type.value} value={type.value}>
                    {type.label}
                  </SelectItem>
                ))}
              </SelectContent>
            </Select>
          </div>

          <div className="space-y-2">
            <Label htmlFor="pix-key">Chave PIX *</Label>
            <Input
              id="pix-key"
              type="text"
              value={pixKey}
              onChange={(e) => handlePixKeyChange(e.target.value)}
              placeholder={getPixKeyPlaceholder()}
              disabled={!pixType}
              maxLength={pixType === 'cpf' ? 14 : pixType === 'cnpj' ? 18 : pixType === 'telefone' ? 15 : undefined}
            />
          </div>

          <div className="flex justify-end space-x-2 pt-4">
            <Button 
              onClick={handleSave} 
              disabled={isLoading || !pixType || !pixKey}
              className="w-full"
            >
              {isLoading ? 'Salvando...' : 'Confirmar'}
            </Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};
import { useEffect, useMemo, useState } from 'react';
import { Dialog, DialogContent, DialogHeader, DialogTitle, DialogDescription } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Button } from '@/components/ui/button';
import { Progress } from '@/components/ui/progress';
import { useToast } from '@/hooks/use-toast';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import { supabase } from '@/integrations/supabase/client';
import { passwordProblem } from '@/lib/password';

interface PasswordChangeModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  currentEmail: string;
}

const getStrength = (pwd: string) => {
  let score = 0;
  if (pwd.length >= 8) score++;
  if (/[A-Z]/.test(pwd)) score++;
  if (/[a-z]/.test(pwd)) score++;
  if (/\d/.test(pwd)) score++;
  if (/[^A-Za-z0-9]/.test(pwd)) score++;
  return Math.min(score, 5);
};

export const PasswordChangeModal = ({ open, onOpenChange, currentEmail }: PasswordChangeModalProps) => {
  const { toast } = useToast();
  const [currentPassword, setCurrentPassword] = useState('');
  const [newPassword, setNewPassword] = useState('');
  const [confirmPassword, setConfirmPassword] = useState('');
  const [loading, setLoading] = useState(false);

  const strength = useMemo(() => getStrength(newPassword), [newPassword]);
  const strengthPct = (strength / 5) * 100;
  const strengthLabel = ['Muito fraca', 'Fraca', 'Ok', 'Forte', 'Muito forte'][Math.max(0, strength - 1)] || 'Muito fraca';

  useEffect(() => {
    if (!open) {
      setCurrentPassword('');
      setNewPassword('');
      setConfirmPassword('');
      setLoading(false);
    }
  }, [open]);

  const handleSave = async () => {
    const weakPassword = passwordProblem(newPassword ?? '');
    if (weakPassword) {
      toast({ title: 'Senha inválida', description: weakPassword, variant: 'destructive' });
      return;
    }
    if (newPassword !== confirmPassword) {
      toast({ title: 'As senhas não coincidem', description: 'Verifique e tente novamente.', variant: 'destructive' });
      return;
    }

    try {
      setLoading(true);
      // Verificar senha atual realizando um sign-in silencioso
      const { error: signInErr } = await supabase.auth.signInWithPassword({ email: currentEmail, password: currentPassword });
      if (signInErr) {
        throw new Error('Senha atual incorreta.');
      }

      const { error } = await supabase.auth.updateUser({ password: newPassword });
      if (error) throw error;

      toast({ title: 'Senha atualizada' });
      onOpenChange(false);
    } catch (e: unknown) {
      toast({ title: 'Erro ao alterar senha', description: getFriendlyErrorMessage(e, 'Não foi possível alterar a senha.'), variant: 'destructive' });
    } finally {
      setLoading(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent aria-describedby={undefined}>
        <DialogHeader>
          <DialogTitle>Alterar Senha</DialogTitle>
          <DialogDescription>Por segurança, confirme sua senha atual.</DialogDescription>
        </DialogHeader>

        <div className="space-y-4">
          <div>
            <label className="text-sm text-muted-foreground">Senha Atual</label>
            <Input type="password" value={currentPassword} onChange={(e) => setCurrentPassword(e.target.value)} />
          </div>

          <div>
            <label className="text-sm text-muted-foreground">Nova Senha</label>
            <Input type="password" value={newPassword} onChange={(e) => setNewPassword(e.target.value)} />
            <div className="mt-2 space-y-1">
              <Progress value={strengthPct} />
              <p className="text-xs text-muted-foreground">Força da senha: {strengthLabel}</p>
            </div>
          </div>

          <div>
            <label className="text-sm text-muted-foreground">Confirmar Nova Senha</label>
            <Input type="password" value={confirmPassword} onChange={(e) => setConfirmPassword(e.target.value)} />
          </div>

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="outline" onClick={() => onOpenChange(false)} disabled={loading}>Cancelar</Button>
            <Button onClick={handleSave} disabled={loading}>{loading ? 'Salvando...' : 'Salvar'}</Button>
          </div>
        </div>
      </DialogContent>
    </Dialog>
  );
};

import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Eye, EyeOff, Loader2 } from 'lucide-react';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import type { AdminPatient } from '@/hooks/usePatientManagement';
import { passwordProblem } from '@/lib/password';

interface EditPatientModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  patient: AdminPatient | null;
  onSaved: (updated?: AdminPatient) => void;
}

export const EditPatientModal = ({ open, onOpenChange, patient, onSaved }: EditPatientModalProps) => {
  const [form, setForm] = useState({
    full_name: '',
    email: '',
    cpf: '',
    phone: '',
    state: '',
    city: '',
    password: '',
  });
  const [saving, setSaving] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  useEffect(() => {
    if (patient && open) {
      setForm({
        full_name: patient.full_name || '',
        email: patient.email || '',
        cpf: patient.cpf || '',
        phone: patient.phone || '',
        state: patient.state || '',
        city: patient.city || '',
        password: '',
      });
      setShowPassword(false);
    }
  }, [patient, open]);

  const set = (key: keyof typeof form) => (e: React.ChangeEvent<HTMLInputElement>) =>
    setForm((prev) => ({ ...prev, [key]: e.target.value }));

  const submit = async () => {
    if (!patient) return;
    if (form.full_name.trim().length < 2) return toast.error('Informe o nome completo');
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(form.email.trim())) return toast.error('E-mail inválido');
    if (form.password && passwordProblem(form.password)) return toast.error(passwordProblem(form.password)!);

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-update-patient', {
        body: {
          patient_id: patient.id,
          full_name: form.full_name,
          email: form.email,
          cpf: form.cpf,
          phone: form.phone,
          state: form.state,
          city: form.city,
          password: form.password || undefined,
        },
      });
      if (error) throw error;
      if (data?.error) throw new Error(data.error);
      toast.success(data?.warning || data?.message || 'Paciente atualizado');
      onOpenChange(false);
      onSaved(data?.data);
    } catch (err: unknown) {
      toast.error(getFriendlyErrorMessage(err, 'Erro ao atualizar paciente'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Paciente</DialogTitle>
          <DialogDescription>Atualize as informações cadastrais do paciente</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-4">
            <h4 className="text-sm font-medium">Informações Básicas</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="patient_full_name">Nome completo</Label>
                <Input id="patient_full_name" value={form.full_name} onChange={set('full_name')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patient_cpf">CPF</Label>
                <Input id="patient_cpf" value={form.cpf} onChange={set('cpf')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patient_email">Email</Label>
                <Input id="patient_email" type="email" value={form.email} onChange={set('email')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patient_password">Nova senha</Label>
                <div className="relative">
                  <Input
                    id="patient_password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Deixe em branco para manter"
                    value={form.password}
                    onChange={set('password')}
                    className="pr-10"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword((v) => !v)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground"
                    aria-label={showPassword ? 'Ocultar senha' : 'Mostrar senha'}
                  >
                    {showPassword ? <EyeOff className="h-4 w-4" /> : <Eye className="h-4 w-4" />}
                  </button>
                </div>
              </div>
              <div className="space-y-2">
                <Label htmlFor="patient_phone">Telefone</Label>
                <Input id="patient_phone" value={form.phone} onChange={set('phone')} />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h4 className="text-sm font-medium">Localização</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="patient_state">Estado</Label>
                <Input id="patient_state" value={form.state} onChange={set('state')} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="patient_city">Cidade</Label>
                <Input id="patient_city" value={form.city} onChange={set('city')} />
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={submit} disabled={saving}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

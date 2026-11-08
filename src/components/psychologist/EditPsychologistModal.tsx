import { useEffect, useState } from 'react';
import { Dialog, DialogContent, DialogDescription, DialogFooter, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Button } from '@/components/ui/button';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Textarea } from '@/components/ui/textarea';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { supabase } from '@/integrations/supabase/client';
import { SPECIALIZATIONS } from '@/data/specializations';
import { toast } from 'sonner';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import { Eye, EyeOff, FileText, Loader2, Upload } from 'lucide-react';
import { passwordProblem } from '@/lib/password';
import { openStorageDocument } from '@/lib/storageDocument';

interface EditablePsychologist {
  id: string;
  full_name: string;
  email: string;
  cpf?: string | null;
  crp_number: string;
  specialization?: string | null;
  bio?: string | null;
  state?: string | null;
  city?: string | null;
  address?: string | null;
  document_url?: string | null;
  pix_key?: string | null;
  pix_type?: string | null;
}

interface EditPsychologistModalProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
  psychologist: EditablePsychologist;
  onUpdated: (data: any) => void;
}

const PIX_TYPES = [
  { value: 'cpf', label: 'CPF' },
  { value: 'email', label: 'E-mail' },
  { value: 'telefone', label: 'Telefone' },
  { value: 'aleatoria', label: 'Chave aleatória' },
];

export const EditPsychologistModal = ({
  open,
  onOpenChange,
  psychologist,
  onUpdated,
}: EditPsychologistModalProps) => {
  const [saving, setSaving] = useState(false);
  const [uploading, setUploading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);
  const [states, setStates] = useState<{ abbreviation: string; name: string }[]>([]);
  const [cities, setCities] = useState<{ name: string }[]>([]);
  const [password, setPassword] = useState('');
  const [form, setForm] = useState<EditablePsychologist>(psychologist);

  useEffect(() => {
    if (open) {
      setForm(psychologist);
      setPassword('');
      setShowPassword(false);
    }
  }, [open, psychologist]);

  useEffect(() => {
    if (!open) return;
    supabase
      .from('brazilian_states')
      .select('abbreviation, name')
      .order('name')
      .then(({ data }) => setStates(data || []));
  }, [open]);

  useEffect(() => {
    if (!open || !form.state) {
      setCities([]);
      return;
    }
    supabase
      .from('brazilian_cities')
      .select('name')
      .eq('state', form.state)
      .order('name')
      .then(({ data }) => setCities(data || []));
  }, [open, form.state]);

  const set = (key: keyof EditablePsychologist, value: string) =>
    setForm((prev) => ({ ...prev, [key]: value }));

  const handleUpload = async (file: File) => {
    setUploading(true);
    try {
      const ext = file.name.split('.').pop();
      const path = `${psychologist.id}/${Date.now()}.${ext}`;
      const { error } = await supabase.storage
        .from('psychologist-documents')
        .upload(path, file, { upsert: true });
      if (error) throw error;
      const { data } = supabase.storage.from('psychologist-documents').getPublicUrl(path);
      set('document_url', data.publicUrl);
      toast.success('Documento enviado');
    } catch (err: any) {
      toast.error(getFriendlyErrorMessage(err, 'Erro ao enviar documento'));
    } finally {
      setUploading(false);
    }
  };

  const handleSave = async () => {
    if (!form.full_name?.trim()) return toast.error('Nome completo é obrigatório');
    if (!form.email?.trim()) return toast.error('Email é obrigatório');
    if (!form.crp_number?.trim()) return toast.error('CRP é obrigatório');
    if (password && passwordProblem(password)) return toast.error(passwordProblem(password)!);

    setSaving(true);
    try {
      const { data, error } = await supabase.functions.invoke('admin-update-psychologist', {
        body: {
          psychologist_id: psychologist.id,
          full_name: form.full_name,
          email: form.email,
          cpf: form.cpf ?? '',
          crp_number: form.crp_number,
          specialization: form.specialization ?? '',
          bio: form.bio ?? '',
          state: form.state ?? '',
          city: form.city ?? '',
          address: form.address ?? '',
          document_url: form.document_url ?? '',
          pix_key: form.pix_key ?? '',
          pix_type: form.pix_type ?? '',
          ...(password ? { password } : {}),
        },
      });

      if (error) throw new Error((data as any)?.error || error.message);
      if ((data as any)?.error) throw new Error((data as any).error);

      toast.success((data as any)?.message || 'Informações atualizadas');
      onUpdated((data as any)?.data);
      onOpenChange(false);
    } catch (err: any) {
      toast.error(getFriendlyErrorMessage(err, 'Erro ao salvar alterações'));
    } finally {
      setSaving(false);
    }
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogContent className="max-w-2xl max-h-[90vh] overflow-y-auto">
        <DialogHeader>
          <DialogTitle>Editar Psicólogo</DialogTitle>
          <DialogDescription>Atualize as informações cadastrais do profissional</DialogDescription>
        </DialogHeader>

        <div className="space-y-6">
          <section className="space-y-4">
            <h4 className="text-sm font-medium">Informações Básicas</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="full_name">Nome completo</Label>
                <Input id="full_name" value={form.full_name || ''} onChange={(e) => set('full_name', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="cpf">CPF</Label>
                <Input id="cpf" value={form.cpf || ''} onChange={(e) => set('cpf', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="email">Email</Label>
                <Input id="email" type="email" value={form.email || ''} onChange={(e) => set('email', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label htmlFor="password">Nova senha</Label>
                <div className="relative">
                  <Input
                    id="password"
                    type={showPassword ? 'text' : 'password'}
                    placeholder="Deixe em branco para manter"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
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
            </div>
          </section>

          <section className="space-y-4">
            <h4 className="text-sm font-medium">Dados Profissionais</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label htmlFor="crp">CRP</Label>
                <Input id="crp" value={form.crp_number || ''} onChange={(e) => set('crp_number', e.target.value)} />
              </div>
              <div className="space-y-2">
                <Label>Especialização</Label>
                <Select value={form.specialization || ''} onValueChange={(v) => set('specialization', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione a especialização" />
                  </SelectTrigger>
                  <SelectContent>
                    {SPECIALIZATIONS.map((s) => (
                      <SelectItem key={s} value={s}>{s}</SelectItem>
                    ))}
                    {form.specialization && !SPECIALIZATIONS.includes(form.specialization as any) && (
                      <SelectItem value={form.specialization}>{form.specialization}</SelectItem>
                    )}
                  </SelectContent>
                </Select>
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h4 className="text-sm font-medium">Informações PIX</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Tipo da chave PIX</Label>
                <Select value={form.pix_type || ''} onValueChange={(v) => set('pix_type', v)}>
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o tipo" />
                  </SelectTrigger>
                  <SelectContent>
                    {PIX_TYPES.map((t) => (
                      <SelectItem key={t.value} value={t.value}>{t.label}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label htmlFor="pix_key">Chave PIX</Label>
                <Input id="pix_key" value={form.pix_key || ''} onChange={(e) => set('pix_key', e.target.value)} />
              </div>
            </div>
          </section>

          <section className="space-y-4">
            <h4 className="text-sm font-medium">Localização</h4>
            <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
              <div className="space-y-2">
                <Label>Estado</Label>
                <Select
                  value={form.state || ''}
                  onValueChange={(v) => setForm((p) => ({ ...p, state: v, city: '' }))}
                >
                  <SelectTrigger>
                    <SelectValue placeholder="Selecione o estado" />
                  </SelectTrigger>
                  <SelectContent>
                    {states.map((s) => (
                      <SelectItem key={s.abbreviation} value={s.abbreviation}>{s.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-2">
                <Label>Cidade</Label>
                <Select value={form.city || ''} onValueChange={(v) => set('city', v)} disabled={!form.state}>
                  <SelectTrigger>
                    <SelectValue placeholder={form.state ? 'Selecione a cidade' : 'Selecione o estado primeiro'} />
                  </SelectTrigger>
                  <SelectContent>
                    {cities.map((c) => (
                      <SelectItem key={c.name} value={c.name}>{c.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
              </div>
            </div>
            <div className="space-y-2">
              <Label htmlFor="address">Endereço do consultório</Label>
              <Input id="address" value={form.address || ''} onChange={(e) => set('address', e.target.value)} />
            </div>
          </section>

          <section className="space-y-2">
            <Label htmlFor="bio">Biografia profissional</Label>
            <Textarea id="bio" rows={4} value={form.bio || ''} onChange={(e) => set('bio', e.target.value)} />
          </section>

          <section className="space-y-2">
            <Label>Documento profissional</Label>
            <div className="flex flex-col sm:flex-row sm:items-center gap-3 p-3 border rounded-lg bg-muted/20">
              <div className="flex items-center gap-2 flex-1 min-w-0">
                <FileText className="h-4 w-4 text-muted-foreground shrink-0" />
                <span className="text-sm truncate">
                  {form.document_url ? 'Documento anexado' : 'Nenhum documento anexado'}
                </span>
              </div>
              <div className="flex gap-2">
                {form.document_url && (
                  <Button variant="outline" size="sm" onClick={() => void openStorageDocument(form.document_url)}>
                    Visualizar
                  </Button>
                )}
                <Button variant="outline" size="sm" asChild disabled={uploading}>
                  <label className="cursor-pointer">
                    {uploading ? (
                      <Loader2 className="h-4 w-4 mr-1 animate-spin" />
                    ) : (
                      <Upload className="h-4 w-4 mr-1" />
                    )}
                    {uploading ? 'Enviando...' : 'Substituir'}
                    <input
                      type="file"
                      accept=".pdf,.jpg,.jpeg,.png"
                      className="hidden"
                      onChange={(e) => {
                        const file = e.target.files?.[0];
                        if (file) handleUpload(file);
                        e.target.value = '';
                      }}
                    />
                  </label>
                </Button>
              </div>
            </div>
          </section>
        </div>

        <DialogFooter className="gap-2 sm:gap-0">
          <Button variant="outline" onClick={() => onOpenChange(false)} disabled={saving}>
            Cancelar
          </Button>
          <Button onClick={handleSave} disabled={saving || uploading}>
            {saving && <Loader2 className="h-4 w-4 mr-2 animate-spin" />}
            Salvar alterações
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

import { useCallback, useEffect, useState } from 'react';
import { Building2, Copy, Plus, RefreshCw, UserPlus, Users } from 'lucide-react';
import { toast } from 'sonner';
import { Badge } from '@/components/ui/badge';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from '@/components/ui/dialog';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { Skeleton } from '@/components/ui/skeleton';
import { Textarea } from '@/components/ui/textarea';
import { supabase } from '@/integrations/supabase/client';
import type { Tables } from '@/integrations/supabase/types';

type Organization = Tables<'organizations'>;

interface Member {
  member_id: string;
  user_id: string;
  full_name: string | null;
  email: string | null;
  role: string;
  status: string;
  joined_at: string;
  access_until: string | null;
}

const STATUS: Record<string, { label: string; className: string }> = {
  active: { label: 'Ativo', className: 'bg-success/15 text-success' },
  paused: { label: 'Pausado', className: 'bg-warning/15 text-warning' },
  ended: { label: 'Encerrado', className: 'bg-muted text-muted-foreground' },
};

const today = () => new Date().toISOString().slice(0, 10);

const emptyForm = {
  name: '',
  cnpj: '',
  contact_name: '',
  contact_email: '',
  plan_tier: 'Essencial',
  seats: '10',
  status: 'active',
  starts_on: today(),
  ends_on: '',
  allowed_email_domain: '',
  notes: '',
  price_per_seat: '',
  billing_day: '',
};

const brl = (value: number) => value.toLocaleString('pt-BR', { style: 'currency', currency: 'BRL' });
const formatDate = (iso: string) => new Date(`${iso}T12:00:00`).toLocaleDateString('pt-BR');

/**
 * Empresas (B2B) no painel do admin: contrato, vagas, código de convite, RH
 * e colaboradores. A cobrança da empresa é feita fora do app.
 */
export const OrganizationsPanel = () => {
  const [organizations, setOrganizations] = useState<Organization[]>([]);
  const [memberCounts, setMemberCounts] = useState<Record<string, number>>({});
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState<Organization | 'new' | null>(null);
  const [form, setForm] = useState(emptyForm);
  const [saving, setSaving] = useState(false);
  const [membersOf, setMembersOf] = useState<Organization | null>(null);
  const [members, setMembers] = useState<Member[]>([]);
  const [managerEmail, setManagerEmail] = useState('');

  const load = useCallback(async () => {
    const [orgs, memberRows] = await Promise.all([
      supabase.from('organizations').select('*').order('name'),
      supabase.from('organization_members').select('organization_id').eq('status', 'active').eq('role', 'member'),
    ]);
    if (orgs.error) toast.error('Não foi possível carregar as empresas.');
    setOrganizations(orgs.data ?? []);
    const counts: Record<string, number> = {};
    for (const m of memberRows.data ?? []) counts[m.organization_id] = (counts[m.organization_id] ?? 0) + 1;
    setMemberCounts(counts);
    setLoading(false);
  }, []);

  useEffect(() => {
    load();
  }, [load]);

  const openForm = (org: Organization | 'new') => {
    setEditing(org);
    setForm(
      org === 'new'
        ? { ...emptyForm, starts_on: today() }
        : {
            name: org.name,
            cnpj: org.cnpj ?? '',
            contact_name: org.contact_name ?? '',
            contact_email: org.contact_email ?? '',
            plan_tier: org.plan_tier,
            seats: String(org.seats),
            status: org.status,
            starts_on: org.starts_on,
            ends_on: org.ends_on ?? '',
            allowed_email_domain: org.allowed_email_domain ?? '',
            notes: org.notes ?? '',
            price_per_seat: org.price_per_seat != null ? String(org.price_per_seat) : '',
            billing_day: org.billing_day != null ? String(org.billing_day) : '',
          },
    );
  };

  const save = async (event: React.FormEvent) => {
    event.preventDefault();
    const seats = Number(form.seats);
    if (!form.name.trim() || !(seats >= 1)) {
      toast.error('Informe o nome e o número de vagas.');
      return;
    }
    const price = form.price_per_seat.trim() ? Number(form.price_per_seat.replace(',', '.')) : null;
    if (price !== null && !(price >= 0)) {
      toast.error('Valor por vaga inválido.');
      return;
    }
    const billingDay = form.billing_day.trim() ? Number(form.billing_day) : null;
    if (billingDay !== null && !(Number.isInteger(billingDay) && billingDay >= 1 && billingDay <= 28)) {
      toast.error('O dia de cobrança vai de 1 a 28.');
      return;
    }
    const cnpj = form.cnpj.replace(/\D/g, '');
    if (cnpj && cnpj.length !== 14) {
      toast.error('O CNPJ precisa ter 14 dígitos.');
      return;
    }
    const payload = {
      name: form.name.trim(),
      cnpj: cnpj || null,
      contact_name: form.contact_name.trim() || null,
      contact_email: form.contact_email.trim() || null,
      plan_tier: form.plan_tier,
      seats,
      status: form.status,
      starts_on: form.starts_on,
      ends_on: form.ends_on || null,
      allowed_email_domain: form.allowed_email_domain.trim().toLowerCase().replace(/^@/, '') || null,
      notes: form.notes.trim() || null,
      price_per_seat: price,
      billing_day: billingDay,
    };
    setSaving(true);
    const { error } =
      editing === 'new'
        ? await supabase.from('organizations').insert(payload)
        : await supabase.from('organizations').update(payload).eq('id', (editing as Organization).id);
    setSaving(false);
    if (error) {
      toast.error(`Não foi possível salvar: ${error.message}`);
      return;
    }
    toast.success(editing === 'new' ? 'Empresa cadastrada' : 'Empresa atualizada');
    setEditing(null);
    load();
  };

  const openMembers = async (org: Organization) => {
    setMembersOf(org);
    setManagerEmail('');
    const { data, error } = await supabase.rpc('admin_list_organization_members', { p_org: org.id });
    if (error) toast.error('Não foi possível carregar os colaboradores.');
    setMembers((data ?? []) as Member[]);
  };

  const removeMember = async (member: Member) => {
    const { error } = await supabase
      .from('organization_members')
      .update({ status: 'removed', removed_at: new Date().toISOString() })
      .eq('id', member.member_id);
    if (error) toast.error('Não foi possível remover.');
    else {
      toast.success('Removido. O acesso pela empresa acabou.');
      if (membersOf) openMembers(membersOf);
      load();
    }
  };

  const addManager = async () => {
    if (!membersOf || !managerEmail.trim()) return;
    const { data, error } = await supabase.rpc('admin_add_organization_manager', { p_org: membersOf.id, p_email: managerEmail });
    const result = data as unknown as { ok: boolean; error?: string } | null;
    if (error || !result?.ok) {
      toast.error(result?.error === 'user_not_found' ? 'Nenhuma conta com esse e-mail. A pessoa precisa se cadastrar antes.' : 'Não foi possível adicionar.');
      return;
    }
    toast.success('Gestor (RH) adicionado. Ele acessa o portal em Perfil → Benefício da empresa.');
    setManagerEmail('');
    openMembers(membersOf);
  };

  const rotateCode = async (org: Organization) => {
    const { error } = await supabase.rpc('rotate_organization_invite_code', { p_org: org.id });
    if (error) toast.error('Não foi possível gerar outro código.');
    else {
      toast.success('Novo código gerado.');
      load();
    }
  };

  const field = (key: keyof typeof form) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => setForm((prev) => ({ ...prev, [key]: e.target.value })),
  });

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-muted-foreground">A cobrança das empresas é feita fora do app.</p>
        <Button onClick={() => openForm('new')} className="gap-2">
          <Plus className="h-4 w-4" />
          Nova empresa
        </Button>
      </div>

      {loading ? (
        <Skeleton className="h-32 w-full" />
      ) : organizations.length === 0 ? (
        <Card>
          <CardContent className="p-6 text-center text-sm text-muted-foreground">Nenhuma empresa cadastrada.</CardContent>
        </Card>
      ) : (
        <div className="grid gap-3 md:grid-cols-2">
          {organizations.map((org) => {
            const used = memberCounts[org.id] ?? 0;
            const status = STATUS[org.status] ?? STATUS.active;
            return (
              <Card key={org.id}>
                <CardContent className="space-y-3 p-4">
                  <div className="flex items-start justify-between gap-2">
                    <div className="min-w-0">
                      <p className="flex items-center gap-2 truncate font-semibold text-foreground">
                        <Building2 className="h-4 w-4 shrink-0 text-primary" />
                        {org.name}
                      </p>
                      <p className="text-xs text-muted-foreground">
                        Plano {org.plan_tier} · {used} de {org.seats} vagas
                        {org.ends_on ? ` · até ${formatDate(org.ends_on)}` : ''}
                      </p>
                      {org.price_per_seat != null && (
                        <p className="text-xs text-muted-foreground">
                          Fatura: {brl(org.seats * Number(org.price_per_seat))}/mês ({brl(Number(org.price_per_seat))} por vaga)
                          {org.billing_day ? ` · dia ${org.billing_day}` : ''}
                        </p>
                      )}
                    </div>
                    <Badge className={status.className}>{status.label}</Badge>
                  </div>
                  <div className="flex items-center gap-2">
                    <code className="flex-1 rounded bg-muted px-2 py-1 text-center font-mono text-sm tracking-widest">{org.invite_code}</code>
                    <Button
                      variant="ghost"
                      size="icon"
                      aria-label="Copiar código"
                      onClick={() => navigator.clipboard.writeText(org.invite_code).then(() => toast.success('Código copiado'))}
                    >
                      <Copy className="h-4 w-4" />
                    </Button>
                    <Button variant="ghost" size="icon" aria-label="Gerar novo código" onClick={() => rotateCode(org)}>
                      <RefreshCw className="h-4 w-4" />
                    </Button>
                  </div>
                  <div className="flex gap-2">
                    <Button variant="outline" size="sm" className="flex-1" onClick={() => openForm(org)}>
                      Editar
                    </Button>
                    <Button variant="outline" size="sm" className="flex-1 gap-1" onClick={() => openMembers(org)}>
                      <Users className="h-4 w-4" />
                      Pessoas
                    </Button>
                  </div>
                </CardContent>
              </Card>
            );
          })}
        </div>
      )}

      <Dialog open={editing !== null} onOpenChange={(open) => !open && setEditing(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>{editing === 'new' ? 'Nova empresa' : 'Editar empresa'}</DialogTitle>
            <DialogDescription>Mudanças de plano, status ou vigência valem na hora para todos os colaboradores.</DialogDescription>
          </DialogHeader>
          <form onSubmit={save} className="space-y-3">
            <div className="space-y-1.5">
              <Label htmlFor="org-name">Nome</Label>
              <Input id="org-name" {...field('name')} required />
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="org-cnpj">CNPJ</Label>
                <Input id="org-cnpj" inputMode="numeric" {...field('cnpj')} />
              </div>
              <div className="space-y-1.5">
                <Label>Plano</Label>
                <Select value={form.plan_tier} onValueChange={(v) => setForm((p) => ({ ...p, plan_tier: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="Essencial">Essencial (SOS)</SelectItem>
                    <SelectItem value="Flex">Flex (SOS ou consulta)</SelectItem>
                    <SelectItem value="Completo">Completo (SOS e consulta)</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org-seats">Vagas</Label>
                <Input id="org-seats" type="number" min="1" {...field('seats')} />
              </div>
              <div className="space-y-1.5">
                <Label>Status</Label>
                <Select value={form.status} onValueChange={(v) => setForm((p) => ({ ...p, status: v }))}>
                  <SelectTrigger>
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="active">Ativo</SelectItem>
                    <SelectItem value="paused">Pausado</SelectItem>
                    <SelectItem value="ended">Encerrado</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org-start">Início</Label>
                <Input id="org-start" type="date" {...field('starts_on')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org-end">Fim (opcional)</Label>
                <Input id="org-end" type="date" {...field('ends_on')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org-contact">Contato</Label>
                <Input id="org-contact" {...field('contact_name')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org-contact-email">E-mail do contato</Label>
                <Input id="org-contact-email" type="email" {...field('contact_email')} />
              </div>
            </div>
            <div className="grid gap-3 sm:grid-cols-2">
              <div className="space-y-1.5">
                <Label htmlFor="org-price">Valor por vaga (R$/mês)</Label>
                <Input id="org-price" inputMode="decimal" placeholder="Ex.: 19,90" {...field('price_per_seat')} />
              </div>
              <div className="space-y-1.5">
                <Label htmlFor="org-billing-day">Dia da cobrança</Label>
                <Input id="org-billing-day" type="number" min="1" max="28" {...field('billing_day')} />
              </div>
            </div>
            <p className="-mt-2 text-xs text-muted-foreground">A cobrança é feita fora do app (nota fiscal/boleto), sobre as vagas contratadas.</p>
            <div className="space-y-1.5">
              <Label htmlFor="org-domain">Domínio de e-mail permitido (opcional)</Label>
              <Input id="org-domain" placeholder="empresa.com.br" {...field('allowed_email_domain')} />
              <p className="text-xs text-muted-foreground">Se preenchido, só e-mails desse domínio podem usar o código.</p>
            </div>
            <div className="space-y-1.5">
              <Label htmlFor="org-notes">Observações internas</Label>
              <Textarea id="org-notes" rows={2} {...field('notes')} />
            </div>
            <Button type="submit" className="w-full" disabled={saving}>
              {saving ? 'Salvando...' : 'Salvar'}
            </Button>
          </form>
        </DialogContent>
      </Dialog>

      <Dialog open={membersOf !== null} onOpenChange={(open) => !open && setMembersOf(null)}>
        <DialogContent className="max-h-[90vh] max-w-lg overflow-y-auto">
          <DialogHeader>
            <DialogTitle>Pessoas · {membersOf?.name}</DialogTitle>
            <DialogDescription>Só o admin do Soliv vê esta lista. O RH da empresa vê apenas números agregados.</DialogDescription>
          </DialogHeader>
          <div className="space-y-2">
            <Label htmlFor="manager-email">Adicionar gestor (RH) pelo e-mail da conta</Label>
            <div className="flex gap-2">
              <Input id="manager-email" type="email" value={managerEmail} onChange={(e) => setManagerEmail(e.target.value)} />
              <Button onClick={addManager} className="gap-1">
                <UserPlus className="h-4 w-4" />
                Adicionar
              </Button>
            </div>
          </div>
          <ul className="divide-y divide-border">
            {members.length === 0 && <li className="py-3 text-sm text-muted-foreground">Ninguém ainda.</li>}
            {members.map((member) => (
              <li key={member.member_id} className="flex items-center gap-2 py-2 text-sm">
                <div className="min-w-0 flex-1">
                  <p className="truncate font-medium text-foreground">{member.full_name || member.email}</p>
                  <p className="truncate text-xs text-muted-foreground">
                    {member.email} · {member.role === 'manager' ? 'Gestor (RH)' : 'Colaborador'}
                    {member.status === 'removed'
                      ? member.access_until
                        ? ` · desligado, acesso até ${formatDate(member.access_until)}`
                        : ' · removido'
                      : ''}
                  </p>
                </div>
                {member.status === 'active' && (
                  <Button variant="ghost" size="sm" className="text-destructive" onClick={() => removeMember(member)}>
                    Remover
                  </Button>
                )}
              </li>
            ))}
          </ul>
        </DialogContent>
      </Dialog>
    </div>
  );
};

export default OrganizationsPanel;

import { useAuth } from "@/contexts/AuthContext";
import { useEffect, useRef, useState } from 'react';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Textarea } from '@/components/ui/textarea';
import { Button } from '@/components/ui/button';
import { useToast } from '@/hooks/use-toast';
import { getFriendlyErrorMessage } from '@/utils/errorMessage';
import { supabase } from '@/integrations/supabase/client';
import { getSessionUser } from '@/lib/currentUser';
import { KeyRound, LogOut, Lock, Pencil, Check, MessageCircle, Wallet, BellRing, Palette, ScrollText, LockKeyhole } from 'lucide-react';
import { Badge } from '@/components/ui/badge';
import { SettingsRow, SettingsSection } from '@/components/settings/SettingsList';
import { ThemeToggle } from '@/components/ThemeToggle';
import { PushNotificationToggle } from '@/components/PushNotificationToggle';
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select';
import { SPECIALIZATIONS } from '@/data/specializations';
import { PasswordChangeModal } from '@/components/psychologist/PasswordChangeModal';
import { PixModal } from '@/components/psychologist/PixModal';
import { useNavigate } from 'react-router-dom';
import RouteSkeleton from "@/components/skeletons/RouteSkeleton";

const PsychologistProfile = () => {
  const { toast } = useToast();
  const navigate = useNavigate();
  const [loading, setLoading] = useState(true);
  const [userId, setUserId] = useState<string | null>(null);

  // Account
  const [email, setEmail] = useState('');
  const [tempEmail, setTempEmail] = useState('');
  const [pendingEmail, setPendingEmail] = useState(false);
  const pollRef = useRef<number | null>(null);

  // Password modal
  const [pwdOpen, setPwdOpen] = useState(false);
  const [pixOpen, setPixOpen] = useState(false);

  // Professional profile
  const [fullName, setFullName] = useState('');
  const [specialization, setSpecialization] = useState('');
  const [bio, setBio] = useState('');

  // Inline edit states
  const [editName, setEditName] = useState(false);
  const [editSpec, setEditSpec] = useState(false);
  const [editBio, setEditBio] = useState(false);
  const [editEmail, setEditEmail] = useState(false);

  // Temp values for editing
  const [tempName, setTempName] = useState('');
  const [tempSpec, setTempSpec] = useState('');
  const [tempBio, setTempBio] = useState('');

  useEffect(() => {
    document.title = 'Perfil do Psicólogo | Soliv';
  }, []);

  useEffect(() => {
    const load = async () => {
      try {
        // Use getSession() – reads from local storage (no network) vs getUser() which hits the server
        const { data: { session } } = await supabase.auth.getSession();
        const user = session?.user;
        if (!user) {
          setLoading(false);
          return;
        }
        setUserId(user.id);
        setEmail(user.email || '');
        setTempEmail(user.email || '');
        // Reveal UI immediately with auth data; hydrate psychologist row in background
        setLoading(false);

        const { data: psych } = await supabase
          .from('psychologists')
          .select('full_name, specialization, bio')
          .eq('user_id', user.id)
          .maybeSingle();

        if (psych) {
          setFullName(psych.full_name || '');
          setTempName(psych.full_name || '');
          setSpecialization(psych.specialization || '');
          setTempSpec(psych.specialization || '');
          setBio(psych.bio || '');
          setTempBio(psych.bio || '');
        }
      } catch {
        setLoading(false);
      }
    };
    load();

    return () => {
      if (pollRef.current) window.clearInterval(pollRef.current);
    };
  }, []);

  const updatePsych = async (values: Record<string, unknown>) => {
    if (!userId) return;
    const { error } = await supabase.from('psychologists').update(values).eq('user_id', userId);
    if (error) throw error;
  };

  const handleSaveName = async () => {
    try {
      await updatePsych({ full_name: tempName.trim() });
      await supabase.from('profiles').update({ full_name: tempName.trim() }).eq('user_id', userId!);
      setFullName(tempName.trim());
      setEditName(false);
      toast({ title: 'Nome atualizado' });
    } catch (e: unknown) {
      toast({ title: 'Erro ao salvar', description: getFriendlyErrorMessage(e, 'Não foi possível salvar.'), variant: 'destructive' });
    }
  };

  const handleSaveSpec = async () => {
    try {
      await updatePsych({ specialization: tempSpec });
      await supabase.from('profiles').update({ specialty: tempSpec }).eq('user_id', userId!);
      setSpecialization(tempSpec);
      setEditSpec(false);
      toast({ title: 'Especialização atualizada' });
    } catch (e: unknown) {
      toast({ title: 'Erro', description: getFriendlyErrorMessage(e, 'Não foi possível salvar.'), variant: 'destructive' });
    }
  };

  const handleSaveBio = async () => {
    try {
      await updatePsych({ bio: tempBio.trim() });
      setBio(tempBio.trim());
      setEditBio(false);
      toast({ title: 'Biografia atualizada' });
    } catch (e: unknown) {
      toast({ title: 'Erro', description: getFriendlyErrorMessage(e, 'Não foi possível salvar.'), variant: 'destructive' });
    }
  };

  const handleEmailSave = async () => {
    if (!tempEmail || tempEmail === email) { setEditEmail(false); return; }
    try {
      const { error } = await supabase.auth.updateUser({ email: tempEmail });
      if (error) throw error;
      setPendingEmail(true);
      setEditEmail(false);
      toast({ title: 'Confirmação enviada', description: 'Verifique seu email para confirmar a alteração.' });

      if (pollRef.current) window.clearInterval(pollRef.current);
      pollRef.current = window.setInterval(async () => {
        const { data: { user } } = await getSessionUser();
        if (user?.email === tempEmail) {
          try {
            await updatePsych({ email: tempEmail });
          } catch {
            // O e-mail de login já mudou; a cópia no perfil é atualizada na próxima edição.
          }
          setEmail(tempEmail);
          setPendingEmail(false);
          if (pollRef.current) window.clearInterval(pollRef.current);
        }
      }, 8000);
    } catch (e: unknown) {
      toast({ title: 'Erro ao atualizar email', description: getFriendlyErrorMessage(e, 'Não foi possível atualizar o email. Verifique o endereço informado.'), variant: 'destructive' });
    }
  };

  // Sair: sempre pelo signOut central (garante voltar para a tela de login).
  const { signOut } = useAuth();
  const handleLogout = () => signOut();

  if (loading) {
    return <RouteSkeleton />;
  }

  const initials = (fullName || email || 'P')
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map((part) => part[0])
    .join('')
    .toUpperCase();

  // Edição em linha: rótulo, campo e o lápis/salvar ao lado (mesmo padrão nos três campos).
  const editButton = (editing: boolean, onEdit: () => void, onSave: () => void, label: string) =>
    editing ? (
      <Button size="sm" onClick={onSave} className="h-10 shrink-0">
        <Check className="mr-1 h-4 w-4" />
        Salvar
      </Button>
    ) : (
      <Button size="icon" variant="ghost" onClick={onEdit} className="h-10 w-10 shrink-0" aria-label={`Editar ${label}`}>
        <Pencil className="h-4 w-4" />
      </Button>
    );

  return (
    <div className="mx-auto w-full max-w-3xl space-y-6">
      {/* Quem é */}
      <Card className="border-border/60">
        <div className="flex items-center gap-4 p-5">
          <div
            className="flex h-16 w-16 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-xl font-semibold tracking-wide text-primary"
            aria-hidden="true"
          >
            {initials}
          </div>
          <div className="min-w-0 flex-1">
            <h1 className="truncate text-lg font-semibold text-foreground">Dr.(a) {fullName || 'Psicólogo'}</h1>
            <p className="truncate text-sm text-muted-foreground">{email}</p>
            {specialization && (
              <Badge variant="secondary" className="mt-2 font-medium">
                {specialization}
              </Badge>
            )}
          </div>
        </div>
      </Card>

      {/* Perfil profissional: o que o paciente vê ao escolher com quem agendar. */}
      <section className="space-y-2" aria-label="Perfil profissional">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Perfil profissional</h2>
        <Card className="border-border/60">
          <CardContent className="space-y-4 p-4">
            <p className="text-xs text-muted-foreground">É o que o paciente vê ao escolher com quem agendar.</p>
            <div className="space-y-1.5">
              <label htmlFor="psy-name" className="text-sm font-medium text-foreground">Nome completo</label>
              <div className="flex items-center gap-2">
                <Input id="psy-name" value={tempName} onChange={(e) => setTempName(e.target.value)} disabled={!editName} />
                {editButton(editName, () => setEditName(true), handleSaveName, 'nome')}
              </div>
            </div>

            <div className="space-y-1.5">
              <label className="text-sm font-medium text-foreground">Especialização</label>
              <div className="flex items-center gap-2">
                {editSpec ? (
                  <Select value={tempSpec} onValueChange={setTempSpec}>
                    <SelectTrigger className="min-w-0 flex-1"><SelectValue placeholder="Selecione sua especialização" /></SelectTrigger>
                    <SelectContent>
                      {SPECIALIZATIONS.map((spec) => (
                        <SelectItem key={spec} value={spec}>{spec}</SelectItem>
                      ))}
                    </SelectContent>
                  </Select>
                ) : (
                  <Input value={specialization || ''} disabled aria-label="Especialização" />
                )}
                {editButton(editSpec, () => setEditSpec(true), handleSaveSpec, 'especialização')}
              </div>
            </div>

            <div className="space-y-1.5">
              <label htmlFor="psy-bio" className="text-sm font-medium text-foreground">Biografia</label>
              <div className="flex items-start gap-2">
                <Textarea id="psy-bio" className="min-h-[120px]" value={tempBio} onChange={(e) => setTempBio(e.target.value)} disabled={!editBio} />
                {editButton(editBio, () => setEditBio(true), handleSaveBio, 'biografia')}
              </div>
            </div>
          </CardContent>
        </Card>
      </section>

      <section className="space-y-2" aria-label="Conta">
        <h2 className="px-1 text-xs font-semibold uppercase tracking-wide text-muted-foreground">Conta</h2>
        <Card className="overflow-hidden border-border/60 divide-y divide-border/60">
          <div className="space-y-1.5 p-4">
            <label htmlFor="psy-email" className="text-sm font-medium text-foreground">E-mail</label>
            <div className="flex items-center gap-2">
              <Input id="psy-email" type="email" value={tempEmail} onChange={(e) => setTempEmail(e.target.value)} disabled={!editEmail} />
              {editButton(editEmail, () => setEditEmail(true), handleEmailSave, 'e-mail')}
            </div>
            {pendingEmail && (
              <p className="text-xs text-muted-foreground">Confirmação pendente. Verifique sua caixa de entrada.</p>
            )}
          </div>
          <SettingsRow icon={<Lock />} title="Senha" description="Trocar a senha de acesso" onClick={() => setPwdOpen(true)} />
        </Card>
      </section>

      <SettingsSection title="Trabalho">
        <SettingsRow
          icon={<KeyRound />}
          title="Chave Pix"
          description="Onde você recebe os repasses"
          onClick={() => setPixOpen(true)}
        />
        <SettingsRow
          icon={<Wallet />}
          title="Pagamentos"
          description="Repasses recebidos e valores a receber"
          onClick={() => navigate('/psychologist-payments')}
        />
      </SettingsSection>

      <SettingsSection title="Preferências">
        <SettingsRow icon={<Palette />} title="Tema" description="Claro, escuro ou do sistema" trailing={<ThemeToggle />} />
        <PushNotificationToggle icon={<BellRing />} />
      </SettingsSection>

      <SettingsSection title="Ajuda e privacidade">
        <SettingsRow icon={<MessageCircle />} title="Suporte" description="Fale com a equipe Soliv" onClick={() => navigate('/psicologo/suporte')} />
        <SettingsRow
          icon={<ScrollText />}
          title="Termos de Uso"
          description="Regras para psicólogos, repasses e registros"
          onClick={() => navigate('/termos-psicologo')}
        />
        <SettingsRow icon={<LockKeyhole />} title="Política de Privacidade" description="Como tratamos os dados" onClick={() => navigate('/privacidade')} />
      </SettingsSection>

      <Card className="overflow-hidden border-border/60">
        <SettingsRow icon={<LogOut />} title="Sair da conta" description="Encerrar a sessão neste aparelho" onClick={handleLogout} tone="destructive" />
      </Card>

      <PasswordChangeModal open={pwdOpen} onOpenChange={setPwdOpen} currentEmail={email} />
      {userId && <PixModal isOpen={pixOpen} onClose={() => setPixOpen(false)} userId={userId} mode="edit" />}
    </div>
  );
};

export default PsychologistProfile;

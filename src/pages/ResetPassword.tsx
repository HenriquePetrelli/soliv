import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { Eye, EyeOff, KeyRound, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { Button } from '@/components/ui/button';
import { Card, CardContent } from '@/components/ui/card';
import { Input } from '@/components/ui/input';
import { Label } from '@/components/ui/label';
import Logo from '@/components/Logo';
import PasswordResetModal from '@/components/PasswordResetModal';
import { supabase } from '@/integrations/supabase/client';
import { passwordProblem, PASSWORD_HINT } from '@/lib/password';
import { getAuthErrorMessage } from '@/utils/errorMessage';


/**
 * Destino do link "Recuperar senha" enviado por e-mail. O cliente do Supabase
 * lê o token do link e abre uma sessão temporária de recuperação; aqui a
 * pessoa define a nova senha. Link vencido ou já usado cai no aviso com a
 * opção de pedir outro.
 */
const ResetPassword = () => {
  const navigate = useNavigate();
  const [state, setState] = useState<'checking' | 'ready' | 'invalid' | 'done'>('checking');
  const [password, setPassword] = useState('');
  const [confirm, setConfirm] = useState('');
  const [show, setShow] = useState(false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [resendOpen, setResendOpen] = useState(false);

  useEffect(() => {
    // O Supabase devolve erros do link no fragmento (#error=...&error_code=otp_expired).
    const hash = new URLSearchParams(window.location.hash.replace(/^#/, ''));
    if (hash.get('error') || new URLSearchParams(window.location.search).get('error')) {
      setState('invalid');
      return;
    }

    let settled = false;
    const markReady = () => {
      settled = true;
      setState('ready');
    };

    const { data: listener } = supabase.auth.onAuthStateChange((event, session) => {
      if (event === 'PASSWORD_RECOVERY' || (session && event === 'SIGNED_IN')) markReady();
    });
    supabase.auth.getSession().then(({ data }) => {
      if (data.session) markReady();
    });
    // Sem sessão depois de alguns segundos: o link não serviu.
    const timeout = window.setTimeout(() => {
      if (!settled) setState('invalid');
    }, 4000);

    return () => {
      listener.subscription.unsubscribe();
      window.clearTimeout(timeout);
    };
  }, []);

  const handleSubmit = async (event: React.FormEvent) => {
    event.preventDefault();
    setError(null);
    const weakPassword = passwordProblem(password);
    if (weakPassword) {
      setError(weakPassword);
      return;
    }
    if (password !== confirm) {
      setError('As senhas não coincidem.');
      return;
    }
    setSaving(true);
    try {
      const { error: updateError } = await supabase.auth.updateUser({ password });
      if (updateError) {
        setError(getAuthErrorMessage(updateError, 'Não foi possível trocar a senha. Peça um novo link e tente de novo.'));
        return;
      }
      setState('done');
      toast.success('Senha alterada. Entre com a nova senha.');
      // Sessão de recuperação encerrada: entra de novo, do jeito normal.
      await supabase.auth.signOut();
      navigate('/', { replace: true });
    } finally {
      setSaving(false);
    }
  };

  return (
    <div className="min-h-screen bg-background flex flex-col items-center justify-center p-4">
      <div className="w-full max-w-sm space-y-6">
        <Logo className="mx-auto flex justify-center w-full" />
        <Card className="border-0 shadow-calm">
          <CardContent className="p-6 space-y-5">
            <div className="space-y-1 text-center">
              <KeyRound className="mx-auto h-8 w-8 text-primary" aria-hidden="true" />
              <h1 className="text-2xl font-semibold text-foreground">Nova senha</h1>
            </div>

            {state === 'checking' && (
              <p className="flex items-center justify-center gap-2 text-sm text-muted-foreground">
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                Verificando o link…
              </p>
            )}

            {state === 'invalid' && (
              <div className="space-y-4 text-center">
                <p className="text-sm text-muted-foreground">
                  Este link de recuperação venceu ou já foi usado. Peça um novo; ele chega no seu e-mail em instantes.
                </p>
                <Button className="w-full min-h-11" onClick={() => setResendOpen(true)}>
                  Pedir um novo link
                </Button>
                <Button variant="ghost" className="w-full" onClick={() => navigate('/', { replace: true })}>
                  Voltar para o login
                </Button>
              </div>
            )}

            {(state === 'ready' || state === 'done') && (
              <form onSubmit={handleSubmit} className="space-y-4">
                <div className="space-y-1.5">
                  <Label htmlFor="new-password">Nova senha</Label>
                  <div className="relative">
                    <Input
                      id="new-password"
                      type={show ? 'text' : 'password'}
                      autoComplete="new-password"
                      value={password}
                      onChange={(e) => setPassword(e.target.value)}
                      className="h-12 pr-12"
                    />
                    <button
                      type="button"
                      onClick={() => setShow((v) => !v)}
                      aria-label={show ? 'Esconder senha' : 'Mostrar senha'}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-muted-foreground hover:text-foreground"
                    >
                      {show ? <EyeOff size={20} /> : <Eye size={20} />}
                    </button>
                  </div>
                  <p className="text-xs text-muted-foreground">{PASSWORD_HINT}.</p>
                </div>
                <div className="space-y-1.5">
                  <Label htmlFor="confirm-password">Repita a nova senha</Label>
                  <Input
                    id="confirm-password"
                    type={show ? 'text' : 'password'}
                    autoComplete="new-password"
                    value={confirm}
                    onChange={(e) => setConfirm(e.target.value)}
                    className="h-12"
                  />
                </div>
                {error && (
                  <p role="alert" className="text-sm text-destructive">
                    {error}
                  </p>
                )}
                <Button type="submit" className="w-full min-h-12" disabled={saving || state === 'done'}>
                  {saving ? 'Salvando...' : 'Salvar nova senha'}
                </Button>
              </form>
            )}
          </CardContent>
        </Card>
      </div>
      <PasswordResetModal open={resendOpen} onOpenChange={setResendOpen} />
    </div>
  );
};

export default ResetPassword;

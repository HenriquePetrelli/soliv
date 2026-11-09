import { useState } from "react";
import { useNavigate } from "react-router-dom";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Card, CardContent } from "@/components/ui/card";
import { Eye, EyeOff } from "lucide-react";
import { toast } from "sonner";
import { supabase } from "@/integrations/supabase/client";
import { isCurrentlyBlocked, notifyBlockedAccess } from "@/utils/psychologistBlock";
import { fetchLoginState } from '@/lib/loginState';
import type { BlockInfo } from "@/utils/psychologistBlock";

/** Motivo e prazo do bloqueio de quem não consegue entrar (confere a senha no servidor). */
const fetchBlockForLogin = async (email: string, password: string): Promise<BlockInfo | null> => {
  try {
    const { data, error } = await supabase.functions.invoke('account-block-status', { body: { email, password } });
    if (error) return null;
    const block = (data as { block?: BlockInfo | null } | null)?.block;
    return block?.is_blocked ? block : null;
  } catch {
    return null;
  }
};


interface LoginFormProps {
  onForgotPassword: () => void;
  onSignUp: () => void;
}

const LoginForm = ({ onForgotPassword, onSignUp }: LoginFormProps) => {
  const navigate = useNavigate();
  const [email, setEmail] = useState("");
  const [password, setPassword] = useState("");
  const [isLoading, setIsLoading] = useState(false);
  const [showPassword, setShowPassword] = useState(false);

  const handleSubmit = async (e: React.FormEvent) => {
    e.preventDefault();
    setIsLoading(true);

    try {
      // Validação básica
      if (!email || !password) {
        toast.error("Preencha todos os campos");
        return;
      }

      if (password.length < 6) {
        toast.error("A senha deve ter pelo menos 6 caracteres");
        return;
      }

      // Autenticação com Supabase (e-mail sem espaços e em minúsculas: colado
      // ou com o teclado do celular pondo maiúscula, o login falhava).
      const normalizedEmail = email.trim().toLowerCase();
      const { data, error } = await supabase.auth.signInWithPassword({
        email: normalizedEmail,
        password,
      });

      if (error) {
        if (/banned/i.test(error.message) || (error as { code?: string }).code === 'user_banned') {
          // Conta bloqueada pelo admin (o bloqueio também vale no login do
          // Supabase): busca o motivo e até quando, para mostrar no aviso.
          const block = await fetchBlockForLogin(normalizedEmail, password);
          if (block) {
            await notifyBlockedAccess(block);
          } else {
            toast.error("Sua conta está bloqueada no momento. Se achar que é um engano, fale com o suporte.");
          }
        } else if (error.message.includes("Invalid login credentials")) {
          toast.error("Email ou senha incorretos");
        } else if (error.message.includes("Email not confirmed")) {
          toast.error("Confirme seu email antes de fazer login");
        } else {
          toast.error("Erro ao fazer login. Tente novamente.");
        }
        console.error("Login error:", error);
        return;
      }

      if (!data.user) {
        toast.error("Erro ao fazer login. Tente novamente.");
        return;
      }

      // Tudo o que o login precisa saber numa consulta só (antes eram de 3 a 5
      // em sequência). O controle de acesso do app reaproveita o resultado.
      const state = await fetchLoginState(data.user.id);

      // Admin não tem linha em `profiles` (fica em admin_users): resolve antes.
      // Só pelo banco: user_metadata é editável pelo próprio usuário.
      if (state.is_admin) {
        // Depois da senha, o código da verificação em duas etapas (só em
        // produção: no app em teste, o banco já libera o admin com a senha).
        navigate(state.admin_verified ? '/admin-dashboard' : '/admin/verificacao');
        setEmail("");
        setPassword("");
        return;
      }

      const profile = state.profile;
      if (!profile?.user_type) {
        toast.error("Erro ao carregar perfil do usuário. Fale com o suporte.");
        // Sem perfil não há para onde ir: não deixa a sessão aberta pela metade.
        await supabase.auth.signOut();
        return;
      }

      // Pacientes: verificar bloqueio administrativo
      if (profile.user_type === 'patient' && state.patient && isCurrentlyBlocked(state.patient)) {
        await notifyBlockedAccess(state.patient);
        await supabase.auth.signOut();
        return;
      }

      // Para psicólogos, verificar bloqueio e se o cadastro foi aprovado ou rejeitado
      if (profile.user_type === 'psychologist') {
        if (state.psychologist && isCurrentlyBlocked(state.psychologist)) {
          await notifyBlockedAccess(state.psychologist);
          await supabase.auth.signOut();
          return;
        }

        const approved =
          state.registration?.status === 'approved' ||
          (state.psychologist?.approved === true && state.psychologist.approval_status === 'approved');
        if (!approved) {
          const registrationData = state.registration;

          if (!registrationData) {
            // Confirmou o e-mail e entrou pela primeira vez: falta enviar o
            // documento do CRP para o cadastro ir para análise.
            navigate('/psicologo/concluir-cadastro');
            setPassword("");
            return;
          }

          if (registrationData.status === 'rejected') {
            // Check if rejection is within 3 days
            if (registrationData.rejected_at) {
              const rejectedDate = new Date(registrationData.rejected_at);
              const daysSinceRejection = Math.floor((Date.now() - rejectedDate.getTime()) / (1000 * 60 * 60 * 24));

              if (daysSinceRejection <= 3) {
                toast.error("Seu cadastro foi recusado. O motivo foi enviado para o seu e-mail.", {
                  duration: 5000,
                });
                await supabase.auth.signOut();
                return;
              }
            }

            // After 3 days - show generic message (data should be cleaned up)
            toast.error("Login ou senha incorretos.");
            await supabase.auth.signOut();
            return;
          }

          if (registrationData.status !== 'approved') {
            toast.error("Seu cadastro ainda está sendo analisado. Aguarde a aprovação.");
            await supabase.auth.signOut();
            return;
          }
        }
      }

      // Redirecionar para a página apropriada baseado no userType
      if (profile.user_type === 'psychologist') {
        navigate('/psychologist-dashboard');
      } else if (profile.user_type === 'patient') {
        navigate('/home');
      } else {
        navigate('/home');
      }
      
      // Limpar formulário
      setEmail("");
      setPassword("");
      
    } catch (error) {
      toast.error("Erro ao fazer login. Tente novamente.");
      console.error("Login error:", error);
    } finally {
      setIsLoading(false);
    }
  };

  return (
    <Card className="w-full max-w-sm mx-auto shadow-calm border-0 animate-slide-up">
      <CardContent className="p-8">
        <form onSubmit={handleSubmit} className="space-y-6">
          <div className="text-center mb-8">
            <h2 className="text-2xl font-semibold text-primary mb-2">
              Login
            </h2>
            <p className="text-muted-foreground text-sm">
              Entre para continuar sua jornada de bem-estar
            </p>
          </div>

          <div className="space-y-4">
            <div className="space-y-2">
              <Label htmlFor="email" className="text-foreground font-medium">
                Email
              </Label>
              <Input
                id="email"
                type="email"
                value={email}
                onChange={(e) => setEmail(e.target.value)}
                placeholder="seu@email.com"
                required
                className="h-12 rounded-xl border-border focus:ring-primary"
              />
            </div>

            <div className="space-y-2">
              <Label htmlFor="password" className="text-foreground font-medium">
                Senha
              </Label>
              <div className="relative">
                <Input
                  id="password"
                  type={showPassword ? "text" : "password"}
                  value={password}
                  onChange={(e) => setPassword(e.target.value)}
                  placeholder="Digite sua senha"
                  required
                  className="h-12 rounded-xl border-border focus:ring-primary pr-12"
                />
                <button
                  type="button"
                  onClick={() => setShowPassword(!showPassword)}
                  className="absolute right-3 top-1/2 transform -translate-y-1/2 text-muted-foreground hover:text-foreground transition-colors"
                >
                  {showPassword ? <EyeOff size={20} /> : <Eye size={20} />}
                </button>
              </div>
            </div>
          </div>

          <Button
            type="submit"
            disabled={isLoading}
            className="w-full h-12 rounded-xl bg-primary hover:bg-primary/90 text-primary-foreground font-medium shadow-calm-sm transition-all duration-300 hover:shadow-calm disabled:opacity-50 disabled:cursor-not-allowed"
          >
            {isLoading ? "Entrando..." : "Entrar"}
          </Button>

          <div className="text-center space-y-3">
            <button
              type="button"
              onClick={onForgotPassword}
              className="text-sm text-primary hover:text-primary/80 transition-colors font-medium"
            >
              Esqueceu a senha?
            </button>
            
            <div className="pt-2">
              <button
                type="button"
                onClick={onSignUp}
                className="text-sm text-muted-foreground hover:text-foreground transition-colors"
              >
                Não tem uma conta? Cadastre-se
              </button>
            </div>
          </div>
        </form>
      </CardContent>
    </Card>
  );
};

export default LoginForm;
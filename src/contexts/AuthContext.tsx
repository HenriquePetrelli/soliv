import React, { createContext, useContext, useEffect, useRef, useState } from 'react';
import SplashScreen from '@/components/SplashScreen';
import { nextPaint, withTimeout } from '@/lib/async';
import { clearLoginState, fetchLoginState, userTypeFromLoginState } from '@/lib/loginState';
import { preloadCoreRoutesFor } from '@/lib/routePreload';
import { User, Session } from '@supabase/supabase-js';
import { supabase } from '@/integrations/supabase/client';
import { deactivateStoredPushToken } from '@/lib/pushToken';
import { goOfflineOnSignOut } from '@/hooks/usePsychologistPresence';
import { toast } from 'sonner';

type UserType = 'admin' | 'psychologist' | 'patient' | 'unknown';

interface AuthContextType {
  user: User | null;
  session: Session | null;
  userType: UserType;
  loading: boolean;
  signOut: () => Promise<void>;
  refreshUserType: () => Promise<void>;
}

const AuthContext = createContext<AuthContextType | undefined>(undefined);

// Helper to clean auth state completely
const cleanupAuthState = () => {
  localStorage.removeItem('supabase.auth.token');
  Object.keys(localStorage).forEach((key) => {
    if (key.startsWith('supabase.auth.') || key.includes('sb-')) {
      localStorage.removeItem(key);
    }
  });
  // Plano de segurança, rascunhos (questionário, diário, chat) e mensagens do
  // chat ainda não enviadas, guardados no aparelho (dado de saúde): não ficam
  // para quem usar o aparelho depois.
  Object.keys(localStorage).forEach((key) => {
    if (
      key.startsWith('plano:') ||
      key.startsWith('questionarios:rascunho:') ||
      key.startsWith('diario:rascunho:') ||
      key.startsWith('chat:pendentes:') ||
      key.startsWith('chat:rascunho:')
    ) {
      localStorage.removeItem(key);
    }
  });
  Object.keys(sessionStorage || {}).forEach((key) => {
    // soliv:subscription: plano guardado para abrir mais rápido (SubscriptionContext).
    if (key.startsWith('supabase.auth.') || key.includes('sb-') || key.startsWith('soliv:subscription:')) {
      sessionStorage.removeItem(key);
    }
  });
};

// Tempo máximo de cada etapa da saída que depende do servidor.
const SIGN_OUT_STEP_MS = 2500;

export const AuthProvider: React.FC<{ children: React.ReactNode }> = ({ children }) => {
  const [user, setUser] = useState<User | null>(null);
  const [session, setSession] = useState<Session | null>(null);
  const [userType, setUserType] = useState<UserType>('unknown');
  const [loading, setLoading] = useState(true);
  const signingOutRef = useRef(false);
  const authEventSeq = useRef(0);
  // Quem está logado e com que tipo, para os avisos repetidos do login.
  const userIdRef = useRef<string | null>(null);
  const userTypeRef = useRef<UserType>('unknown');
  userTypeRef.current = userType;

  const getUserType = async (authUser: User): Promise<UserType> => {
    const userId = authUser.id;
    const meta = authUser.user_metadata ?? {};

    try {
      // user_metadata é editável pelo próprio usuário (supabase.auth.updateUser):
      // só serve de atalho para "paciente", nunca para dar mais acesso. Admin e
      // psicólogo aprovado vêm sempre do banco.
      // Fast path: user type já presente no JWT
      if (meta.user_type === 'patient' && meta.is_super_admin !== true) {
        console.log('[AuthContext] getUserType -> patient (meta)', { userId, email: authUser.email });
        return 'patient';
      }

      // Uma consulta só (get_login_state), compartilhada com a tela de login.
      const state = await fetchLoginState(userId);
      if (state.rejection?.is_rejected && state.rejection.should_show_rejection_message) {
        toast.error("Seu cadastro foi recusado. O motivo foi enviado para o seu e-mail.");
      }
      const type = userTypeFromLoginState(state);
      console.log('[AuthContext] getUserType ->', type, { userId });
      return type;
    } catch (error) {
      console.error('Error determining user type:', error);
      return 'unknown';
    }
  };

  const refreshUserType = async () => {
    if (user) {
      const type = await getUserType(user);
      setUserType(type);
    }
  };

  const handleAuthStateChange = (event: string, session: Session | null) => {
    console.log('[AuthContext] event:', event);
    // Entrou, saiu ou mudou a conta: o estado do login guardado pode estar
    // velho (ex.: psicólogo que acabou de se cadastrar e entra em seguida).
    const sameUser = Boolean(session?.user && session.user.id === userIdRef.current);
    // O Supabase repete "entrou" (SIGNED_IN) a cada volta da aba, da janela
    // minimizada ou redimensionada, e "renovou" (TOKEN_REFRESHED) de tempos em
    // tempos. Com a mesma pessoa e o tipo já conhecido, só atualiza o token:
    // antes o app consultava o tipo de novo e, se a consulta falhasse por um
    // instante, trocava a tela pela de carregamento (a chamada caía).
    if (sameUser && userTypeRef.current !== 'unknown' && event !== 'USER_UPDATED') {
      setSession(session);
      setLoading(false);
      return;
    }

    if (event === 'SIGNED_IN' || event === 'SIGNED_OUT' || event === 'USER_UPDATED') clearLoginState();
    setSession(session);
    setUser(session?.user ?? null);
    userIdRef.current = session?.user?.id ?? null;
    const seq = ++authEventSeq.current;

    if (!session?.user) {
      setUserType('unknown');
      setLoading(false);
      return;
    }

    const authUser = session.user;
    const meta = authUser.user_metadata ?? {};

    // Paciente via metadata
    if (meta.user_type === 'patient' && meta.is_super_admin !== true) {
      console.log('[AuthContext] -> patient (fast path)');
      setUserType('patient');
      setLoading(false);
      return;
    }

    // Não consultar o Supabase dentro deste aviso: o auth-js espera o aviso
    // terminar para liberar a sessão, e as consultas esperam a sessão. Com o
    // app aberto já logado, psicólogo e admin ficavam presos na abertura.
    setTimeout(async () => {
      let type: UserType = 'unknown';
      try {
        type = await getUserType(authUser);
        console.log('[AuthContext] -> resolved via DB:', type);
      } catch (error) {
        console.error('Error getting user type:', error);
      }
      // Um aviso mais novo (outro login, saída) vale mais que este.
      if (seq !== authEventSeq.current) return;
      // Falha momentânea na consulta não tira o acesso de quem já entrou.
      if (type === 'unknown' && sameUser && userTypeRef.current !== 'unknown') type = userTypeRef.current;
      setUserType(type);
      setLoading(false);
    }, 0);
  };

  const [signingOut, setSigningOut] = useState(false);
  const signOut = async () => {
    if (signingOutRef.current) return;
    signingOutRef.current = true;
    // A tela de saída aparece já no toque; antes ela só vinha depois de todas
    // as chamadas ao servidor (alguns segundos sem resposta visível).
    setSigningOut(true);
    await nextPaint();

    clearLoginState();
    // Enquanto a sessão existe: este aparelho para de receber os pushes da
    // conta e o psicólogo sai do SOS. Essas chamadas pegam o token da sessão
    // na hora em que começam; um instante depois a saída no servidor começa
    // junto com elas (antes uma esperava a outra terminar).
    const cleanup = Promise.allSettled([
      deactivateStoredPushToken(),
      userType === 'psychologist' && user?.id ? goOfflineOnSignOut(user.id) : Promise.resolve(),
    ]);
    await new Promise((resolve) => setTimeout(resolve, 50));
    // "global" encerra a sessão em todos os aparelhos; "local" sempre apaga a
    // sessão deste (se o servidor falhar ou demorar, a pessoa sai mesmo assim).
    const [, global] = await Promise.all([
      withTimeout(cleanup, SIGN_OUT_STEP_MS),
      withTimeout(supabase.auth.signOut({ scope: 'global' }), SIGN_OUT_STEP_MS),
    ]);
    if (!global || global.error) {
      // Servidor falhou ou demorou: apaga a sessão deste aparelho. Com o
      // servidor fora do ar a saída local também pode não voltar; a limpeza
      // abaixo apaga a sessão de qualquer jeito.
      await withTimeout(supabase.auth.signOut({ scope: 'local' }), 1000);
    }
    cleanupAuthState();
    // Always reset to light mode on logout; dark mode is per-logged-in-user
    try {
      localStorage.setItem('theme', 'light');
      document.documentElement.classList.remove('dark');
      document.documentElement.classList.add('light');
    } catch {
      // segue saindo mesmo assim
    }
    // Recarrega para começar do zero na tela de login
    window.location.href = '/';
  };

  useEffect(() => {
    // 1. Listener para mudanças futuras (login/logout/refresh)
    const { data: { subscription } } = supabase.auth.onAuthStateChange(handleAuthStateChange);

    // 2. Restaura sessão existente do storage IMEDIATAMENTE
    //    (necessário porque INITIAL_SESSION nem sempre dispara antes do primeiro render)
    supabase.auth.getSession().then(({ data: { session } }) => {
      handleAuthStateChange('INITIAL_SESSION', session);
    });

    return () => subscription.unsubscribe();
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, []);

  // Sabendo quem entrou, baixa em segundo plano as abas desse tipo de conta.
  useEffect(() => {
    if (user && userType !== 'unknown') preloadCoreRoutesFor(userType);
  }, [user, userType]);

  const value: AuthContextType = {
    user,
    session,
    userType,
    loading,
    signOut,
    refreshUserType,
  };

  return (
    <AuthContext.Provider value={value}>
      {children}
      {signingOut && <SplashScreen message="Saindo da conta..." />}
    </AuthContext.Provider>
  );
};

export const useAuth = () => {
  const context = useContext(AuthContext);
  if (context === undefined) {
    throw new Error('useAuth must be used within an AuthProvider');
  }
  return context;
};
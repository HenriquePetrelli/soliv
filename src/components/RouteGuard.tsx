import { goOfflineOnSignOut } from '@/hooks/usePsychologistPresence';
import { useEffect, useRef, ReactNode } from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import { useAuth } from '@/contexts/AuthContext';
import SplashScreen from '@/components/SplashScreen';
import { supabase } from '@/integrations/supabase/client';
import { isCurrentlyBlocked, notifyBlockedAccess } from '@/utils/psychologistBlock';
import { ROUTE_PERMISSIONS } from '@/lib/routePermissions';


interface RouteGuardProps {
  children: ReactNode;
  allowedUserTypes: ('patient' | 'psychologist' | 'admin' | 'public')[];
  redirectTo?: string;
}


// URLs de redirecionamento por tipo de usuário
const REDIRECT_URLS = {
  patient: '/',
  psychologist: '/',
  admin: '/',
  public: '/'
};

// Função para verificar se a rota é permitida para o tipo de usuário
const isRouteAllowed = (pathname: string, userType: string): boolean => {
  const routes = ROUTE_PERMISSIONS[userType as keyof typeof ROUTE_PERMISSIONS] || [];
  
  // Verificação exata da rota
  if (routes.includes(pathname)) {
    return true;
  }
  
  // Verificação para rotas com parâmetros dinâmicos
  return routes.some(route => {
    // Para rotas que terminam com '/', verificar se o pathname começa com elas
    if (route.endsWith('/')) {
      return pathname.startsWith(route);
    }
    
    // Para rotas específicas como /sounds/category, /sounds/player, etc.
    if (route.includes('/category') && pathname.includes('/category/')) return true;
    if (route.includes('/subcategory') && pathname.includes('/subcategory/')) return true;
    if (route.includes('/player') && pathname.includes('/player/')) return true;
    if (route.includes('/emergency-call') && pathname.startsWith('/emergency-call/')) return true;
    if (route.includes('/emergency/call') && pathname.startsWith('/emergency/call/')) return true;
    if (route.includes('/support-group/') && pathname.startsWith('/support-group/')) return true;
    
    return false;
  });
};

// Limpa qualquer rota persistida legada (lógica antiga causava redirects indevidos)
const clearLegacyLastRoute = () => {
  try {
    localStorage.removeItem('lastRoute');
    localStorage.removeItem('lastUserType');
  } catch {
    // Armazenamento bloqueado (janela anônima): não há o que limpar.
  }
};
clearLegacyLastRoute();

const RouteGuard: React.FC<RouteGuardProps> = ({ 
  children, 
  allowedUserTypes, 
  redirectTo 
}) => {
  const { user, userType, loading } = useAuth();
  const navigate = useNavigate();
  const location = useLocation();
  const isPublicRoute = allowedUserTypes.includes('public');

  // Bloqueio administrativo: encerra sessão de psicólogos bloqueados
  useEffect(() => {
    // Em rotas públicas, o LoginForm já trata o bloqueio.
    // Evita dois alertas concorrentes durante o login.
    if (isPublicRoute) return;
    if (!user || userType !== 'psychologist') return;
    let cancelled = false;
    (async () => {
      const { data } = await supabase
        .from('psychologists')
        .select('is_blocked, blocked_until, blocked_reason')
        .eq('user_id', user.id)
        .maybeSingle();
      if (cancelled || !data || !isCurrentlyBlocked(data)) return;
      await notifyBlockedAccess(data);
      await goOfflineOnSignOut(user.id);
      await supabase.auth.signOut();

      navigate('/', { replace: true });
    })();
    return () => { cancelled = true; };
  // eslint-disable-next-line react-hooks/exhaustive-deps -- roda só quando os valores listados mudam (as funções são recriadas a cada render)
  }, [user?.id, userType, navigate, isPublicRoute]);


  // Computa permissão de acesso de forma síncrona para evitar
  // renderizar a página protegida (que poderia disparar seus próprios redirects)
  const currentPath = location.pathname;

  let accessState: 'loading' | 'allowed' | 'denied' = 'loading';
  let redirectTarget: string | null = null;

  if (!loading) {
    if (!user) {
      if (isPublicRoute) {
        accessState = 'allowed';
      } else {
        accessState = 'denied';
        redirectTarget = redirectTo || '/';
      }
    } else if (userType === 'unknown') {
      // Telas públicas continuam abertas para quem está logado sem um tipo
      // liberado (ex.: psicólogo no meio do cadastro ou em análise). Antes a
      // tela de cadastro virava a de carregamento para sempre logo depois de
      // criar a conta. Nas outras telas, aguarda a resolução do tipo.
      accessState = isPublicRoute ? 'allowed' : 'loading';
    } else if (!allowedUserTypes.includes(userType)) {
      accessState = 'denied';
      redirectTarget = redirectTo || getDefaultRouteForUserType(userType);
    } else if (!isRouteAllowed(currentPath, userType)) {
      accessState = 'denied';
      redirectTarget = getDefaultRouteForUserType(userType);
    } else {
      accessState = 'allowed';
    }
  }

  // Tela já liberada para esta pessoa não volta para o carregamento por uma
  // reconferência momentânea do login (ex.: ao voltar para a janela): isso
  // desmontava a tela e derrubava uma chamada em andamento.
  const allowedRef = useRef<{ path: string; userId: string } | null>(null);
  if (accessState === 'allowed' && user) {
    allowedRef.current = { path: currentPath, userId: user.id };
  } else if (
    accessState === 'loading' &&
    user &&
    allowedRef.current?.path === currentPath &&
    allowedRef.current.userId === user.id
  ) {
    accessState = 'allowed';
  }

  useEffect(() => {
    if (accessState === 'denied' && redirectTarget && redirectTarget !== currentPath) {
      navigate(redirectTarget, { replace: true });
    }
  }, [accessState, redirectTarget, currentPath, navigate]);

  if (accessState !== 'allowed') {
    if (isPublicRoute) {
      return <SplashScreen />;
    }
    return <SplashScreen />;
  }

  return <>{children}</>;
};

// Função auxiliar para obter rota padrão por tipo de usuário
const getDefaultRouteForUserType = (userType: string): string => {
  switch (userType) {
    case 'patient':
      return '/home';
    case 'psychologist':
      return '/psychologist-dashboard';
    case 'admin':
      return '/admin-dashboard';
    default:
      return '/';
  }
};

export default RouteGuard;
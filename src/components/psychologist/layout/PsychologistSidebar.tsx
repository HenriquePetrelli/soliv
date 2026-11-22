import { useLocation, useNavigate } from 'react-router-dom';
import { ChevronRight } from 'lucide-react';
import { Button } from '@/components/ui/button';
import { Switch } from '@/components/ui/switch';
import logoImg from '@/assets/soliv-logo.webp';
import { useAuth } from '@/contexts/AuthContext';
import { usePsychologistPresence } from '@/hooks/usePsychologistPresence';
import { cn } from '@/lib/utils';
import {
  PSYCHOLOGIST_MAIN_NAV,
  PSYCHOLOGIST_PAYMENTS_NAV,
  PSYCHOLOGIST_PROFILE_NAV,
  isNavActive,
} from './psychologistNav';

/** Disponibilidade para o SOS, no topo do menu lateral (computador). */
const SidebarStatus = () => {
  const { isOnline, loading, toggle } = usePsychologistPresence();
  return (
    <div
      className={cn(
        'flex items-center gap-3 rounded-xl border p-3',
        isOnline ? 'border-emerald-500/30 bg-emerald-500/10' : 'border-sidebar-border bg-card',
      )}
    >
      <span
        className={cn('h-2.5 w-2.5 shrink-0 rounded-full', isOnline ? 'bg-emerald-500' : 'border border-muted-foreground/60')}
        aria-hidden="true"
      />
      <div className="min-w-0 flex-1">
        <p className="text-sm font-semibold text-foreground">{isOnline ? 'Online' : 'Offline'}</p>
        <p className="text-xs text-muted-foreground">{isOnline ? 'Recebendo pedidos de SOS' : 'Sem pedidos de SOS'}</p>
      </div>
      <Switch checked={isOnline} onCheckedChange={toggle} disabled={loading} aria-label="Alternar disponibilidade para o SOS" />
    </div>
  );
};

const PsychologistSidebar = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user } = useAuth();
  const fullName: string = user?.user_metadata?.full_name || 'Psicólogo';
  const firstName = fullName.split(' ')[0];

  const items = [...PSYCHOLOGIST_MAIN_NAV, PSYCHOLOGIST_PAYMENTS_NAV];
  const profileActive = pathname === PSYCHOLOGIST_PROFILE_NAV.path || pathname.startsWith('/psicologo/suporte');

  return (
    <aside className="hidden md:fixed md:inset-y-0 md:flex md:w-64 md:flex-col md:border-r md:border-sidebar-border md:bg-sidebar md:text-sidebar-foreground">
      <div className="flex items-center justify-center border-b border-secondary-foreground/15 p-6">
        <img src={logoImg} alt="Soliv" style={{ width: '64px', height: '64px' }} className="select-none object-contain" draggable={false} />
      </div>

      <div className="px-4 pt-4">
        <SidebarStatus />
      </div>

      <nav className="flex-1 space-y-1.5 p-4" aria-label="Área do psicólogo">
        {items.map((item) => {
          const active = isNavActive(item, pathname);
          return (
            <Button
              key={item.path}
              variant="ghost"
              aria-current={active ? 'page' : undefined}
              className={cn(
                'h-12 w-full justify-start gap-3 text-left text-sidebar-foreground transition-all duration-200 hover:bg-sidebar-accent hover:text-sidebar-accent-foreground',
                active && 'bg-sidebar-accent text-sidebar-primary',
              )}
              onClick={() => navigate(item.path)}
            >
              <item.icon className="h-5 w-5" />
              <span className="font-medium">{item.label}</span>
            </Button>
          );
        })}
      </nav>

      <div className="border-t border-sidebar-border p-4">
        <button
          type="button"
          onClick={() => navigate(PSYCHOLOGIST_PROFILE_NAV.path)}
          aria-current={profileActive ? 'page' : undefined}
          className={cn(
            'flex w-full items-center gap-3 rounded-xl p-3 text-left transition-colors hover:bg-sidebar-accent',
            profileActive ? 'bg-sidebar-accent' : 'bg-sidebar-accent/60',
          )}
        >
          <div className="flex h-10 w-10 shrink-0 items-center justify-center rounded-full bg-primary">
            <span className="font-semibold text-primary-foreground">{firstName.charAt(0).toUpperCase()}</span>
          </div>
          <div className="min-w-0 flex-1">
            <p className="truncate font-semibold text-sidebar-foreground">Dr.(a) {firstName}</p>
            <p className="text-xs text-muted-foreground">Perfil e configurações</p>
          </div>
          <ChevronRight className="h-4 w-4 shrink-0 text-muted-foreground" />
        </button>
      </div>
    </aside>
  );
};

export default PsychologistSidebar;

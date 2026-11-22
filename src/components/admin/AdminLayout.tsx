import { useState, type ReactNode } from 'react';
import { useLocation, useNavigate } from 'react-router-dom';
import { Bell, MoreHorizontal, Shield } from 'lucide-react';
import logoImg from '@/assets/soliv-logo.webp';
import Wordmark from '@/components/Wordmark';
import { Sheet, SheetContent, SheetDescription, SheetHeader, SheetTitle } from '@/components/ui/sheet';
import { useAuth } from '@/contexts/AuthContext';
import { useNotifications } from '@/hooks/useNotifications';
import { cn } from '@/lib/utils';
import { AdminNav } from './AdminNav';
import { ADMIN_BOTTOM_NAV, ADMIN_NAV_ITEMS, adminSectionPath, type AdminSection } from './adminNavConfig';

const NOTIFICATIONS_PATH = '/admin-notifications';

const BOTTOM_LABELS: Partial<Record<AdminSection, string>> = { overview: 'Início' };

interface AdminLayoutProps {
  /** Seção aberta (ou a tela de notificações). */
  active: AdminSection | 'notifications';
  /** Números ao lado das seções (ex.: psicólogos aguardando aprovação). */
  badges?: Partial<Record<AdminSection, number>>;
  children: ReactNode;
}

/**
 * Layout do admin no mesmo padrão do paciente e do psicólogo: menu lateral no
 * computador; cabeçalho (perfil, marca, avisos) e barra inferior no celular e
 * no tablet. A barra tem as seções mais usadas e "Mais", que abre todas.
 */
const AdminLayout = ({ active, badges = {}, children }: AdminLayoutProps) => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { user, signOut } = useAuth();
  const { unreadCount } = useNotifications();
  const [moreOpen, setMoreOpen] = useState(false);
  const email = user?.email ?? '';
  const initial = (email || 'A').charAt(0).toUpperCase();
  const go = (section: AdminSection) => {
    setMoreOpen(false);
    navigate(adminSectionPath(section));
  };
  const navActive: AdminSection | null = active === 'notifications' ? null : active;
  const moreActive = active !== 'notifications' && !ADMIN_BOTTOM_NAV.includes(active);

  const bell = (
    <button
      type="button"
      className={cn(
        'relative flex h-10 w-10 items-center justify-center rounded-full transition-colors',
        pathname === NOTIFICATIONS_PATH ? 'bg-primary/10 text-primary' : 'text-muted-foreground hover:text-foreground',
      )}
      onClick={() => navigate(NOTIFICATIONS_PATH)}
      aria-label={unreadCount > 0 ? `Notificações, ${unreadCount} não lidas` : 'Notificações'}
    >
      <Bell className="h-5 w-5" fill={pathname === NOTIFICATIONS_PATH ? 'currentColor' : 'none'} />
      {unreadCount > 0 && (
        <span className="absolute -right-0.5 -top-0.5 flex h-4 min-w-[16px] items-center justify-center rounded-full bg-destructive px-1 text-xs font-semibold leading-none text-destructive-foreground">
          {unreadCount > 99 ? '99+' : unreadCount}
        </span>
      )}
    </button>
  );

  return (
    <div className="min-h-screen bg-background">
      {/* Computador: menu lateral */}
      <aside className="hidden md:fixed md:inset-y-0 md:z-30 md:flex md:w-64 md:flex-col md:border-r md:border-sidebar-border md:bg-sidebar">
        <div className="flex flex-col items-center gap-2 border-b border-sidebar-border p-5">
          <img src={logoImg} alt="Soliv" className="h-12 w-12 select-none object-contain" draggable={false} />
          <p className="flex items-center gap-1 text-xs font-medium text-sidebar-foreground/70">
            <Shield className="h-3 w-3" aria-hidden="true" /> Painel administrativo
          </p>
        </div>
        <AdminNav active={navActive} onSelect={go} onLogout={signOut} badges={badges} />
      </aside>

      <div className="md:pl-64">
        {/* Celular e tablet */}
        <header className="fixed left-0 right-0 top-0 z-50 border-b border-border bg-card/95 shadow-sm backdrop-blur-md md:hidden">
          <div className="relative mx-auto flex h-16 items-center justify-between px-4">
            <button type="button" className="flex h-10 w-10 items-center justify-center" onClick={() => go('profile')} aria-label="Meu perfil">
              <span className="flex h-8 w-8 items-center justify-center rounded-full bg-primary text-sm font-medium text-primary-foreground">
                {initial}
              </span>
            </button>
            <button type="button" className="absolute left-1/2 flex -translate-x-1/2 items-center gap-2" onClick={() => go('overview')} aria-label="Início">
              <img src={logoImg} alt="" className="h-9 w-9 select-none object-contain" draggable={false} />
              <Wordmark className="h-[30px] text-primary" />
            </button>
            {bell}
          </div>
        </header>

        {/* Computador */}
        <header className="hidden border-b border-border bg-card/95 px-6 backdrop-blur-md md:sticky md:top-0 md:z-40 md:block">
          <div className="mx-auto flex h-16 max-w-7xl items-center justify-between">
            <span className="max-w-64 truncate text-sm text-muted-foreground">{email}</span>
            <Wordmark className="h-[30px] text-primary" />
            {bell}
          </div>
        </header>

        <main className="pb-24 pt-16 md:pb-10 md:pt-0">
          <div className="mx-auto w-full max-w-7xl space-y-5 px-4 py-4 sm:px-6 md:py-6 lg:px-8">{children}</div>
        </main>
      </div>

      {/* Celular e tablet: barra inferior */}
      <div className="md:hidden">
        <nav className="tabs" aria-label="Painel administrativo">
          {ADMIN_BOTTOM_NAV.map((section) => {
            const item = ADMIN_NAV_ITEMS.find((i) => i.value === section)!;
            const Icon = item.icon;
            const isActive = active === section;
            const badge = badges[section] ?? 0;
            const label = BOTTOM_LABELS[section] ?? item.label;
            return (
              <button
                key={section}
                type="button"
                onClick={() => go(section)}
                aria-current={isActive ? 'page' : undefined}
                aria-label={badge > 0 ? `${label}, ${badge} pendente${badge === 1 ? '' : 's'}` : label}
                className={`tab-item group ${isActive ? 'is-active text-primary' : 'text-muted-foreground hover:text-foreground'}`}
              >
                <span className="relative">
                  <Icon className="h-5 w-5" />
                  {badge > 0 && (
                    <span className="absolute -right-2 -top-1.5 min-w-4 rounded-full bg-warning px-1 text-center text-[10px] font-semibold leading-4 text-warning-foreground">
                      {badge > 9 ? '9+' : badge}
                    </span>
                  )}
                </span>
                <span className="text-xs">{label}</span>
              </button>
            );
          })}
          <button
            type="button"
            onClick={() => setMoreOpen(true)}
            aria-current={moreActive ? 'page' : undefined}
            className={`tab-item group ${moreActive ? 'is-active text-primary' : 'text-muted-foreground hover:text-foreground'}`}
          >
            <MoreHorizontal className="h-5 w-5" />
            <span className="text-xs">Mais</span>
          </button>
        </nav>
      </div>

      <Sheet open={moreOpen} onOpenChange={setMoreOpen}>
        <SheetContent side="left" className="flex w-[85vw] max-w-xs flex-col gap-0 border-sidebar-border bg-sidebar p-0">
          <SheetHeader className="border-b border-sidebar-border p-4 text-left">
            <SheetTitle className="flex items-center gap-2 text-sm text-sidebar-foreground">
              <Shield className="h-4 w-4" aria-hidden="true" /> Painel administrativo
            </SheetTitle>
            <SheetDescription className="truncate text-xs text-sidebar-foreground/70">{email}</SheetDescription>
          </SheetHeader>
          <AdminNav active={navActive} onSelect={go} onLogout={signOut} badges={badges} />
        </SheetContent>
      </Sheet>
    </div>
  );
};

export default AdminLayout;

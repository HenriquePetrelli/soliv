import React from 'react';
import { useNavigate, useLocation } from 'react-router-dom';
import {
  Home,
  MessageCircle,
  Calendar,
  BarChart3,
  ChevronRight
} from 'lucide-react';
import { Button } from '@/components/ui/button';
import LifeRingIcon from '@/components/icons/LifeRingIcon';
import logoImg from '@/assets/soliv-logo.webp';
import { useAuth } from '@/contexts/AuthContext';
import { preloadRoute } from '@/lib/routePreload';

const sidebarItems = [
  { icon: Home, label: 'Home', path: '/home' },
  { icon: MessageCircle, label: 'Chat', path: '/chat' },
  { icon: Calendar, label: 'Consultas', path: '/appointments' },
  { icon: BarChart3, label: 'Meu Progresso', path: '/statistics' },
];


interface DesktopSidebarProps {
  /** Abre a confirmação do SOS (a mesma do botão da barra inferior). */
  onSOSClick?: () => void;
}

export const DesktopSidebar: React.FC<DesktopSidebarProps> = ({ onSOSClick }) => {
  const navigate = useNavigate();
  const location = useLocation();
  const { user } = useAuth();

  const fullName = user?.user_metadata?.full_name || 'Paciente';
  const firstName = fullName.split(' ')[0] || 'Paciente';
  const initial = firstName.charAt(0).toUpperCase();

  return (
    <aside className="hidden md:flex md:flex-col md:w-64 md:fixed md:inset-y-0 md:bg-sidebar md:text-sidebar-foreground md:border-r md:border-sidebar-border">
      {/* Logo Section */}
      <div className="flex items-center justify-center p-6 border-b border-secondary-foreground/15">
        <div
          className="rounded-full border-2 border-primary/15 bg-card p-3 flex items-center justify-center shadow-md"
        >
          <img
            src={logoImg}
            alt="Soliv"
            style={{ width: '80px', height: '80px' }}
            className="object-contain select-none"
            draggable={false}
          />
        </div>
      </div>

      {/* Navigation */}
      <nav className="flex-1 p-4 space-y-2">
        {sidebarItems.map((item) => {
          const isActive = location.pathname === item.path;
          return (
            <Button
              key={item.path}
              variant="ghost"
              className={`
                w-full justify-start gap-3 h-12 text-left transition-all duration-200
                text-sidebar-foreground hover:bg-sidebar-accent hover:text-sidebar-accent-foreground
                ${isActive ? 'bg-sidebar-accent text-sidebar-primary' : ''}
              `}
              onClick={() => navigate(item.path)}
              onPointerEnter={() => preloadRoute(item.path)}
            >
              <item.icon className="w-5 h-5" />
              <span className="font-medium">{item.label}</span>
            </Button>
          );
        })}
      </nav>

      {/* SOS / Ajuda Emergencial */}
      <div className="px-4 pb-4">
        <Button
          variant="ghost"
          className="w-full h-16 justify-start gap-3 px-3 text-left rounded-xl bg-sos-secondary text-white transition-colors duration-200 hover:bg-sos-secondary-hover hover:text-white whitespace-normal [&_svg]:!size-8"
          onClick={() => (onSOSClick ? onSOSClick() : navigate('/sos'))}
        >
          <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-card shadow-sm">
            <LifeRingIcon className="h-8 w-8" />
          </span>
          <span className="text-base font-semibold leading-tight">Ajuda Emergencial</span>
        </Button>
      </div>

      {/* Profile Card */}
      <div className="p-4 border-t border-sidebar-border">
        <button
          onClick={() => navigate('/profile')}
          className="w-full flex items-center gap-3 p-3 rounded-xl bg-sidebar-accent/60 hover:bg-sidebar-accent transition-colors text-left"
        >
          <div className="w-10 h-10 rounded-full bg-primary flex items-center justify-center flex-shrink-0">
            <span className="text-primary-foreground font-semibold">{initial}</span>
          </div>
          <div className="flex-1 min-w-0">
            <p className="font-semibold text-sidebar-foreground truncate">{firstName}</p>
            <p className="text-xs text-muted-foreground">Ver perfil</p>
          </div>
          <ChevronRight className="w-4 h-4 text-muted-foreground flex-shrink-0" />
        </button>
      </div>
    </aside>
  );
};

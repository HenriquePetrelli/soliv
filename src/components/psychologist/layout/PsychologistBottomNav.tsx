import { useLocation, useNavigate } from 'react-router-dom';
import { usePsychologistPresence } from '@/hooks/usePsychologistPresence';
import { PSYCHOLOGIST_HOME, PSYCHOLOGIST_MAIN_NAV, PSYCHOLOGIST_PROFILE_NAV, isNavActive } from './psychologistNav';
import { preloadRoute } from '@/lib/routePreload';

/**
 * Barra inferior do psicólogo (celular e tablet), no mesmo estilo da barra do
 * paciente: Início, Consultas, Agenda, Chat e Perfil. O Início mostra um
 * ponto verde enquanto o psicólogo está online para o SOS.
 */
const PsychologistBottomNav = () => {
  const navigate = useNavigate();
  const { pathname } = useLocation();
  const { isOnline } = usePsychologistPresence();
  const items = [...PSYCHOLOGIST_MAIN_NAV, PSYCHOLOGIST_PROFILE_NAV];

  return (
    <div className="md:hidden">
      <nav className="tabs" aria-label="Área do psicólogo">
        {items.map((item) => {
          const active = isNavActive(item, pathname);
          const Icon = item.icon;
          const showOnline = item.path === PSYCHOLOGIST_HOME && isOnline;
          return (
            <button
              key={item.path}
              type="button"
              onClick={() => navigate(item.path)}
              onTouchStart={() => preloadRoute(item.path)}
              aria-current={active ? 'page' : undefined}
              aria-label={showOnline ? `${item.label} (você está online)` : item.label}
              className={`tab-item group ${
                active ? 'is-active text-primary' : 'text-muted-foreground hover:text-foreground focus-visible:text-primary'
              }`}
            >
              <span className="relative">
                <Icon className="h-5 w-5 transition-colors duration-200" />
                {showOnline && (
                  <span className="absolute -right-1 -top-1 h-2.5 w-2.5 rounded-full bg-emerald-500 ring-2 ring-background" aria-hidden="true" />
                )}
              </span>
              <span className="text-xs transition-colors duration-200">{item.label}</span>
            </button>
          );
        })}
      </nav>
    </div>
  );
};

export default PsychologistBottomNav;

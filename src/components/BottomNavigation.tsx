import { useNavigate, useLocation } from "react-router-dom";
import { Home, Calendar, BarChart3, MessageCircle } from "lucide-react";
import LifeRingIcon from "@/components/icons/LifeRingIcon";
import { preloadRoute } from '@/lib/routePreload';

interface BottomNavigationProps {
  onSOSClick?: () => void;
}

const BottomNavigation = ({ onSOSClick }: BottomNavigationProps) => {
  const navigate = useNavigate();
  const location = useLocation();

  const navItems = [
    {
      icon: Home,
      label: "Home",
      path: "/home",
      isActive: location.pathname === "/home",
    },
    {
      icon: Calendar,
      label: "Consultas",
      path: "/appointments",
      isActive: location.pathname === "/appointments",
    },
    {
      icon: LifeRingIcon,
      label: "SOS",
      path: "/sos",
      isActive: location.pathname === "/sos",
      isSpecial: true,
    },
    {
      icon: MessageCircle,
      label: "Chat",
      path: "/chat",
      isActive: location.pathname === "/chat",
    },
    {
      icon: BarChart3,
      label: "Progresso",
      path: "/statistics",
      isActive: location.pathname.startsWith("/statistics") || location.pathname === "/progress",
    },
  ];

  return (
    <nav className="tabs">
      {navItems.map((item) => {
        const Icon = item.icon;
        const isSpecial = item.isSpecial;

        if (isSpecial) {
          return (
            <div key={item.path} className="tab-item sos">
              <button
                onClick={() => {
                  if (onSOSClick) onSOSClick();
                  else navigate(item.path);
                }}
                aria-label="Pedir ajuda emergencial agora"
                className="sos-button"
              >
                <Icon className="h-8 w-8" />
              </button>
            </div>
          );
        }

        return (
          <button
            key={item.path}
            onClick={() => navigate(item.path)}
            onPointerEnter={() => preloadRoute(item.path)}
            onTouchStart={() => preloadRoute(item.path)}
            aria-current={item.isActive ? "page" : undefined}
            className={`tab-item group ${
              item.isActive
                ? "is-active text-primary"
                : "text-muted-foreground hover:text-foreground focus-visible:text-primary"
            }`}
          >
            <Icon className="h-5 w-5 transition-colors duration-200" />
            <span className="text-xs transition-colors duration-200">{item.label}</span>
          </button>
        );
      })}
    </nav>
  );
};

export default BottomNavigation;

import { LogOut } from 'lucide-react';
import { cn } from '@/lib/utils';
import { ADMIN_NAV_GROUPS, type AdminSection } from './adminNavConfig';

interface AdminNavProps {
  active: AdminSection | null;
  onSelect: (section: AdminSection) => void;
  onLogout: () => void;
  /** Números ao lado do item (ex.: psicólogos aguardando aprovação). */
  badges?: Partial<Record<AdminSection, number>>;
}

/** Lista do menu, usada no menu lateral (desktop) e na gaveta (celular). */
export const AdminNav = ({ active, onSelect, onLogout, badges = {} }: AdminNavProps) => (
  <nav aria-label="Seções do painel" className="flex flex-1 flex-col gap-4 overflow-y-auto p-3">
    {ADMIN_NAV_GROUPS.map((group) => (
      <div key={group.title}>
        <p className="px-3 pb-1 text-xs font-semibold uppercase tracking-wider text-sidebar-foreground/60">{group.title}</p>
        <ul className="space-y-0.5">
          {group.items.map((item) => {
            const Icon = item.icon;
            const isActive = active === item.value;
            const badge = badges[item.value] ?? 0;
            const isChild = !!item.parent;
            return (
              <li key={item.value} className={isChild ? 'pl-6' : undefined}>
                <button
                  type="button"
                  onClick={() => onSelect(item.value)}
                  aria-current={isActive ? 'page' : undefined}
                  aria-label={item.pageTitle}
                  className={cn(
                    'flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium transition-colors',
                    isChild && 'min-h-10 text-[13px]',
                    isActive
                      ? 'bg-sidebar-accent text-sidebar-primary'
                      : 'text-sidebar-foreground hover:bg-sidebar-accent/60',
                  )}
                >
                  <Icon className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
                  <span className="flex-1 truncate">{item.label}</span>
                  {badge > 0 && (
                    <span
                      className="min-w-5 rounded-full bg-warning px-1.5 text-center text-xs font-semibold leading-5 text-warning-foreground"
                      aria-label={`${badge} pendente${badge === 1 ? '' : 's'}`}
                    >
                      {badge > 99 ? '99+' : badge}
                    </span>
                  )}
                </button>
              </li>
            );
          })}
        </ul>
      </div>
    ))}
    <div className="mt-auto border-t border-sidebar-border pt-3">
      <button
        type="button"
        onClick={onLogout}
        className="flex min-h-11 w-full items-center gap-3 rounded-lg px-3 text-left text-sm font-medium text-sidebar-foreground transition-colors hover:bg-destructive/10 hover:text-destructive"
      >
        <LogOut className="h-[18px] w-[18px] shrink-0" aria-hidden="true" />
        Sair
      </button>
    </div>
  </nav>
);

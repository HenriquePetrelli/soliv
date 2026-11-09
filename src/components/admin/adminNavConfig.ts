import {
  Building2,
  CreditCard,
  Fingerprint,
  History,
  LayoutDashboard,
  MessageSquare,
  MessageSquareWarning,
  UserCheck,
  UserCog,
  Users,
  type LucideIcon,
} from 'lucide-react';
import LifeRingIcon from '@/components/icons/LifeRingIcon';

export type AdminSection =
  | 'overview'
  | 'psychologists'
  | 'patients'
  | 'companies'
  | 'sos'
  | 'chat'
  | 'groups'
  | 'audit'
  | 'access_logs'
  | 'payments'
  | 'profile';

export interface AdminNavItem {
  value: AdminSection;
  label: string;
  icon: LucideIcon;
  /** Frase curta embaixo do título da seção. */
  description: string;
}

/** Menu do admin em grupos: 10 seções soltas eram difíceis de achar. */
export const ADMIN_NAV_GROUPS: { title: string; items: AdminNavItem[] }[] = [
  { title: 'Geral', items: [{ value: 'overview', label: 'Visão geral', icon: LayoutDashboard, description: 'Números do app e o que precisa da sua atenção' }] },
  {
    title: 'Pessoas',
    items: [
      { value: 'psychologists', label: 'Psicólogos', icon: UserCheck, description: 'Aprovar cadastros, bloquear e editar profissionais' },
      { value: 'patients', label: 'Pacientes', icon: Users, description: 'Dados, bloqueios e exclusão de contas' },
      { value: 'companies', label: 'Empresas', icon: Building2, description: 'Contratos B2B, vagas e códigos de convite' },
    ],
  },
  {
    title: 'Atendimento',
    items: [
      { value: 'sos', label: 'SOS', icon: LifeRingIcon, description: 'Pedidos de emergência, quem atendeu e como terminaram' },
      { value: 'chat', label: 'Chat', icon: MessageSquare, description: 'Volume de conversas, sem ler o conteúdo' },
    ],
  },
  {
    title: 'Moderação',
    items: [
      { value: 'groups', label: 'Grupos de apoio', icon: MessageSquareWarning, description: 'Depoimentos denunciados e moderação' },
      { value: 'audit', label: 'Auditoria', icon: History, description: 'Registro das ações feitas no painel' },
      { value: 'access_logs', label: 'Registros de acesso', icon: Fingerprint, description: 'Data, hora e IP de cada acesso, guardados por 7 meses (Marco Civil)' },
    ],
  },
  { title: 'Financeiro', items: [{ value: 'payments', label: 'Repasses', icon: CreditCard, description: 'Valores a pagar aos psicólogos e comprovantes' }] },
  { title: 'Conta', items: [{ value: 'profile', label: 'Meu perfil', icon: UserCog, description: 'Senha, preferências e saída da conta' }] },
];

export const ADMIN_NAV_ITEMS = ADMIN_NAV_GROUPS.flatMap((group) => group.items);

/** Barra inferior do celular: o que o admin mais usa; o resto fica em "Mais". */
export const ADMIN_BOTTOM_NAV: AdminSection[] = ['overview', 'psychologists', 'patients', 'payments'];

export const isAdminSection = (value: string | null): value is AdminSection =>
  ADMIN_NAV_ITEMS.some((item) => item.value === value);

export const adminNavGroupOf = (section: AdminSection) =>
  ADMIN_NAV_GROUPS.find((group) => group.items.some((item) => item.value === section))?.title ?? '';

/** Endereço de uma seção do painel (a visão geral é o endereço sem ?secao). */
export const adminSectionPath = (section: AdminSection) =>
  section === 'overview' ? '/admin-dashboard' : `/admin-dashboard?secao=${section}`;

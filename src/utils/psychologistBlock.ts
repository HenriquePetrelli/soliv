export interface BlockInfo {
  is_blocked?: boolean | null;
  blocked_until?: string | null;
  blocked_reason?: string | null;
  blocked_at?: string | null;
}

export type BlockUnit = 'hours' | 'days' | 'weeks' | 'months' | 'years';

/** Unidades do período de bloqueio (mesmos limites da edge function). */
export const BLOCK_UNITS: { value: BlockUnit; singular: string; plural: string; max: number }[] = [
  { value: 'hours', singular: 'hora', plural: 'horas', max: 8760 },
  { value: 'days', singular: 'dia', plural: 'dias', max: 3650 },
  { value: 'weeks', singular: 'semana', plural: 'semanas', max: 520 },
  { value: 'months', singular: 'mês', plural: 'meses', max: 120 },
  { value: 'years', singular: 'ano', plural: 'anos', max: 10 },
];

/** Sugestões rápidas no painel (o admin também digita qualquer quantidade). */
export const BLOCK_PRESETS: { label: string; unit: BlockUnit; amount: number }[] = [
  { label: '1 hora', unit: 'hours', amount: 1 },
  { label: '24 horas', unit: 'hours', amount: 24 },
  { label: '3 dias', unit: 'days', amount: 3 },
  { label: '1 semana', unit: 'weeks', amount: 1 },
  { label: '1 mês', unit: 'months', amount: 1 },
  { label: '1 ano', unit: 'years', amount: 1 },
];

export type BlockDurationChoice =
  | { kind: 'indefinite' }
  | { kind: 'timed'; unit: BlockUnit; amount: number };

/** Corpo enviado às funções admin-block-* para o período escolhido. */
export const blockDurationBody = (choice: BlockDurationChoice) =>
  choice.kind === 'indefinite'
    ? { duration: 'indefinite' }
    : { duration_unit: choice.unit, duration_amount: choice.amount };

/** Texto do período ("3 dias", "Tempo indeterminado"), ou null se a quantidade for inválida. */
export const describeBlockDuration = (choice: BlockDurationChoice): string | null => {
  if (choice.kind === 'indefinite') return 'Tempo indeterminado';
  const unit = BLOCK_UNITS.find((u) => u.value === choice.unit);
  if (!unit || !Number.isInteger(choice.amount) || choice.amount < 1 || choice.amount > unit.max) return null;
  return `${choice.amount} ${choice.amount === 1 ? unit.singular : unit.plural}`;
};

/** Até quando vale o período escolhido, contando de agora (prévia no painel). */
export const previewBlockUntil = (choice: BlockDurationChoice, from = new Date()): Date | null => {
  if (choice.kind === 'indefinite') return null;
  const d = new Date(from.getTime());
  const n = choice.amount;
  if (choice.unit === 'hours') d.setTime(d.getTime() + n * 3_600_000);
  if (choice.unit === 'days') d.setDate(d.getDate() + n);
  if (choice.unit === 'weeks') d.setDate(d.getDate() + n * 7);
  if (choice.unit === 'months') d.setMonth(d.getMonth() + n);
  if (choice.unit === 'years') d.setFullYear(d.getFullYear() + n);
  return d;
};

export interface BlockDurationValue {
  indefinite: boolean;
  unit: BlockUnit;
  /** Texto do campo (pode estar vazio enquanto o admin digita). */
  amount: string;
}

export const EMPTY_BLOCK_DURATION: BlockDurationValue = { indefinite: false, unit: 'days', amount: '' };

/** Converte o valor do formulário do painel na escolha enviada ao servidor (null = inválido). */
export const toBlockChoice = (v: BlockDurationValue) => {
  if (v.indefinite) return { kind: 'indefinite' as const };
  const amount = Number(v.amount);
  const choice = { kind: 'timed' as const, unit: v.unit, amount };
  return describeBlockDuration(choice) ? choice : null;
};

export const isCurrentlyBlocked = (p?: BlockInfo | null): boolean => {
  if (!p?.is_blocked) return false;
  if (!p.blocked_until) return true;
  return new Date(p.blocked_until).getTime() > Date.now();
};

export const formatBlockPeriod = (p?: BlockInfo | null): string => {
  if (!p?.blocked_until) return 'Bloqueado por tempo indeterminado';
  return `Bloqueado até ${new Date(p.blocked_until).toLocaleString('pt-BR')}`;
};

export const formatRemainingTime = (blockedUntil?: string | null): string => {
  if (!blockedUntil) return 'Tempo indeterminado';
  const diff = new Date(blockedUntil).getTime() - Date.now();
  if (diff <= 0) return 'Expirado';
  const days = Math.floor(diff / (24 * 60 * 60 * 1000));
  const hours = Math.floor((diff % (24 * 60 * 60 * 1000)) / (60 * 60 * 1000));
  const minutes = Math.floor((diff % (60 * 60 * 1000)) / (60 * 1000));
  const parts: string[] = [];
  if (days) parts.push(`${days} ${days === 1 ? 'dia' : 'dias'}`);
  if (hours) parts.push(`${hours}h`);
  if (!days && minutes) parts.push(`${minutes}min`);
  return parts.join(' ') || 'menos de 1 minuto';
};

/** Aviso de conta bloqueada (motivo e tempo), mostrado por BlockedAccountNotice. */
type BlockNoticeListener = (notice: BlockInfo | null) => void;
let pendingNotice: BlockInfo | null = null;
const noticeListeners = new Set<BlockNoticeListener>();

export const getBlockedNotice = () => pendingNotice;

export const subscribeBlockedNotice = (listener: BlockNoticeListener) => {
  noticeListeners.add(listener);
  return () => {
    noticeListeners.delete(listener);
  };
};

export const dismissBlockedNotice = () => {
  pendingNotice = null;
  noticeListeners.forEach((l) => l(null));
};

let lastNoticeAt = 0;

/**
 * Mostra UM aviso de conta bloqueada, com o motivo e por quanto tempo
 * (deduplicado: vários guards podem perceber o bloqueio ao mesmo tempo).
 * O aviso é uma janela que fica aberta até a pessoa fechar, mesmo depois de
 * sair da conta.
 */
export const notifyBlockedAccess = async (p?: BlockInfo | null) => {
  const now = Date.now();
  if (now - lastNoticeAt < 5000 && pendingNotice) return;
  lastNoticeAt = now;
  pendingNotice = {
    is_blocked: true,
    blocked_until: p?.blocked_until ?? null,
    blocked_reason: p?.blocked_reason ?? null,
    blocked_at: p?.blocked_at ?? null,
  };
  noticeListeners.forEach((l) => l(pendingNotice));
};

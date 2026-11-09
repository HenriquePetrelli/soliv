// Período do bloqueio de conta pelo admin: tempo indeterminado, ou uma
// quantidade de horas, dias, semanas, meses ou anos. Sem dependências do
// Deno (também roda nos testes do app).

export type BlockUnit = "hours" | "days" | "weeks" | "months" | "years";

export const BLOCK_UNIT_MAX: Record<BlockUnit, number> = {
  hours: 8760,
  days: 3650,
  weeks: 520,
  months: 120,
  years: 10,
};

const LEGACY: Record<string, { unit: BlockUnit; amount: number } | null> = {
  "24h": { unit: "hours", amount: 24 },
  "48h": { unit: "hours", amount: 48 },
  "1w": { unit: "weeks", amount: 1 },
  "2w": { unit: "weeks", amount: 2 },
  "1m": { unit: "months", amount: 1 },
  "1y": { unit: "years", amount: 1 },
  forever: null,
  indefinite: null,
};

/** Data de fim do bloqueio a partir de agora (meses e anos pelo calendário). */
export const addToDate = (from: Date, unit: BlockUnit, amount: number): Date => {
  const d = new Date(from.getTime());
  switch (unit) {
    case "hours":
      d.setTime(d.getTime() + amount * 3_600_000);
      break;
    case "days":
      d.setUTCDate(d.getUTCDate() + amount);
      break;
    case "weeks":
      d.setUTCDate(d.getUTCDate() + amount * 7);
      break;
    case "months":
      d.setUTCMonth(d.getUTCMonth() + amount);
      break;
    case "years":
      d.setUTCFullYear(d.getUTCFullYear() + amount);
      break;
  }
  return d;
};

export type ParsedBlockDuration =
  | { ok: true; until: Date | null; label: string }
  | { ok: false; error: string };

const UNIT_LABEL: Record<BlockUnit, [string, string]> = {
  hours: ["hora", "horas"],
  days: ["dia", "dias"],
  weeks: ["semana", "semanas"],
  months: ["mês", "meses"],
  years: ["ano", "anos"],
};

/**
 * Lê a duração enviada pelo painel: `{ duration: "indefinite" }` ou
 * `{ duration_unit, duration_amount }`. Os códigos antigos ("24h", "1w",
 * "forever"...) continuam aceitos.
 */
export const parseBlockDuration = (body: Record<string, unknown>, now = new Date()): ParsedBlockDuration => {
  const { duration, duration_unit, duration_amount } = body;

  if (typeof duration === "string" && duration in LEGACY && duration_unit === undefined) {
    const legacy = LEGACY[duration];
    if (!legacy) return { ok: true, until: null, label: "tempo indeterminado" };
    return parseBlockDuration({ duration_unit: legacy.unit, duration_amount: legacy.amount }, now);
  }

  if (typeof duration_unit !== "string" || !(duration_unit in BLOCK_UNIT_MAX)) {
    return { ok: false, error: "Período de bloqueio inválido" };
  }
  const unit = duration_unit as BlockUnit;
  const amount = typeof duration_amount === "string" ? Number(duration_amount) : duration_amount;
  if (typeof amount !== "number" || !Number.isInteger(amount) || amount < 1 || amount > BLOCK_UNIT_MAX[unit]) {
    return { ok: false, error: `Quantidade inválida (de 1 a ${BLOCK_UNIT_MAX[unit]} ${UNIT_LABEL[unit][1]})` };
  }
  return {
    ok: true,
    until: addToDate(now, unit, amount),
    label: `${amount} ${UNIT_LABEL[unit][amount === 1 ? 0 : 1]}`,
  };
};

/** Suspensão no login do Supabase (formato de duração do Go, em horas). */
export const authBanDuration = (until: string | null | undefined, blocked: boolean): string => {
  if (!blocked) return "none";
  if (!until) return "876000h"; // ~100 anos: tempo indeterminado
  return `${Math.max(1, Math.ceil((new Date(until).getTime() - Date.now()) / 3_600_000))}h`;
};


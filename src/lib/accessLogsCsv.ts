export interface AccessLogRow {
  id: number;
  user_id: string | null;
  email: string | null;
  user_name: string | null;
  event: string;
  ip_address: string | null;
  user_agent: string | null;
  created_at: string;
}

export const ACCESS_EVENT_LABELS: Record<string, string> = {
  login: 'Login',
  app_open: 'Uso do app',
};

/** Data e hora em Brasília (o Brasil não tem mais horário de verão). */
export const formatBrasilia = (iso: string) =>
  new Date(iso).toLocaleString('pt-BR', {
    timeZone: 'America/Sao_Paulo',
    day: '2-digit',
    month: '2-digit',
    year: 'numeric',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
  });

/** Início do dia (aaaa-mm-dd) em Brasília, como instante. */
export const brasiliaDayStart = (day: string) => new Date(`${day}T00:00:00-03:00`).toISOString();

/** Início do dia seguinte em Brasília: o filtro vai até o fim do dia escolhido. */
export const brasiliaDayEnd = (day: string) =>
  new Date(new Date(`${day}T00:00:00-03:00`).getTime() + 24 * 60 * 60 * 1000).toISOString();

// Célula que começa com = + - @ vira fórmula no Excel: o navegador da pessoa
// (user agent) é texto livre, então vai com um apóstrofo na frente.
const cell = (value: unknown) => {
  let text = String(value ?? '');
  if (/^[=+\-@\t\r]/.test(text)) text = `'${text}`;
  return `"${text.replace(/"/g, '""')}"`;
};

export const ACCESS_LOG_CSV_HEADERS = [
  'Data e hora (UTC)',
  'Data e hora (Brasília)',
  'Evento',
  'E-mail',
  'Nome',
  'ID da conta',
  'IP',
  'Navegador / aparelho',
];

export const buildAccessLogsCsv = (rows: AccessLogRow[]) => {
  const lines = rows.map((r) => [
    new Date(r.created_at).toISOString(),
    formatBrasilia(r.created_at),
    ACCESS_EVENT_LABELS[r.event] ?? r.event,
    r.email,
    r.user_name,
    r.user_id,
    r.ip_address,
    r.user_agent,
  ]);
  return [ACCESS_LOG_CSV_HEADERS, ...lines].map((line) => line.map(cell).join(';')).join('\n');
};

export const downloadCsv = (csv: string, fileName: string) => {
  const blob = new Blob([`\uFEFF${csv}`], { type: 'text/csv;charset=utf-8;' });
  const url = URL.createObjectURL(blob);
  const link = document.createElement('a');
  link.href = url;
  link.download = fileName;
  link.click();
  URL.revokeObjectURL(url);
};

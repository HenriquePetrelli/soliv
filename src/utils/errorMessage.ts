/**
 * Turns a caught error into a short, actionable, Portuguese message safe to
 * show a user — never a raw Supabase/Postgres/network string. Known
 * technical patterns map to a specific friendly message; anything else
 * (including our own short, already-Portuguese business messages thrown by
 * edge functions, e.g. "CPF inválido...") passes through as-is only when it
 * looks like it was written for a person, not a stack trace.
 */
export const getFriendlyErrorMessage = (error: unknown, fallback: string): string => {
  // Erros do Supabase (banco e RPC) chegam como objeto simples { message, code },
  // não como Error. Antes eram ignorados e toda mensagem de regra do banco
  // ("Esta consulta já entrou no repasse", "Muitas ações em pouco tempo"...)
  // virava a mensagem genérica.
  const objectMessage = (error as { message?: unknown } | null)?.message;
  const raw =
    error instanceof Error
      ? error.message
      : typeof error === 'string'
        ? error
        : typeof objectMessage === 'string'
          ? objectMessage
          : '';
  if (!raw) return fallback;

  const message = raw.toLowerCase();

  if (message.includes('failed to fetch') || message.includes('networkerror') || message.includes('network request failed')) {
    return 'Sem conexão com a internet. Verifique sua rede e tente novamente.';
  }
  if (message.includes('timeout') || message.includes('timed out')) {
    return 'A operação demorou demais. Tente novamente.';
  }
  if (message.includes('jwt') || message.includes('token') && message.includes('expired')) {
    return 'Sua sessão expirou. Faça login novamente.';
  }
  if (message.includes('rate limit') || message.includes('muitas tentativas') || message.includes('muitas solicitações')) {
    return 'Muitas tentativas em pouco tempo. Aguarde alguns minutos.';
  }
  if (message.includes('violates row-level security') || message.includes('permission denied')) {
    return 'Você não tem permissão para fazer isso.';
  }
  if (message.includes('duplicate key') || message.includes('already exists') || message.includes('already registered')) {
    return 'Esse registro já existe.';
  }
  if (message.includes('violates foreign key') || message.includes('violates check constraint')) {
    return 'Não foi possível concluir — verifique os dados informados.';
  }
  if (/^\d{3}:/.test(raw) || message.includes('non-2xx status code') || message.includes('edge function returned')) {
    return fallback;
  }

  // A short, already-Portuguese sentence is almost certainly a message we
  // ourselves crafted for the user (edge function business errors, form
  // validation) — safe to show as-is. Anything longer, or written in
  // English/technical jargon, is very likely a raw driver/runtime error.
  const looksHandWritten = raw.length <= 140 && /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]|[.!?]$/.test(raw) && !/^[A-Z][a-zA-Z]*Error:/.test(raw);
  if (looksHandWritten) return raw;

  return fallback;
};

/**
 * Erro de edge function (supabase.functions.invoke): a mensagem do erro é
 * sempre "Edge Function returned a non-2xx status code"; o motivo de verdade
 * ("Este horário já está ocupado", "A consulta já começou"...) vem no corpo
 * da resposta. Devolve esse motivo quando existir, senão o próprio erro.
 */
export const unwrapFunctionError = async (error: unknown): Promise<unknown> => {
  const context = (error as { context?: Response } | null)?.context;
  if (!context || typeof context.json !== 'function') return error;
  try {
    const body = await context.clone().json();
    if (body && typeof body.error === 'string') return body.error;
  } catch {
    // corpo não é JSON: fica o erro original
  }
  return error;
};

/** Mensagem amigável para um erro de edge function (usa o motivo do servidor). */
export const getFunctionErrorMessage = async (error: unknown, fallback: string): Promise<string> =>
  getFriendlyErrorMessage(await unwrapFunctionError(error), fallback);

/**
 * O texto cru de um erro pego num `catch` (Error, erro do Supabase em
 * objeto `{ message }` ou string), sem traduzir. Para mostrar ao usuário,
 * prefira `getFriendlyErrorMessage`.
 */
export const errorText = (error: unknown): string => {
  if (error instanceof Error) return error.message;
  if (typeof error === 'string') return error;
  const message = (error as { message?: unknown } | null)?.message;
  return typeof message === 'string' ? message : '';
};

/** Nome do erro do navegador (ex.: `NotAllowedError` da câmera), ou ''. */
export const errorName = (error: unknown): string => {
  const name = (error as { name?: unknown } | null)?.name;
  return typeof name === 'string' ? name : '';
};

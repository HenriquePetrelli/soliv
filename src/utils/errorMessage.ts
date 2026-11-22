/**
 * Mensagens de erro para o usuário — um catálogo só, como nos apps grandes:
 *
 * 1. Erros que a pessoa consegue resolver (senha fraca, e-mail já cadastrado,
 *    dado inválido, sem internet, sessão expirada, limite de tentativas...)
 *    ganham uma mensagem específica, dizendo o que aconteceu e o que fazer.
 * 2. Erros do sistema (serviço fora, erro interno, 5xx, erro de SQL, código
 *    desconhecido) nunca mostram o texto técnico: viram uma mensagem genérica.
 * 3. Mensagens de regra que nós mesmos escrevemos em português (edge
 *    functions, `raise exception` no banco) passam como estão.
 *
 * A classificação usa primeiro o código do erro (`code` do Supabase Auth,
 * SQLSTATE do Postgres, PGRST do PostgREST, status HTTP) e só depois o texto,
 * porque o texto muda entre versões e o código não.
 */

/** Erro do sistema / inesperado: nada que a pessoa possa corrigir. */
export const GENERIC_ERROR_MESSAGE = 'Algo deu errado do nosso lado. Tente novamente em alguns instantes.';
export const NETWORK_ERROR_MESSAGE = 'Sem conexão com a internet. Verifique sua rede e tente novamente.';
export const TIMEOUT_ERROR_MESSAGE = 'A operação demorou mais que o esperado. Tente novamente.';
export const SESSION_EXPIRED_MESSAGE = 'Sua sessão expirou. Entre novamente para continuar.';
export const PERMISSION_ERROR_MESSAGE = 'Você não tem permissão para fazer isso.';
export const RATE_LIMIT_MESSAGE = 'Muitas tentativas em pouco tempo. Aguarde alguns minutos e tente novamente.';

type ErrorInfo = {
  message: string;
  code: string;
  status: number | null;
  name: string;
  reasons: string[];
};

const asString = (value: unknown): string => (typeof value === 'string' ? value : '');

const extractInfo = (error: unknown): ErrorInfo => {
  if (typeof error === 'string') return { message: error, code: '', status: null, name: '', reasons: [] };
  const e = (error ?? {}) as Record<string, unknown>;
  const rawStatus = e.status ?? e.statusCode;
  const status = typeof rawStatus === 'number' ? rawStatus : Number.parseInt(asString(rawStatus), 10) || null;
  const weak = e.weak_password ?? e.reasons;
  const reasons = Array.isArray(weak)
    ? (weak as unknown[]).map(asString)
    : Array.isArray((weak as { reasons?: unknown } | undefined)?.reasons)
      ? ((weak as { reasons: unknown[] }).reasons).map(asString)
      : [];
  return {
    message: error instanceof Error ? error.message : asString(e.message) || asString(e.error_description) || asString(e.msg),
    code: asString(e.code) || asString(e.error_code),
    status,
    name: asString(e.name),
    reasons,
  };
};

// ---------------------------------------------------------------------------
// Supabase Auth (GoTrue) — https://supabase.com/docs/guides/auth/debugging/error-codes
// ---------------------------------------------------------------------------
const AUTH_MESSAGES: Record<string, string> = {
  // Cadastro
  user_already_exists: 'Este e-mail já está cadastrado. Entre com ele ou recupere a senha.',
  email_exists: 'Este e-mail já está cadastrado. Entre com ele ou recupere a senha.',
  phone_exists: 'Este telefone já está cadastrado em outra conta.',
  identity_already_exists: 'Esta conta já está vinculada a outro usuário.',
  email_address_invalid: 'E-mail inválido. Verifique o endereço informado.',
  email_address_not_authorized: 'Não conseguimos enviar e-mail para este endereço. Use outro e-mail.',
  signup_disabled: 'Novos cadastros estão temporariamente desativados.',
  email_provider_disabled: 'Cadastro com e-mail está temporariamente desativado.',
  phone_provider_disabled: 'Cadastro com telefone está temporariamente desativado.',
  // Senha
  same_password: 'A nova senha precisa ser diferente da senha atual.',
  // Login
  invalid_credentials: 'E-mail ou senha incorretos.',
  email_not_confirmed: 'Confirme seu e-mail antes de entrar. Procure a mensagem na sua caixa de entrada (e no spam).',
  phone_not_confirmed: 'Confirme seu telefone antes de entrar.',
  user_banned: 'Sua conta está bloqueada no momento. Se achar que é um engano, fale com o suporte.',
  user_not_found: 'Não encontramos uma conta com esses dados.',
  provider_disabled: 'Esta forma de login está desativada no momento.',
  // Sessão
  session_expired: SESSION_EXPIRED_MESSAGE,
  session_not_found: SESSION_EXPIRED_MESSAGE,
  refresh_token_not_found: SESSION_EXPIRED_MESSAGE,
  refresh_token_already_used: SESSION_EXPIRED_MESSAGE,
  bad_jwt: SESSION_EXPIRED_MESSAGE,
  no_authorization: SESSION_EXPIRED_MESSAGE,
  reauthentication_needed: 'Por segurança, entre novamente antes de fazer esta alteração.',
  reauthentication_not_valid: 'Código de confirmação inválido. Tente novamente.',
  // Links e códigos
  otp_expired: 'Este link ou código expirou. Peça um novo e tente novamente.',
  otp_disabled: 'Login por código está desativado no momento.',
  flow_state_expired: 'Este link expirou. Peça um novo e tente novamente.',
  flow_state_not_found: 'Este link não é mais válido. Peça um novo e tente novamente.',
  bad_code_verifier: 'Este link não é mais válido. Abra-o no mesmo navegador em que fez o pedido.',
  // Verificação em duas etapas
  mfa_verification_failed: 'Código inválido. Confira o código no seu aplicativo autenticador.',
  mfa_verification_rejected: 'Código inválido. Confira o código no seu aplicativo autenticador.',
  mfa_challenge_expired: 'O código expirou. Gere um novo código e tente novamente.',
  mfa_factor_not_found: 'Verificação em duas etapas não encontrada. Configure-a novamente.',
  insufficient_aal: 'Confirme a verificação em duas etapas para continuar.',
  too_many_enrolled_mfa_factors: 'Você já tem o número máximo de autenticadores cadastrados.',
  // Limites
  over_email_send_rate_limit: 'Enviamos muitos e-mails para este endereço. Aguarde alguns minutos antes de pedir outro.',
  over_sms_send_rate_limit: 'Enviamos muitos SMS para este número. Aguarde alguns minutos antes de pedir outro.',
  over_request_rate_limit: RATE_LIMIT_MESSAGE,
  captcha_failed: 'Não conseguimos confirmar que você não é um robô. Recarregue a página e tente novamente.',
  // Permissão
  not_admin: PERMISSION_ERROR_MESSAGE,
  request_timeout: TIMEOUT_ERROR_MESSAGE,
};

/** Códigos de auth que são falha do sistema: mensagem genérica. */
const AUTH_SYSTEM_CODES = new Set(['unexpected_failure', 'internal_error', 'conflict', 'hook_timeout', 'hook_payload_invalid_content_type', 'hook_timeout_after_retry', 'hook_payload_over_size_limit', 'saml_provider_disabled', 'sso_provider_not_found']);

export const weakPasswordMessage = (reasons: string[]): string => {
  if (reasons.includes('pwned')) {
    return 'Esta senha já apareceu em vazamentos de dados na internet e não é segura. Escolha outra senha.';
  }
  if (reasons.includes('length')) return 'A senha é curta demais. Use pelo menos 8 caracteres.';
  if (reasons.includes('characters')) return 'A senha precisa ter letras e números.';
  return 'Esta senha é fácil de adivinhar. Escolha uma senha mais forte.';
};

// ---------------------------------------------------------------------------
// Postgres (SQLSTATE) e PostgREST
// ---------------------------------------------------------------------------
const DB_MESSAGES: Record<string, string> = {
  '23505': 'Esse registro já existe.',
  '23503': 'Não foi possível concluir porque este item está ligado a outro registro.',
  '23514': 'Não foi possível concluir — verifique os dados informados.',
  '23502': 'Preencha todos os campos obrigatórios.',
  '23P01': 'Este horário conflita com outro já registrado.',
  '22001': 'Um dos campos passou do tamanho permitido.',
  '22P02': 'Um dos campos tem um formato inválido.',
  '22007': 'Data ou hora inválida.',
  '22008': 'Data ou hora inválida.',
  '22003': 'Um dos números informados está fora do permitido.',
  '42501': PERMISSION_ERROR_MESSAGE,
  '57014': TIMEOUT_ERROR_MESSAGE,
  PGRST116: 'Não encontramos o que você procurava. Ele pode ter sido removido.',
  PGRST301: SESSION_EXPIRED_MESSAGE,
  PGRST302: SESSION_EXPIRED_MESSAGE,
  PGRST303: SESSION_EXPIRED_MESSAGE,
};

/** SQLSTATE: 5 caracteres; P0001 = `raise exception` escrito por nós. */
const isSqlState = (code: string) => /^[0-9A-Z]{5}$/.test(code);
const isUserRaisedSqlState = (code: string) => code === 'P0001' || code.startsWith('P0');

// ---------------------------------------------------------------------------
// HTTP (edge functions, storage, fetch)
// ---------------------------------------------------------------------------
const HTTP_MESSAGES: Record<number, string> = {
  401: SESSION_EXPIRED_MESSAGE,
  403: PERMISSION_ERROR_MESSAGE,
  404: 'Não encontramos o que você procurava. Ele pode ter sido removido.',
  408: TIMEOUT_ERROR_MESSAGE,
  409: 'Esse registro já existe ou foi alterado por outra pessoa. Atualize a página e tente novamente.',
  413: 'O arquivo é grande demais.',
  415: 'Tipo de arquivo não aceito.',
  429: RATE_LIMIT_MESSAGE,
};

// ---------------------------------------------------------------------------
// Texto (quando o erro não traz código)
// ---------------------------------------------------------------------------
const TEXT_RULES: Array<[RegExp, string]> = [
  [/failed to fetch|networkerror|network request failed|load failed|err_internet_disconnected|fetch failed/i, NETWORK_ERROR_MESSAGE],
  [/timeout|timed out|aborted/i, TIMEOUT_ERROR_MESSAGE],
  [/jwt|invalid refresh token|refresh token not found|auth session missing|token.*expired/i, SESSION_EXPIRED_MESSAGE],
  [/rate limit|too many requests|muitas tentativas|muitas solicitações/i, RATE_LIMIT_MESSAGE],
  [/violates row-level security|permission denied|not authorized|unauthorized/i, PERMISSION_ERROR_MESSAGE],
  [/invalid login credentials/i, AUTH_MESSAGES.invalid_credentials],
  [/email not confirmed/i, AUTH_MESSAGES.email_not_confirmed],
  [/user already registered|already been registered/i, AUTH_MESSAGES.user_already_exists],
  [/unable to validate email address|invalid email|email address .* is invalid/i, AUTH_MESSAGES.email_address_invalid],
  [/new password should be different/i, AUTH_MESSAGES.same_password],
  [/password should be at least|password should contain/i, weakPasswordMessage(['length'])],
  [/known to be weak|pwned/i, weakPasswordMessage(['pwned'])],
  [/payload too large|entity too large|exceeded the maximum allowed size/i, HTTP_MESSAGES[413]],
  [/duplicate key|already exists|resource already exists/i, DB_MESSAGES['23505']],
  [/violates foreign key/i, DB_MESSAGES['23503']],
  [/violates check constraint/i, DB_MESSAGES['23514']],
  [/violates not-null/i, DB_MESSAGES['23502']],
  [/invalid input syntax/i, DB_MESSAGES['22P02']],
];

const SYSTEM_TEXT = /internal server error|database error|service unavailable|bad gateway|gateway timeout|unexpected|non-2xx status code|edge function returned|relation .* does not exist|column .* does not exist|function .* does not exist|syntax error|^\d{3}:/i;

/**
 * Uma frase curta, em português, que nós mesmos escrevemos para a pessoa
 * (regra de negócio de edge function, `raise exception`, validação).
 */
const looksHandWritten = (raw: string) =>
  raw.length <= 160 &&
  /[áàâãéêíóôõúçÁÀÂÃÉÊÍÓÔÕÚÇ]|\b(não|você|seu|sua|para|está|já|uma?|de|do|da|com)\b/i.test(raw) &&
  !/^[A-Z][a-zA-Z]*Error:/.test(raw) &&
  !SYSTEM_TEXT.test(raw);

const isNetworkError = (info: ErrorInfo): boolean => {
  if (info.name === 'FunctionsFetchError') return true;
  if (info.name === 'AuthRetryableFetchError' && !info.status) return true;
  if (info.name === 'TypeError' && /fetch|network|load failed/i.test(info.message)) return true;
  return typeof navigator !== 'undefined' && navigator.onLine === false;
};

const classify = (error: unknown, fallback: string): string => {
  if (error === null || error === undefined || error === '') return fallback;
  const info = extractInfo(error);

  if (isNetworkError(info)) return NETWORK_ERROR_MESSAGE;

  const { code, status, message, reasons } = info;

  // 1. Código do Supabase Auth
  if (code === 'weak_password' || reasons.length > 0) return weakPasswordMessage(reasons);
  if (code === 'validation_failed') {
    if (/email/i.test(message)) return AUTH_MESSAGES.email_address_invalid;
    if (/password/i.test(message)) return weakPasswordMessage([]);
    return 'Verifique os dados informados e tente novamente.';
  }
  if (AUTH_MESSAGES[code]) return AUTH_MESSAGES[code];
  if (AUTH_SYSTEM_CODES.has(code)) return fallback;

  // 2. Código do Postgres / PostgREST
  if (DB_MESSAGES[code]) return DB_MESSAGES[code];
  if (isSqlState(code) && isUserRaisedSqlState(code)) {
    return message && looksHandWritten(message) ? message : fallback;
  }
  if (code.startsWith('PGRST') || isSqlState(code)) return fallback;

  // 3. Texto conhecido
  for (const [pattern, friendly] of TEXT_RULES) {
    if (pattern.test(message)) return friendly;
  }

  // 4. Mensagem de regra escrita por nós (vale mais que o status genérico)
  if (message && looksHandWritten(message)) return message;

  // 5. Status HTTP
  if (status && HTTP_MESSAGES[status]) return HTTP_MESSAGES[status];

  return fallback;
};

/**
 * Mensagem curta, em português e segura para mostrar ao usuário, a partir de
 * qualquer erro pego num `catch` (Error, erro do Supabase em objeto, string).
 * `fallback` é a mensagem genérica do contexto ("Não foi possível salvar.")
 * usada para erros do sistema; sem ela, vale `GENERIC_ERROR_MESSAGE`.
 */
export const getFriendlyErrorMessage = (error: unknown, fallback: string = GENERIC_ERROR_MESSAGE): string =>
  classify(error, fallback);

/** Mesma coisa, com nome mais direto para erros do `supabase.auth`. */
export const getAuthErrorMessage = getFriendlyErrorMessage;

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
    if (body && typeof body.message === 'string') return body.message;
  } catch {
    // corpo não é JSON: fica o erro original
  }
  return error;
};

/** Mensagem amigável para um erro de edge function (usa o motivo e o status do servidor). */
export const getFunctionErrorMessage = async (error: unknown, fallback: string = GENERIC_ERROR_MESSAGE): Promise<string> => {
  const context = (error as { context?: Response } | null)?.context;
  const status = context && typeof context.status === 'number' ? context.status : null;
  let body: Record<string, unknown> | null = null;
  if (context && typeof context.json === 'function') {
    try {
      body = await context.clone().json();
    } catch {
      body = null;
    }
  }
  if (!body) return classify(status ? { ...extractInfo(error), status, message: '' } : error, fallback);
  const message = asString(body.error) || asString(body.message);
  const code = asString(body.code) || asString(body.error_code);
  return classify({ message, code, status, weak_password: body.weak_password }, fallback);
};

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

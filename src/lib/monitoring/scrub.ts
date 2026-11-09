/**
 * Limpeza do que vai para o Grafana. O Soliv é um app de saúde mental: nada
 * que identifique a pessoa (e-mail, telefone, CPF, ids, tokens de login que o
 * Supabase põe no endereço) pode sair do aparelho junto de um erro.
 */

const EMAIL = /[A-Za-z0-9._%+-]+@[A-Za-z0-9.-]+\.[A-Za-z]{2,}/g;
const JWT = /eyJ[A-Za-z0-9_-]+\.[A-Za-z0-9_-]+(?:\.[A-Za-z0-9_-]+)?/g;
const UUID = /[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}/gi;
const CPF = /\b\d{3}\.\d{3}\.\d{3}-\d{2}\b/g;
const PHONE = /\(?\b\d{2}\)?\s?9?\d{4}-?\d{4}\b/g;
const LONG_NUMBER = /\b\d{8,}\b/g;
// Endereço com ?consulta ou #fragmento: o link de redefinir senha leva o
// token no fragmento e os filtros do Supabase levam ids na consulta.
const URL_TAIL = /(\b(?:https?|capacitor):\/\/[^\s"'?#]*)[?#][^\s"']*/g;
const PATH_TAIL = /(^|[\s"'(])(\/[^\s"'?#]*)[?#][^\s"']*/g;

export function scrubText(text: string): string {
  return text
    .replace(URL_TAIL, '$1')
    .replace(PATH_TAIL, '$1$2')
    .replace(JWT, '[token]')
    .replace(EMAIL, '[email]')
    .replace(UUID, ':id')
    .replace(CPF, '[cpf]')
    .replace(PHONE, '[telefone]')
    .replace(LONG_NUMBER, '[numero]');
}

/** Copia o valor limpando todo texto dentro dele; números e booleanos ficam. */
export function scrubDeep<T>(value: T, depth = 0): T {
  if (typeof value === 'string') return scrubText(value) as T;
  if (depth > 12 || value === null || typeof value !== 'object') return value;
  if (Array.isArray(value)) return value.map((v) => scrubDeep(v, depth + 1)) as T;
  const out: Record<string, unknown> = {};
  for (const [key, v] of Object.entries(value as Record<string, unknown>)) {
    out[key] = scrubDeep(v, depth + 1);
  }
  return out as T;
}

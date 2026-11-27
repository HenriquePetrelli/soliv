/**
 * Só caminhos do próprio app. "//site.com" e "/\site.com" também começam com
 * "/", mas o navegador trata os dois como outro site.
 */
export const isAppPath = (value: unknown): value is string =>
  typeof value === 'string' &&
  value.startsWith('/') &&
  !value.startsWith('//') &&
  !value.includes('\\') &&
  // Sem caracteres de controle (quebra de linha, tab...), que o navegador descarta.
  ![...value].some((c) => c.charCodeAt(0) < 0x20);

export const pushTarget = (data: Record<string, unknown> | undefined | null): string | null => {
  if (!data) return null;
  if (isAppPath(data.url)) return data.url;
  if (data.type === 'sos') return '/psychologist-dashboard';
  return null;
};

/**
 * Só devolve links http(s) — nunca `javascript:`, `data:` etc.
 *
 * Use antes de abrir/exibir um link que veio do banco e que outra pessoa pode
 * ter escrito (ex.: `document_url` do psicólogo, aberto pelo admin). Um
 * `javascript:` aberto com `window.open` ou atribuído a `location.href` roda
 * script com a sessão de quem clicou.
 */
export const safeHttpUrl = (value: string | null | undefined): string | null => {
  if (!value) return null;
  try {
    const url = new URL(value.trim(), window.location.origin);
    return url.protocol === 'https:' || url.protocol === 'http:' ? url.href : null;
  } catch {
    return null;
  }
};

/** Abre um link externo em nova aba só se for http(s). */
export const openSafeUrl = (value: string | null | undefined): void => {
  const url = safeHttpUrl(value);
  if (url) window.open(url, '_blank', 'noopener,noreferrer');
};

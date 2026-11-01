/**
 * "Depois que a tela abriu": espera o `load` da página e um momento ocioso do
 * navegador. Padrão dos apps grandes para trabalho que não é da primeira tela
 * (pré-carregar abas, push, conferências periódicas): ele não disputa rede e
 * processador com o que a pessoa está esperando ver.
 */
type IdleWindow = typeof globalThis & {
  requestIdleCallback?: (cb: () => void, options?: { timeout?: number }) => number;
  cancelIdleCallback?: (id: number) => void;
};

/** Roda `callback` depois do load + ocioso. Devolve uma função que cancela. */
export const afterPageSettles = (callback: () => void, { minDelayMs = 0, idleTimeoutMs = 3000 } = {}): (() => void) => {
  const g = globalThis as IdleWindow;
  let cancelled = false;
  let timer: ReturnType<typeof setTimeout> | undefined;
  let idleId: number | undefined;

  const runWhenIdle = () => {
    if (cancelled) return;
    if (g.requestIdleCallback) idleId = g.requestIdleCallback(() => !cancelled && callback(), { timeout: idleTimeoutMs });
    else timer = setTimeout(() => !cancelled && callback(), 200);
  };
  const afterLoad = () => {
    if (cancelled) return;
    timer = setTimeout(runWhenIdle, minDelayMs);
  };

  if (typeof document === 'undefined' || document.readyState === 'complete') afterLoad();
  else window.addEventListener('load', afterLoad, { once: true });

  return () => {
    cancelled = true;
    if (timer !== undefined) clearTimeout(timer);
    if (idleId !== undefined) g.cancelIdleCallback?.(idleId);
    if (typeof window !== 'undefined') window.removeEventListener('load', afterLoad);
  };
};

type NetworkInformation = { saveData?: boolean; effectiveType?: string };

/** Conexão lenta ou "economia de dados" ligada: não baixar nada por antecipação. */
export const isConstrainedNetwork = (): boolean => {
  const connection = (globalThis.navigator as Navigator & { connection?: NetworkInformation } | undefined)?.connection;
  if (!connection) return false;
  return connection.saveData === true || /(^|-)2g$|^3g$/.test(connection.effectiveType ?? '');
};

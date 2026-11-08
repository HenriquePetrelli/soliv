/**
 * Executa `fn` para cada item com no máximo `limit` ao mesmo tempo. Com
 * milhares de envios (push, lembretes), disparar todos juntos estourava
 * memória e conexões da edge function.
 */
export const mapLimit = async <T>(items: T[], limit: number, fn: (item: T) => Promise<void>) => {
  let next = 0;
  const workers = Array.from({ length: Math.min(limit, items.length) }, async () => {
    while (next < items.length) {
      const item = items[next++];
      await fn(item);
    }
  });
  await Promise.all(workers);
};

/** Tempo máximo de uma rodada (a função tem limite; o resto fica para a próxima). */
export const ROUND_BUDGET_MS = 40_000;

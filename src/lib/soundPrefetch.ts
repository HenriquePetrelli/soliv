import { isNativeApp } from '@/lib/soundUrl';

const prefetched = new Set<string>();

/**
 * Adiciona <link rel="prefetch" as="audio"> ao <head> para popular o cache do
 * browser antes do usuário tocar. Idempotente por URL.
 */
export function prefetchSounds(files: string[]) {
  if (typeof document === "undefined") return;
  // No app os sons vêm pela internet (~28 MB cada): baixar adiantado gastaria
  // o plano de dados de quem nem vai ouvir.
  if (isNativeApp()) return;
  for (const file of files) {
    if (!file || prefetched.has(file)) continue;
    prefetched.add(file);
    const link = document.createElement("link");
    link.rel = "prefetch";
    link.as = "audio";
    link.href = file;
    // fetchpriority "low" para não competir com recursos críticos
    (link as HTMLLinkElement & { fetchPriority?: string }).fetchPriority = "low";
    document.head.appendChild(link);
  }
}

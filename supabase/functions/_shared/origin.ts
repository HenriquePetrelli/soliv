// Endereço do app para os links de volta (Stripe: sucesso, cancelamento, portal).
//
// Antes o cabeçalho `Origin` da requisição ia direto para o link: qualquer
// site que chamasse a função montava um checkout que voltava para ele. Agora
// só valem os endereços do Soliv (site, prévias da Lovable, app nativo e
// desenvolvimento local) e os de APP_ALLOWED_ORIGINS (separados por vírgula);
// qualquer outro volta para o site.

export const DEFAULT_APP_ORIGIN = "https://solivsaude.com.br";

const ALLOWED_HOSTS = new Set(["solivsaude.com.br", "www.solivsaude.com.br"]);
const ALLOWED_HOST_SUFFIXES = [".lovable.app", ".lovableproject.com"];

const env = (name: string): string | undefined =>
  (globalThis as { Deno?: { env: { get(key: string): string | undefined } } }).Deno?.env.get(name);

export const isAllowedOrigin = (origin: string | null | undefined, extra: string[] = []): origin is string => {
  if (!origin) return false;
  // Esquema próprio: URL.origin dele é "null", então confere o texto.
  if (origin === "capacitor://localhost") return true;
  let url: URL;
  try {
    url = new URL(origin);
  } catch {
    return false;
  }
  if (url.origin !== origin) return false;
  if (extra.includes(origin)) return true;
  if (url.hostname === "localhost" || url.hostname === "127.0.0.1") {
    return url.protocol === "http:" || url.protocol === "https:";
  }
  if (url.protocol !== "https:") return false;
  return ALLOWED_HOSTS.has(url.hostname) || ALLOWED_HOST_SUFFIXES.some((suffix) => url.hostname.endsWith(suffix));
};

/** Origem do app para montar links de volta; desconhecida vira o site. */
export const appOrigin = (req: Request): string => {
  const origin = req.headers.get("origin");
  const extra = (env("APP_ALLOWED_ORIGINS") ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  return isAllowedOrigin(origin, extra) ? origin : (env("APP_ORIGIN") ?? DEFAULT_APP_ORIGIN);
};

// Endereço do app para os links de volta (Stripe: sucesso, cancelamento, portal).
//
// Antes o cabeçalho `Origin` da requisição ia direto para o link: qualquer
// site que chamasse a função montava um checkout que voltava para ele. Agora
// só valem os endereços do Soliv (site, prévias da Lovable, app nativo e
// desenvolvimento local) e os de APP_ALLOWED_ORIGINS (separados por vírgula);
// qualquer outro volta para o site.
//
// Prévias da Lovable: só as deste projeto. Qualquer pessoa cria um site em
// *.lovable.app, então aceitar o domínio inteiro deixava um site de terceiros
// receber a volta do checkout (e, no frameGuard, exibir o app num iframe).

export const DEFAULT_APP_ORIGIN = "https://solivsaude.com.br";

const ALLOWED_HOSTS = new Set(["solivsaude.com.br", "www.solivsaude.com.br"]);

/** Identificadores deste projeto na Lovable (id e nome publicado). */
const LOVABLE_PROJECT_ID = "82bda655-81e5-448f-832e-ea464e8925dc";
const LOVABLE_PROJECT_SLUG = "calmconnect-auth-flow";

/**
 * Endereços da Lovable deste projeto: o publicado, a prévia e a prévia por id
 * (os prefixos "preview--" e "id-preview--" são da Lovable, não do usuário).
 */
export const isProjectLovableHost = (hostname: string): boolean =>
  new RegExp(
    `^(?:(?:id-preview|preview)--)?(?:${LOVABLE_PROJECT_ID}|${LOVABLE_PROJECT_SLUG})\\.(?:lovable\\.app|lovableproject\\.com)$`,
    "i",
  ).test(hostname);

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
  return ALLOWED_HOSTS.has(url.hostname) || isProjectLovableHost(url.hostname);
};

/** Origem do app para montar links de volta; desconhecida vira o site. */
export const appOrigin = (req: Request): string => {
  const origin = req.headers.get("origin");
  const extra = (env("APP_ALLOWED_ORIGINS") ?? "").split(",").map((o) => o.trim()).filter(Boolean);
  return isAllowedOrigin(origin, extra) ? origin : (env("APP_ORIGIN") ?? DEFAULT_APP_ORIGIN);
};

// Serve as edge functions do repositório com o Deno da máquina, em
// http://127.0.0.1:<porta>/functions/v1/<nome>, para o teste de ponta a ponta
// local da transcrição (ver LEIA-ME.md).
//
// Por que não o `supabase functions serve`: o contêiner do edge runtime não
// tem acesso à internet em alguns ambientes (proxy) e não baixa os imports
// `https://esm.sh/...`. Aqui cada `index.ts` é carregado como está; o
// `Deno.serve` dele é capturado e um servidor só encaminha pelo nome.
//
// Uso: deno run -A e2e/transcricao/functionsHost.ts <porta> <função> [<função>...]
// Variáveis de ambiente: as mesmas das edge functions (SUPABASE_URL,
// SUPABASE_SERVICE_ROLE_KEY, LOVABLE_API_KEY, LOVABLE_AI_GATEWAY_URL...).

type Handler = (req: Request) => Response | Promise<Response>;

const port = Number(Deno.args[0] ?? 54399);
const names = Deno.args.slice(1);
const handlers = new Map<string, Handler>();

const realServe = Deno.serve.bind(Deno);
let capturing: string | null = null;
// deno-lint-ignore no-explicit-any
(Deno as any).serve = (...args: unknown[]) => {
  const handler = args.find((a) => typeof a === "function") as Handler | undefined;
  if (!capturing || !handler) throw new Error("Deno.serve fora da captura");
  handlers.set(capturing, handler);
  return { finished: Promise.resolve(), shutdown: async () => {}, ref() {}, unref() {}, addr: { port } };
};

const root = new URL("../../supabase/functions/", import.meta.url);
for (const name of names) {
  capturing = name;
  await import(new URL(`${name}/index.ts`, root).href);
}
capturing = null;

const cors = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "GET, POST, OPTIONS",
};

realServe({ port, hostname: "127.0.0.1", onListen: () => console.log(`funções em :${port}: ${names.join(", ")}`) }, async (req) => {
  const url = new URL(req.url);
  const match = url.pathname.match(/^\/functions\/v1\/([^/]+)/);
  const handler = match ? handlers.get(match[1]) : undefined;
  if (!handler) {
    return new Response(JSON.stringify({ error: "função não servida no teste" }), { status: 404, headers: { ...cors, "Content-Type": "application/json" } });
  }
  return await handler(req);
});

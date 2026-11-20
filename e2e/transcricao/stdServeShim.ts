// Substitui `https://deno.land/std@0.190.0/http/server.ts` no teste local
// (ver functionsHost.ts): o `serve` antigo da std vira o `Deno.serve` atual.
type Handler = (req: Request) => Response | Promise<Response>;
export const serve = (handler: Handler) => Deno.serve(handler);

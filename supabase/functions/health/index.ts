import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";

/**
 * "O Soliv está de pé?" — chamada a cada poucos minutos pelo Synthetic
 * Monitoring do Grafana Cloud (ver docs/monitoramento-grafana.md).
 *
 * Responde 200 quando as edge functions rodam E o banco responde; 503 quando
 * o banco não responde. Pública (verify_jwt = false) e sem nenhum dado: só o
 * estado e o tempo que o banco levou.
 */

const headers = { "Content-Type": "application/json", "Cache-Control": "no-store" };

Deno.serve(async (req: Request): Promise<Response> => {
  if (req.method !== "GET" && req.method !== "HEAD") {
    return new Response(JSON.stringify({ status: "method_not_allowed" }), { status: 405, headers });
  }

  const started = Date.now();
  try {
    const supabase = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } },
    );
    const { error } = await supabase
      .from("profiles")
      .select("id", { head: true, count: "exact" })
      .limit(1)
      .abortSignal(AbortSignal.timeout(5000));
    const dbMs = Date.now() - started;
    if (error) {
      console.error("health: banco não respondeu", error.message);
      return new Response(JSON.stringify({ status: "degraded", db: "error", db_ms: dbMs }), { status: 503, headers });
    }
    return new Response(JSON.stringify({ status: "ok", db: "ok", db_ms: dbMs }), { status: 200, headers });
  } catch (error) {
    console.error("health: falha", error instanceof Error ? error.message : String(error));
    return new Response(JSON.stringify({ status: "degraded", db: "unreachable" }), { status: 503, headers });
  }
});

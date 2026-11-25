// Tela de login: a conta bloqueada pelo admin não consegue entrar (o login do
// Supabase recusa), então o app pergunta aqui o motivo e até quando vale.
// Só responde a quem sabe a senha da conta; senha errada ou conta sem
// bloqueio devolvem a mesma resposta vazia.
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { monitored } from "../_shared/monitoring.ts";
import { withinRateLimit } from "../_shared/guards.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } },
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

Deno.serve(monitored("account-block-status", async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Método não permitido" }, 405);

  try {
    const body = await req.json().catch(() => null) as Record<string, unknown> | null;
    const email = typeof body?.email === "string" ? body.email.trim().toLowerCase() : "";
    const password = typeof body?.password === "string" ? body.password : "";
    if (!email || !password || email.length > 320 || password.length > 200) return json({ block: null });

    // Cada chamada confere uma senha (bcrypt). Sem limite, servia para testar
    // senhas de contas bloqueadas fora dos limites do login e para sobrecarregar
    // o banco. Limite por endereço de rede e por conta; acima dele, resposta vazia.
    const ip = (req.headers.get("x-forwarded-for") ?? "").split(",")[0].trim() || req.headers.get("cf-connecting-ip") || "sem-ip";
    const [ipOk, emailOk] = await Promise.all([
      withinRateLimit(`account-block-status:ip:${ip}`, 20, 900),
      withinRateLimit(`account-block-status:email:${email}`, 10, 900),
    ]);
    if (!ipOk || !emailOk) return json({ block: null });

    const { data, error } = await supabase.rpc("account_block_status", { p_email: email, p_password: password });
    if (error) {
      console.error("account-block-status error:", error.message);
      return json({ block: null });
    }
    return json({ block: data ?? null });
  } catch (error) {
    console.error("account-block-status error:", error);
    return json({ block: null });
  }
}));

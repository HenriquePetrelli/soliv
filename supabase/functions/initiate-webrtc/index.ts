import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { monitored } from "../_shared/monitoring.ts";

// Sala de vídeo (webrtc_sessions) de um pedido de SOS.
//
// O app atual cria a sala ao aceitar o SOS (psychologist-emergency); esta
// função fica para chamadas antigas. Correções da varredura de segurança:
// - não grava mais nos logs os cabeçalhos (com o token de login) nem o corpo;
// - não devolve mais detalhes internos de erro (`debug`, `details`);
// - psicólogo só entra na sala do SOS que ELE aceitou. Antes qualquer
//   psicólogo aprovado criava a sala de um SOS ainda pendente e virava
//   participante dela até alguém aceitar.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
  "Access-Control-Allow-Methods": "POST, OPTIONS",
};

const STUN_SERVERS = ["stun:stun.l.google.com:19302", "stun:global.stun.twilio.com:3478"];
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { status, headers: { ...corsHeaders, "Content-Type": "application/json" } });

Deno.serve(monitored("initiate-webrtc", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  if (req.method !== "POST") return json({ error: "Method not allowed" }, 405);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const serviceKey = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (!url || !serviceKey) return json({ error: "Supabase env not configured" }, 500);

    const authHeader = req.headers.get("Authorization") ?? "";
    if (!authHeader.startsWith("Bearer ")) {
      return json({ error: "Token de autenticação ausente ou mal formatado" }, 401);
    }
    const supabase = createClient(url, serviceKey, { auth: { persistSession: false, autoRefreshToken: false } });
    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.slice(7));
    if (authError || !user) return json({ error: "Token inválido ou expirado" }, 403);

    const body = await req.json().catch(() => null) as { emergency_request_id?: unknown; user_type?: unknown } | null;
    const requestId = body?.emergency_request_id;
    const userType = body?.user_type;
    if (typeof requestId !== "string" || !UUID_RE.test(requestId)) {
      return json({ error: "Campo obrigatório ausente: emergency_request_id", code: "MISSING_EMERGENCY_REQUEST_ID" }, 400);
    }
    if (userType !== "psychologist" && userType !== "patient") {
      return json({ error: "user_type deve ser 'psychologist' ou 'patient'", code: "INVALID_USER_TYPE" }, 400);
    }

    const { data: request } = await supabase
      .from("emergency_requests")
      .select("id, status, patient_id, accepted_by")
      .eq("id", requestId)
      .maybeSingle();
    if (!request) {
      return json({ error: "Solicitação de emergência não encontrada ou não existe", code: "EMERGENCY_REQUEST_NOT_FOUND" }, 404);
    }

    if (userType === "psychologist") {
      const { data: canAttend } = await supabase.rpc("psychologist_can_attend", { p_user_id: user.id });
      if (!canAttend) return json({ error: "Acesso negado" }, 403);
    }

    const hasAccess = userType === "patient"
      ? request.patient_id === user.id
      : request.accepted_by === user.id && ["accepted", "in_progress"].includes(request.status);
    if (!hasAccess) return json({ error: "Unauthorized access to this emergency request" }, 403);

    const { data: existing } = await supabase
      .from("webrtc_sessions")
      .select("id")
      .eq("emergency_request_id", requestId)
      .maybeSingle();
    if (existing) return json({ success: true, session_id: existing.id, stun_servers: STUN_SERVERS });

    const { data: session, error: sessionError } = await supabase
      .from("webrtc_sessions")
      .insert({
        emergency_request_id: requestId,
        status: "pending",
        expires_at: new Date(Date.now() + 24 * 60 * 60 * 1000).toISOString(),
        patient_id: request.patient_id,
        psychologist_id: request.accepted_by ?? null,
      })
      .select("id")
      .single();
    if (sessionError || !session) {
      console.error("initiate-webrtc: falha ao criar a sala", sessionError?.code);
      return json({ error: "Falha ao criar sessão de vídeo", code: "SESSION_CREATION_FAILED" }, 500);
    }

    return json({ success: true, session_id: session.id, stun_servers: STUN_SERVERS });
  } catch (error) {
    console.error("initiate-webrtc: erro inesperado", error instanceof Error ? error.name : "erro");
    return json({ error: "Erro interno no servidor" }, 500);
  }
}));

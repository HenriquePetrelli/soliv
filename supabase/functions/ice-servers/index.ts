// Servidores de conexão (ICE) para as chamadas de vídeo do SOS e das consultas.
//
// Só com STUN (o que havia antes), a chamada não conecta quando um dos lados
// está atrás de NAT restritivo: boa parte das redes móveis (NAT da operadora)
// e redes corporativas. O TURN retransmite o áudio/vídeo nesses casos.
//
// Configuração (secrets das edge functions), uma das duas:
// - Cloudflare Realtime TURN: CLOUDFLARE_TURN_KEY_ID e CLOUDFLARE_TURN_API_TOKEN
//   (gera credenciais temporárias a cada chamada);
// - qualquer outro TURN: TURN_URLS (separadas por vírgula), TURN_USERNAME e
//   TURN_CREDENTIAL.
// Sem configuração, devolve só STUN (como antes).
//
// TURN só para quem está numa sala de chamada das últimas 24 h: a chave
// anônima do app é pública e passaria pelo verify_jwt, e o tráfego do TURN é pago.

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.52.1";
import { monitored } from "../_shared/monitoring.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

type IceServer = { urls: string | string[]; username?: string; credential?: string };

const STUN: IceServer[] = [
  { urls: ["stun:stun.l.google.com:19302", "stun:stun1.l.google.com:19302"] },
  { urls: "stun:stun.cloudflare.com:3478" },
];

const TTL_SECONDS = 4 * 60 * 60;

const cloudflareTurn = async (): Promise<IceServer[] | null> => {
  const keyId = Deno.env.get("CLOUDFLARE_TURN_KEY_ID");
  const token = Deno.env.get("CLOUDFLARE_TURN_API_TOKEN");
  if (!keyId || !token) return null;
  const response = await fetch(`https://rtc.live.cloudflare.com/v1/turn/keys/${keyId}/credentials/generate`, {
    method: "POST",
    headers: { Authorization: `Bearer ${token}`, "Content-Type": "application/json" },
    body: JSON.stringify({ ttl: TTL_SECONDS }),
  });
  if (!response.ok) throw new Error(`Cloudflare TURN: ${response.status}`);
  const body = await response.json();
  // Formato: { iceServers: { urls, username, credential } } (ou uma lista).
  const servers = body?.iceServers;
  if (!servers) return null;
  return Array.isArray(servers) ? servers : [servers];
};

const staticTurn = (): IceServer[] | null => {
  const urls = (Deno.env.get("TURN_URLS") ?? "").split(",").map((u) => u.trim()).filter(Boolean);
  const username = Deno.env.get("TURN_USERNAME");
  const credential = Deno.env.get("TURN_CREDENTIAL");
  if (urls.length === 0 || !username || !credential) return null;
  return [{ urls, username, credential }];
};

// TURN só para quem está numa sala de chamada recente (SOS ou consulta):
// antes qualquer conta logada gerava credenciais do TURN, que é pago.
const inRecentCall = async (req: Request): Promise<boolean> => {
  const token = (req.headers.get("Authorization") ?? "").replace("Bearer ", "");
  if (!token) return false;
  const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "");
  const { data, error } = await supabase.auth.getUser(token);
  if (error || !data.user) return false;
  const since = new Date(Date.now() - 24 * 60 * 60 * 1000).toISOString();
  const { data: rooms, error: roomsError } = await supabase
    .from("webrtc_sessions")
    .select("id")
    .or(`patient_id.eq.${data.user.id},psychologist_id.eq.${data.user.id}`)
    .gte("created_at", since)
    .limit(1);
  if (roomsError) {
    console.error("ice-servers: falha ao conferir a sala", roomsError);
    return false;
  }
  return (rooms ?? []).length > 0;
};

Deno.serve(monitored("ice-servers", async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  let turn: IceServer[] | null = null;
  if (await inRecentCall(req)) {
    try {
      turn = (await cloudflareTurn()) ?? staticTurn();
    } catch (error) {
      console.error("ice-servers: falha ao obter TURN", error);
      turn = staticTurn();
    }
  }

  return new Response(
    JSON.stringify({ iceServers: [...STUN, ...(turn ?? [])], turn: Boolean(turn), ttl: TTL_SECONDS }),
    { headers: { ...corsHeaders, "Content-Type": "application/json", "Cache-Control": "no-store" } },
  );
}));

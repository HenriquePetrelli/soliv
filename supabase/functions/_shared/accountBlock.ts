// Bloqueio de conta pelo admin (paciente ou psicólogo).
//
// Ao bloquear, a conta sai na hora: o login do Supabase fica suspenso pelo
// mesmo período, as sessões abertas são encerradas e o app aberto recebe um
// aviso para conferir o bloqueio e sair, mostrando o motivo e o tempo.

import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2";
import { authBanDuration } from "./blockDuration.ts";

export { parseBlockDuration } from "./blockDuration.ts";

/** Canal do app aberto da pessoa: só um "confira agora" (o app consulta o banco antes de sair). */
export const accountStatusTopic = (userId: string) => `account-status:${userId}`;

/**
 * Aplica (ou retira) o bloqueio no login: suspende a conta, encerra as sessões
 * e avisa o app aberto. Falhas aqui são registradas e não desfazem o bloqueio
 * no cadastro (o app também confere sozinho a cada 2 minutos).
 */
export const applyAuthBlock = async (
  supabase: SupabaseClient,
  userId: string,
  blocked: boolean,
  blockedUntil: string | null | undefined,
) => {
  const { error: banError } = await supabase.auth.admin.updateUserById(userId, {
    ban_duration: authBanDuration(blockedUntil, blocked),
  });
  if (banError) console.error("Could not update auth ban:", banError.message);

  if (!blocked) return;

  const { error: revokeError } = await supabase.rpc("admin_revoke_user_sessions", { p_user_id: userId });
  if (revokeError) console.error("Could not revoke sessions:", revokeError.message);

  try {
    const url = Deno.env.get("SUPABASE_URL");
    const key = Deno.env.get("SUPABASE_SERVICE_ROLE_KEY");
    if (url && key) {
      const res = await fetch(`${url}/realtime/v1/api/broadcast`, {
        method: "POST",
        headers: { apikey: key, Authorization: `Bearer ${key}`, "Content-Type": "application/json" },
        body: JSON.stringify({
          messages: [{ topic: accountStatusTopic(userId), event: "check", payload: {}, private: false }],
        }),
      });
      if (!res.ok) console.error("Could not notify open app:", res.status);
    }
  } catch (err) {
    console.error("Could not notify open app:", err);
  }
};

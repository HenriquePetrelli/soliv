import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminMfaOk } from "../_shared/adminMfa.ts";
import { errorMessage } from '../_shared/errors.ts';

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

const DURATIONS: Record<string, number | null> = {
  "24h": 24 * 60 * 60 * 1000,
  "48h": 48 * 60 * 60 * 1000,
  "1w": 7 * 24 * 60 * 60 * 1000,
  "2w": 14 * 24 * 60 * 60 * 1000,
  "1m": 30 * 24 * 60 * 60 * 1000,
  "1y": 365 * 24 * 60 * 60 * 1000,
  forever: null,
};

serve(async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Token de autorização ausente" }, 401);

    const token = authHeader.replace("Bearer ", "");
    const { data: { user }, error: authError } = await supabase.auth.getUser(token);
    if (authError || !user) return json({ error: "Token inválido" }, 401);

    const { data: isAdmin, error: adminError } = await supabase.rpc("is_super_admin", {
      user_id_param: user.id,
    });
    // Também exige a verificação em duas etapas (token aal2).
    if (adminError || isAdmin !== true || !adminMfaOk(authHeader)) {
      return json({ error: "Acesso negado. Apenas administradores." }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Corpo inválido" }, 400);

    const { psychologist_id, action, duration, reason } = body as Record<string, unknown>;
    if (!psychologist_id || typeof psychologist_id !== "string") {
      return json({ error: "psychologist_id é obrigatório" }, 400);
    }
    if (action !== "block" && action !== "unblock") {
      return json({ error: "Ação inválida" }, 400);
    }

    let updates: Record<string, unknown>;

    if (action === "block") {
      if (typeof duration !== "string" || !(duration in DURATIONS)) {
        return json({ error: "Período de bloqueio inválido" }, 400);
      }
      const trimmedReason = typeof reason === "string" ? reason.trim() : "";
      if (trimmedReason.length < 3) {
        return json({ error: "Informe o motivo do bloqueio" }, 400);
      }
      if (trimmedReason.length > 2000) {
        return json({ error: "Motivo muito longo" }, 400);
      }
      const ms = DURATIONS[duration];
      updates = {
        is_blocked: true,
        blocked_at: new Date().toISOString(),
        blocked_until: ms === null ? null : new Date(Date.now() + ms).toISOString(),
        blocked_reason: trimmedReason,
        updated_at: new Date().toISOString(),
      };
    } else {
      updates = {
        is_blocked: false,
        blocked_at: null,
        blocked_until: null,
        blocked_reason: null,
        updated_at: new Date().toISOString(),
      };
    }

    const { error: updateError } = await supabase
      .from("psychologists")
      .update(updates)
      .eq("id", psychologist_id);
    if (updateError) return json({ error: updateError.message }, 400);

    const { data: updated } = await supabase
      .from("psychologists")
      .select("*")
      .eq("id", psychologist_id)
      .single();

    // O bloqueio vale também para quem já está logado: a conta fica suspensa
    // no login do Supabase pelo mesmo período (sem renovar a sessão nem entrar
    // de novo). Antes só a tela de login conferia o bloqueio e quem estava com
    // o app aberto continuava usando.
    if (updated?.user_id) {
      const ban =
        action === "block"
          ? updates.blocked_until
            ? `${Math.max(1, Math.ceil((new Date(updates.blocked_until).getTime() - Date.now()) / 3_600_000))}h`
            : "876000h"
          : "none";
      const { error: banError } = await supabase.auth.admin.updateUserById(updated.user_id, { ban_duration: ban });
      if (banError) console.error("Could not update auth ban:", banError.message);
    }

    await supabase.from("admin_audit_log").insert({
      admin_id: user.id,
      action: action === "block" ? "block_psychologist" : "unblock_psychologist",
      target_type: "psychologist",
      target_id: updated?.user_id ?? null,
      target_name: updated?.full_name ?? null,
      details: action === "block" ? { duration, reason } : {},
    });

    return json({
      success: true,
      data: updated,
      message: action === "block" ? "Psicólogo bloqueado com sucesso" : "Psicólogo desbloqueado com sucesso",
    });
  } catch (error: unknown) {
    console.error("admin-block-psychologist error:", error);
    return json({ error: errorMessage(error) || "Erro interno do servidor" }, 500);
  }
});

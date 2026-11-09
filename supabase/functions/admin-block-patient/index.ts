import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminMfaSatisfied } from "../_shared/adminMfa.ts";
import { errorMessage } from '../_shared/errors.ts';
import { applyAuthBlock, parseBlockDuration } from "../_shared/accountBlock.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const supabase = createClient(
  Deno.env.get("SUPABASE_URL")!,
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY")!,
  { auth: { autoRefreshToken: false, persistSession: false } }
);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), {
    status,
    headers: { "Content-Type": "application/json", ...corsHeaders },
  });

Deno.serve(async (req: Request): Promise<Response> => {
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
    if (adminError || isAdmin !== true || !(await adminMfaSatisfied(authHeader))) {
      return json({ error: "Acesso negado. Apenas administradores." }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Corpo inválido" }, 400);

    const { patient_id, action, reason } = body as Record<string, unknown>;
    if (!patient_id || typeof patient_id !== "string") {
      return json({ error: "patient_id é obrigatório" }, 400);
    }
    if (action !== "block" && action !== "unblock") {
      return json({ error: "Ação inválida" }, 400);
    }

    let updates: Record<string, unknown>;
    let blockLabel = "";

    if (action === "block") {
      const parsed = parseBlockDuration(body as Record<string, unknown>);
      if (!parsed.ok) return json({ error: parsed.error }, 400);
      blockLabel = parsed.label;
      const trimmedReason = typeof reason === "string" ? reason.trim() : "";
      if (trimmedReason.length < 3) return json({ error: "Informe o motivo do bloqueio" }, 400);
      if (trimmedReason.length > 2000) return json({ error: "Motivo muito longo" }, 400);

      updates = {
        is_blocked: true,
        blocked_at: new Date().toISOString(),
        blocked_until: parsed.until ? parsed.until.toISOString() : null,
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
      .from("patients")
      .update(updates)
      .eq("id", patient_id);
    if (updateError) return json({ error: updateError.message }, 400);

    const { data: updated } = await supabase
      .from("patients")
      .select("*")
      .eq("id", patient_id)
      .maybeSingle();

    // O bloqueio vale também para quem já está logado: o login do Supabase
    // fica suspenso pelo mesmo período, as sessões abertas são encerradas e o
    // app aberto é avisado para conferir e sair (mostrando motivo e tempo).
    if (updated?.user_id) {
      await applyAuthBlock(
        supabase,
        updated.user_id,
        action === "block",
        (updates.blocked_until as string | null | undefined) ?? null,
      );
    }

    await supabase.from("admin_audit_log").insert({
      admin_id: user.id,
      action: action === "block" ? "block_patient" : "unblock_patient",
      target_type: "patient",
      target_id: updated?.user_id ?? null,
      target_name: updated?.full_name ?? null,
      details: action === "block" ? { duration: blockLabel, blocked_until: updates.blocked_until ?? null, reason } : {},
    });

    return json({
      success: true,
      data: updated,
      message: action === "block" ? "Paciente bloqueado com sucesso" : "Paciente desbloqueado com sucesso",
    });
  } catch (error: unknown) {
    console.error("admin-block-patient error:", error);
    return json({ error: errorMessage(error) || "Erro interno do servidor" }, 500);
  }
});

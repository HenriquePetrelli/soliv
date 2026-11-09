import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminMfaSatisfied } from "../_shared/adminMfa.ts";
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
    if (adminError || isAdmin !== true || !(await adminMfaSatisfied(authHeader))) {
      return json({ error: "Acesso negado. Apenas administradores." }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Corpo inválido" }, 400);

    const { psychologist_id, password, ...fields } = body as Record<string, unknown>;
    if (!psychologist_id || typeof psychologist_id !== "string") {
      return json({ error: "psychologist_id é obrigatório" }, 400);
    }

    const { data: current, error: fetchError } = await supabase
      .from("psychologists")
      .select("id, user_id, email, crp_number, cpf")
      .eq("id", psychologist_id)
      .single();

    if (fetchError || !current) return json({ error: "Psicólogo não encontrado" }, 404);

    // Whitelist + basic validation
    const allowed = [
      "full_name",
      "email",
      "cpf",
      "crp_number",
      "specialization",
      "bio",
      "state",
      "city",
      "address",
      "document_url",
      "pix_key",
      "pix_type",
    ];

    const updates: Record<string, string | null> = {};
    for (const key of allowed) {
      if (key in fields) {
        const value = fields[key];
        if (typeof value === "string") {
          const trimmed = value.trim();
          if (trimmed.length > 2000) return json({ error: `Campo ${key} muito longo` }, 400);
          updates[key] = trimmed === "" ? null : trimmed;
        } else if (value === null) {
          updates[key] = null;
        }
      }
    }

    if (updates.full_name === null || updates.full_name === undefined) {
      if ("full_name" in fields) return json({ error: "Nome completo é obrigatório" }, 400);
    }
    if ("email" in fields) {
      if (!updates.email || !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(updates.email)) {
        return json({ error: "Email inválido" }, 400);
      }
    }
    if ("crp_number" in fields && !updates.crp_number) {
      return json({ error: "CRP é obrigatório" }, 400);
    }

    // Uniqueness checks
    if (updates.crp_number && updates.crp_number !== current.crp_number) {
      const { data: dup } = await supabase
        .from("psychologists")
        .select("id")
        .eq("crp_number", updates.crp_number)
        .neq("id", psychologist_id)
        .maybeSingle();
      if (dup) return json({ error: "CRP já cadastrado por outro psicólogo" }, 400);
    }
    if (updates.email && updates.email !== current.email) {
      const { data: dup } = await supabase
        .from("psychologists")
        .select("id")
        .eq("email", updates.email)
        .neq("id", psychologist_id)
        .maybeSingle();
      if (dup) return json({ error: "Email já cadastrado por outro psicólogo" }, 400);
    }
    if (updates.cpf && updates.cpf !== current.cpf) {
      const { data: dup } = await supabase
        .from("psychologists")
        .select("id")
        .eq("cpf", updates.cpf)
        .neq("id", psychologist_id)
        .maybeSingle();
      if (dup) return json({ error: "CPF já cadastrado por outro psicólogo" }, 400);
    }

    if (Object.keys(updates).length > 0) {
      updates.updated_at = new Date().toISOString();
      const { error: updateError } = await supabase
        .from("psychologists")
        .update(updates)
        .eq("id", psychologist_id);
      if (updateError) return json({ error: updateError.message }, 400);
    }

    // Keep profiles in sync
    if (current.user_id) {
      const profileUpdates: Record<string, string | null> = {};
      if ("full_name" in updates) profileUpdates.full_name = updates.full_name;
      if ("cpf" in updates) profileUpdates.cpf = updates.cpf;
      if ("crp_number" in updates) profileUpdates.crp = updates.crp_number;
      if ("specialization" in updates) profileUpdates.specialty = updates.specialization;

      if (Object.keys(profileUpdates).length > 0) {
        profileUpdates.updated_at = new Date().toISOString();
        await supabase.from("profiles").update(profileUpdates).eq("user_id", current.user_id);
      }

      // Auth account updates (email / password)
      const authUpdates: { email?: string; password?: string } = {};
      if (updates.email && updates.email !== current.email) authUpdates.email = updates.email;
      if (typeof password === "string" && password.length > 0) {
        if (password.length < 6) return json({ error: "A senha deve ter ao menos 6 caracteres" }, 400);
        authUpdates.password = password;
      }
      if (Object.keys(authUpdates).length > 0) {
        const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
          current.user_id,
          authUpdates
        );
        if (authUpdateError) {
          return json(
            { error: `Dados salvos, mas falha ao atualizar credenciais: ${authUpdateError.message}` },
            400
          );
        }
      }
    }

    const { data: updated } = await supabase
      .from("psychologists")
      .select("*")
      .eq("id", psychologist_id)
      .single();

    await supabase.from("admin_audit_log").insert({
      admin_id: user.id,
      action: "update_psychologist",
      target_type: "psychologist",
      target_id: current.user_id ?? null,
      target_name: updated?.full_name ?? null,
      details: { fields_changed: Object.keys(updates), password_changed: typeof password === "string" && password.length > 0 },
    });

    return json({ success: true, data: updated, message: "Informações atualizadas com sucesso" });
  } catch (error: unknown) {
    console.error("admin-update-psychologist error:", error);
    return json({ error: errorMessage(error) || "Erro interno do servidor" }, 500);
  }
});

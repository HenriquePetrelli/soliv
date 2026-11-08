import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminMfaOk } from "../_shared/adminMfa.ts";
import { errorMessage } from '../_shared/errors.ts';

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

const str = (v: unknown) => (typeof v === "string" ? v.trim() : "");

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
    if (adminError || isAdmin !== true || !adminMfaOk(authHeader)) {
      return json({ error: "Acesso negado. Apenas administradores." }, 403);
    }

    const body = await req.json().catch(() => null);
    if (!body || typeof body !== "object") return json({ error: "Corpo inválido" }, 400);

    const { patient_id, full_name, email, cpf, phone, state, city, password } = body as Record<string, unknown>;
    if (!patient_id || typeof patient_id !== "string") {
      return json({ error: "patient_id é obrigatório" }, 400);
    }

    const name = str(full_name);
    const mail = str(email);
    if (name.length < 2) return json({ error: "Nome inválido" }, 400);
    if (!/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(mail)) return json({ error: "E-mail inválido" }, 400);
    if (password && String(password).length < 6) {
      return json({ error: "A senha deve ter ao menos 6 caracteres" }, 400);
    }

    const { data: patient, error: fetchError } = await supabase
      .from("patients")
      .select("id, user_id, email")
      .eq("id", patient_id)
      .maybeSingle();
    if (fetchError) return json({ error: fetchError.message }, 400);
    if (!patient) return json({ error: "Paciente não encontrado" }, 404);

    const { error: updateError } = await supabase
      .from("patients")
      .update({
        full_name: name,
        email: mail,
        cpf: str(cpf),
        phone: str(phone) || null,
        state: str(state),
        city: str(city),
        updated_at: new Date().toISOString(),
      })
      .eq("id", patient.id);
    if (updateError) return json({ error: updateError.message }, 400);

    if (patient.user_id) {
      await supabase
        .from("profiles")
        .update({ full_name: name, cpf: str(cpf) || null, updated_at: new Date().toISOString() })
        .eq("user_id", patient.user_id);

      const authUpdates: { email?: string; password?: string } = {};
      if (mail && mail !== patient.email) authUpdates.email = mail;
      if (password) authUpdates.password = String(password);
      if (Object.keys(authUpdates).length > 0) {
        const { error: authUpdateError } = await supabase.auth.admin.updateUserById(
          patient.user_id,
          authUpdates
        );
        if (authUpdateError) {
          return json({
            success: true,
            warning: `Dados atualizados, mas a conta de acesso não pôde ser alterada: ${authUpdateError.message}`,
          });
        }
      }
    }

    const { data: updated } = await supabase
      .from("patients")
      .select("*")
      .eq("id", patient.id)
      .maybeSingle();

    await supabase.from("admin_audit_log").insert({
      admin_id: user.id,
      action: "update_patient",
      target_type: "patient",
      target_id: patient.user_id ?? null,
      target_name: name,
      details: { password_changed: !!password, email_changed: mail !== patient.email },
    });

    return json({ success: true, data: updated, message: "Paciente atualizado com sucesso" });
  } catch (error: unknown) {
    console.error("admin-update-patient error:", error);
    return json({ error: errorMessage(error) || "Erro interno do servidor" }, 500);
  }
});

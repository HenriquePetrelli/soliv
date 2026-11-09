import { createClient } from "https://esm.sh/@supabase/supabase-js@2";
import { adminMfaSatisfied } from "../_shared/adminMfa.ts";
import { errorMessage } from '../_shared/errors.ts';
import { monitored } from "../_shared/monitoring.ts";

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

const removeBucketFolder = async (bucket: string, folder: string) => {
  const { data: files } = await supabase.storage.from(bucket).list(folder);
  if (files && files.length > 0) {
    await supabase.storage.from(bucket).remove(files.map((f) => `${folder}/${f.name}`));
  }
};

Deno.serve(monitored("admin-delete-psychologist", async (req: Request): Promise<Response> => {
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
    const psychologistId = body?.psychologist_id;
    if (!psychologistId || typeof psychologistId !== "string") {
      return json({ error: "psychologist_id é obrigatório" }, 400);
    }

    const { data: psych, error: fetchError } = await supabase
      .from("psychologists")
      .select("id, user_id, full_name")
      .eq("id", psychologistId)
      .maybeSingle();

    if (fetchError) return json({ error: fetchError.message }, 400);
    if (!psych) return json({ error: "Psicólogo não encontrado" }, 404);

    const userId: string | null = psych.user_id;

    // 1. Repasses: arquivados por 5 anos (registro fiscal) antes de apagar.
    //    Sem o arquivo, nada é apagado. Os comprovantes ficam no bucket
    //    payment-receipts, na pasta com o id antigo do psicólogo.
    const { error: archiveError } = await supabase.rpc("archive_psychologist_payouts", {
      p_psychologist_id: psych.id,
    });
    if (archiveError) {
      console.error("Erro ao arquivar repasses:", archiveError);
      return json({ error: "Não foi possível arquivar os repasses. Nada foi excluído." }, 500);
    }

    // 2. Consultas: as futuras são canceladas (paciente avisado, consulta do
    //    mês devolvida) e todas guardam o nome do psicólogo. Elas ficam no
    //    histórico do paciente; antes eram apagadas junto com o psicólogo.
    if (userId) {
      const { error: detachError } = await supabase.rpc("detach_psychologist_from_appointments", {
        p_user_id: userId,
      });
      if (detachError) {
        console.error("Erro ao separar as consultas:", detachError);
        return json({ error: "Não foi possível preservar as consultas dos pacientes. Nada foi excluído." }, 500);
      }
    }

    // 3. Dependências ligadas ao registro do psicólogo
    await supabase.from("payment_logs").delete().eq("psychologist_id", psych.id);
    await supabase.from("psychologist_payments").delete().eq("psychologist_id", psych.id);

    if (userId) {
      // 4. Dependências ligadas ao user_id
      await supabase.from("psychologist_presence").delete().eq("psychologist_id", userId);
      await supabase.from("psychologist_availability").delete().eq("psychologist_id", userId);
      await supabase.from("psychologist_availability_overrides").delete().eq("psychologist_id", userId);
      await supabase.from("psychologist_vacations").delete().eq("psychologist_id", userId);
      await supabase.from("webrtc_sessions").delete().eq("psychologist_id", userId);
      await supabase.from("mensagens").delete().eq("autor_id", userId);
      await supabase.from("conversas").delete().eq("psicologo_id", userId);
      await supabase.from("emergency_requests").update({ accepted_by: null }).eq("accepted_by", userId);
      await supabase.from("suporte_psicologo").delete().eq("psicologo_id", userId);
      await supabase.from("fcm_tokens").delete().eq("user_id", userId);
      await supabase.from("user_preferences").delete().eq("user_id", userId);
      await supabase.from("session_feedback").delete().eq("user_id", userId);
      await supabase.from("psychologist_registrations").delete().eq("user_id", userId);

      // 5. Arquivos
      await removeBucketFolder("documents", userId);
      await removeBucketFolder("psychologist-documents", userId);
    }

    // 6. Registro principal
    const { error: deleteError } = await supabase
      .from("psychologists")
      .delete()
      .eq("id", psych.id);
    if (deleteError) return json({ error: deleteError.message }, 400);

    await supabase.from("admin_audit_log").insert({
      admin_id: user.id,
      action: "delete_psychologist",
      target_type: "psychologist",
      target_id: userId,
      target_name: psych.full_name ?? null,
      details: {},
    });

    if (userId) {
      await supabase.from("profiles").delete().eq("user_id", userId);
      const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
      if (authDeleteError) {
        console.error("Erro ao remover usuário do auth:", authDeleteError);
        return json({
          success: true,
          warning: "Registros removidos, mas a conta de autenticação não pôde ser excluída.",
          message: "Psicólogo excluído parcialmente",
        });
      }
    }

    return json({ success: true, message: "Psicólogo excluído permanentemente" });
  } catch (error: unknown) {
    console.error("admin-delete-psychologist error:", error);
    return json({ error: errorMessage(error) || "Erro interno do servidor" }, 500);
  }
}));

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { findCustomerId, liveSubscriptions, newStripe } from "../_shared/stripe.ts";
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
    const patientId = body?.patient_id;
    if (!patientId || typeof patientId !== "string") {
      return json({ error: "patient_id é obrigatório" }, 400);
    }

    const { data: patient, error: fetchError } = await supabase
      .from("patients")
      .select("id, user_id, full_name")
      .eq("id", patientId)
      .maybeSingle();

    if (fetchError) return json({ error: fetchError.message }, 400);
    if (!patient) return json({ error: "Paciente não encontrado" }, 404);

    const userId: string | null = patient.user_id;

    if (userId && Deno.env.get("STRIPE_SECRET_KEY")) {
      // Antes de apagar: a assinatura do Stripe continuaria cobrando uma
      // conta que não existe mais.
      try {
        const { data: authUser } = await supabase.auth.admin.getUserById(userId);
        const stripe = newStripe();
        const customerId = await findCustomerId(stripe, supabase, { id: userId, email: authUser?.user?.email ?? null });
        if (customerId) {
          for (const sub of await liveSubscriptions(stripe, customerId)) await stripe.subscriptions.cancel(sub.id);
        }
      } catch (stripeError) {
        console.error("admin-delete-patient: falha ao cancelar assinatura", stripeError);
        return json({ error: "Não foi possível cancelar a assinatura do paciente no Stripe; nada foi excluído. Tente de novo." }, 502);
      }
    }

    if (userId) {
      await supabase.from("notifications").delete().eq("patient_id", userId);
      await supabase.from("patient_weekly_goals").delete().eq("user_id", userId);
      await supabase.from("patient_achievements").delete().eq("user_id", userId);
      await supabase.from("patient_progress").delete().eq("patient_id", userId);
      await supabase.from("patient_statistics").delete().eq("patient_id", userId);
      await supabase.from("private_journals").delete().eq("user_id", userId);
      await supabase.from("group_favorites").delete().eq("user_id", userId);
      await supabase.from("group_testimonial_likes").delete().eq("user_id", userId);
      await supabase.from("group_testimonials").delete().eq("user_id", userId);
      await supabase.from("session_feedback").delete().eq("user_id", userId);
      await supabase.from("webrtc_sessions").delete().eq("patient_id", userId);
      await supabase.from("emergency_requests").delete().eq("patient_id", userId);
      await supabase.from("mensagens").delete().eq("autor_id", userId);
      await supabase.from("conversas").delete().eq("paciente_id", userId);
      await supabase.from("appointments").delete().eq("patient_id", userId);
      await supabase.from("fcm_tokens").delete().eq("user_id", userId);
      await supabase.from("user_preferences").delete().eq("user_id", userId);
      await supabase.from("habit_events").delete().eq("user_id", userId);
      await supabase.from("user_habits").delete().eq("user_id", userId);
      await supabase.from("mental_health_screenings").delete().eq("user_id", userId);
      await supabase.from("subscribers").delete().eq("user_id", userId);
      await supabase.from("support_tickets").delete().eq("user_id", userId);
    }

    const { error: deleteError } = await supabase.from("patients").delete().eq("id", patient.id);
    if (deleteError) return json({ error: deleteError.message }, 400);

    await supabase.from("admin_audit_log").insert({
      admin_id: user.id,
      action: "delete_patient",
      target_type: "patient",
      target_id: userId,
      target_name: patient.full_name ?? null,
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
          message: "Paciente excluído parcialmente",
        });
      }
    }

    return json({ success: true, message: "Paciente excluído permanentemente" });
  } catch (error: unknown) {
    console.error("admin-delete-patient error:", error);
    return json({ error: errorMessage(error) || "Erro interno do servidor" }, 500);
  }
});

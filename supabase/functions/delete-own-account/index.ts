import { createClient, type SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { findCustomerId, liveSubscriptions, newStripe } from "../_shared/stripe.ts";
import { monitored } from "../_shared/monitoring.ts";

// Account deletion requested by the patient themself — the data subject's
// right under LGPD (art. 18, VI) and a requirement of both app stores.
// Mirrors admin-delete-patient, plus: cancels any active Stripe subscription
// FIRST (deleting the account while Stripe keeps charging would be worse
// than not deleting it), and removes the tables added since.
//
// Care records (SOS requests, consultations, feedback and clinical notes) must
// be kept for 5 years (Resolução CFP 01/2009). Before anything is deleted,
// archive_patient_care_records copies them to care_record_archive, detached
// from the login; purge_expired_care_records drops them once they expire. If
// the copy fails, nothing is deleted.
//
// Psychologists can't self-delete here: their account carries payouts and
// clinical records with legal retention duties, so it goes through support.

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

const CONFIRMATION_WORD = "EXCLUIR";

// O cliente do Stripe é achado pelo ID gravado para o user_id (não só pelo
// e-mail): quem trocou o e-mail da conta continuaria sendo cobrado depois de
// excluí-la.
const cancelStripeSubscriptions = async (supabase: SupabaseClient, user: { id: string; email?: string | null }): Promise<void> => {
  if (!Deno.env.get("STRIPE_SECRET_KEY")) return;
  const stripe = newStripe();
  const customerId = await findCustomerId(stripe, supabase, user);
  if (!customerId) return;
  for (const sub of await liveSubscriptions(stripe, customerId)) {
    await stripe.subscriptions.cancel(sub.id);
  }
};

Deno.serve(monitored("delete-own-account", async (req: Request): Promise<Response> => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Token de autorização ausente" }, 401);

    const { data: { user }, error: authError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    if (authError || !user) return json({ error: "Token inválido" }, 401);

    const body = await req.json().catch(() => null);
    if (body?.confirmation !== CONFIRMATION_WORD) {
      return json({ error: `Digite ${CONFIRMATION_WORD} para confirmar a exclusão.` }, 400);
    }

    const { data: profile } = await supabase
      .from("profiles")
      .select("user_type")
      .eq("user_id", user.id)
      .maybeSingle();

    if (profile?.user_type !== "patient") {
      return json({
        error: "A exclusão de contas de psicólogo e de administrador é feita pelo suporte, por envolver repasses e registros com prazo legal de guarda.",
      }, 403);
    }

    const { data: liveSos } = await supabase
      .from("emergency_requests")
      .select("id")
      .eq("patient_id", user.id)
      .in("status", ["pending", "accepted", "in_progress"])
      .limit(1);
    if (liveSos && liveSos.length > 0) {
      return json({ error: "Você tem um atendimento de emergência em andamento. Encerre-o antes de excluir a conta." }, 409);
    }

    const { error: archiveError } = await supabase.rpc("archive_patient_care_records", {
      p_patient_id: user.id,
    });
    if (archiveError) {
      console.error("delete-own-account: falha ao arquivar registros de atendimento", archiveError);
      return json({ error: "Não foi possível excluir a conta agora. Tente de novo em instantes." }, 500);
    }

    try {
      await cancelStripeSubscriptions(supabase, user);
    } catch (stripeError) {
      console.error("delete-own-account: falha ao cancelar assinatura", stripeError);
      return json({
        error: "Não foi possível cancelar sua assinatura agora, então a conta não foi excluída. Tente de novo em instantes.",
      }, 502);
    }

    const userId = user.id;
    const deletions: [string, string][] = [
      ["notifications", "patient_id"],
      // Sem ligação automática com o login: ficavam no banco depois da exclusão.
      ["notification_logs", "user_id"],
      ["participant_presence", "user_id"],
      ["appointment_problem_reports", "reported_by"],
      ["patient_weekly_goals", "user_id"],
      ["patient_achievements", "user_id"],
      ["patient_progress", "patient_id"],
      ["patient_statistics", "patient_id"],
      ["patient_mood_logs", "patient_id"],
      ["private_journals", "user_id"],
      ["group_favorites", "user_id"],
      ["group_testimonial_likes", "user_id"],
      ["group_testimonial_reports", "reporter_id"],
      ["group_testimonials", "user_id"],
      ["session_feedback", "user_id"],
      ["habit_events", "user_id"],
      ["mental_health_screenings", "user_id"],
      ["user_habits", "user_id"],
      ["safety_plan_suggestions", "patient_id"],
      ["safety_plans", "patient_id"],
      ["emergency_contacts", "patient_id"],
      ["webrtc_sessions", "patient_id"],
      ["emergency_requests", "patient_id"],
      ["mensagens", "autor_id"],
      ["conversas", "paciente_id"],
      ["appointments", "patient_id"],
      ["fcm_tokens", "user_id"],
      ["user_preferences", "user_id"],
      ["subscribers", "user_id"],
      ["support_tickets", "user_id"],
      ["patients", "user_id"],
      ["profiles", "user_id"],
    ];

    for (const [table, column] of deletions) {
      const { error } = await supabase.from(table).delete().eq(column, userId);
      // A table that doesn't exist in this environment is not a reason to
      // leave the rest of the person's data behind.
      if (error && error.code !== "42P01") {
        console.error(`delete-own-account: erro ao limpar ${table}`, error);
      }
    }

    await supabase.storage.from("documents").list(userId).then(async ({ data: files }) => {
      if (files && files.length > 0) {
        await supabase.storage.from("documents").remove(files.map((f) => `${userId}/${f.name}`));
      }
    }).catch((e) => console.error("delete-own-account: erro ao limpar arquivos", e));

    await supabase.from("security_audit_log").insert({
      user_id: null,
      action: "account_self_deleted",
      table_name: "auth.users",
      record_id: userId,
      new_values: { deleted_at: new Date().toISOString() },
    });

    const { error: authDeleteError } = await supabase.auth.admin.deleteUser(userId);
    if (authDeleteError) {
      console.error("delete-own-account: erro ao remover do auth", authDeleteError);
      return json({
        error: "Seus dados foram apagados, mas não conseguimos remover o login. Fale com o suporte para concluir.",
      }, 500);
    }

    return json({ success: true });
  } catch (error: unknown) {
    console.error("delete-own-account error:", error);
    return json({ error: "Não foi possível excluir a conta agora. Tente de novo em instantes." }, 500);
  }
}));

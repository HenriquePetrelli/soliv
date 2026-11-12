import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { monitored } from "../_shared/monitoring.ts";

// This endpoint is authenticated via a Bearer token (checked below), not
// cookies, so there's no reason to restrict/reflect Origin the way a
// credentialed (cookie-based) request would require — every other edge
// function in this project just uses '*'. The previous hardcoded allowlist
// only matched a handful of old Lovable preview URLs; any other domain
// (including the real production one) got a mismatched
// Access-Control-Allow-Origin back and had the response silently blocked
// by the browser, so this call could fail with no visible error and the
// patient's monthly SOS quota would never actually get marked as used.
const getCorsHeaders = (_origin: string | null) => {
  return {
    'Access-Control-Allow-Origin': '*',
    'Access-Control-Allow-Headers': 'authorization, x-client-info, apikey, content-type',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
  };
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[MARK-SOS-USED] ${step}${detailsStr}`);
};

// sos_last_used is a plain `date` column (no time-of-day) — it must hold
// the Brazil calendar date, not Deno's UTC one, otherwise a use late on
// the last day of the month gets stored as the 1st of the next month.
// Conversely, a stored date-only value must be compared by its own Y/M
// digits, never re-parsed as a UTC instant and converted again — that
// would (wrongly) roll every "1st of the month" value back to the last
// day of the previous month.
const brazilDateString = (date: Date): string => {
  const brazil = new Date(date.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  const y = brazil.getFullYear();
  const m = String(brazil.getMonth() + 1).padStart(2, '0');
  const d = String(brazil.getDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
};
const isSameBrazilMonthAsDateOnly = (storedDateOnly: string, instant: Date): boolean => {
  const [storedYear, storedMonth] = storedDateOnly.split('-').map(Number);
  const brazilInstant = new Date(instant.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return storedYear === brazilInstant.getFullYear() && storedMonth === brazilInstant.getMonth() + 1;
};

serve(monitored("mark-sos-used", async (req) => {
  const origin = req.headers.get('origin');
  const corsHeaders = getCorsHeaders(origin);
  
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseService = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } }
  );

  try {
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) {
      return new Response(JSON.stringify({ error: "Unauthorized" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 401,
      });
    }

    let body: { request_id?: string } = {};
    try {
      const raw = await req.text();
      body = raw ? JSON.parse(raw) : {};
    } catch (_e) {
      body = {};
    }
    const requestId: string | undefined = body?.request_id;
    if (!requestId) {
      return new Response(JSON.stringify({ error: "Missing request_id" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 400,
      });
    }

    logStep("Marking SOS used for request", { requestId });

    // Fetch emergency request to identify the patient
    const { data: emergency, error: emergencyError } = await supabaseService
      .from('emergency_requests')
      .select('id, patient_id, started_at, extra_credit_id')
      .eq('id', requestId)
      .maybeSingle();

    if (emergencyError || !emergency?.patient_id) {
      logStep("Emergency request not found", { error: emergencyError?.message });
      return new Response(JSON.stringify({ error: 'Emergency request not found' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 404,
      });
    }

    const patientId = emergency.patient_id as string;

    // Only the owner of the emergency request may consume their own SOS quota.
    const { data: authData } = await supabaseService.auth.getUser(
      authHeader.replace("Bearer ", "")
    );
    if (!authData?.user || authData.user.id !== patientId) {
      logStep("Caller is not the request owner", { requestId });
      return new Response(JSON.stringify({ error: "Forbidden" }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 403,
      });
    }


    // SOS pago com crédito avulso (gatilho mark_sos_used_on_start): a cota
    // do plano não é tocada.
    if (emergency.extra_credit_id) {
      logStep("SOS paid with an extra credit, plan quota untouched", { requestId });
      return new Response(JSON.stringify({ ok: true, skipped: true, extra: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Fetch subscriber row for the patient
    const { data: subscriber } = await supabaseService
      .from('subscribers')
      .select('id, user_id, email, subscribed, subscription_tier, sos_used_this_month, sos_last_used')
      .eq('user_id', patientId)
      .maybeSingle();

    if (!subscriber || !subscriber.subscribed) {
      logStep("Subscriber not found or not active", { patientId });
      return new Response(JSON.stringify({ ok: false, reason: 'No active subscription' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // Essencial, Flex e Completo têm 1 SOS por mês (tela de planos, Termos,
    // can_use_sos). No Flex o SOS gasta o atendimento do mês (SOS ou consulta).
    const tier = (subscriber.subscription_tier || '').toLowerCase();
    if (!['essencial', 'flex', 'completo'].includes(tier)) {
      logStep("Plan without SOS quota, no usage recorded", { patientId, tier: subscriber.subscription_tier });
      return new Response(JSON.stringify({ ok: true, skipped: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    const today = new Date();
    const sameMonth = subscriber.sos_last_used
      ? isSameBrazilMonthAsDateOnly(subscriber.sos_last_used, today)
      : false;

    // If already used this month, nothing to do (idempotent)
    if (subscriber.sos_used_this_month && sameMonth) {
      logStep("SOS already used this month, skipping", { patientId });
      return new Response(JSON.stringify({ ok: true, already_used: true }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    // If month changed, reset first (optional)
    const updatePayload = {
      sos_used_this_month: true,
      sos_last_used: brazilDateString(today), // store as Brazil calendar date
      updated_at: new Date().toISOString(),
    };

    const { error: updateError } = await supabaseService
      .from('subscribers')
      .update(updatePayload)
      .eq('user_id', patientId);

    if (updateError) {
      logStep("Failed to update subscriber", { error: updateError.message });
      return new Response(JSON.stringify({ error: 'Failed to update subscriber' }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 500,
      });
    }

    logStep("SOS usage marked for patient", { patientId });
    return new Response(JSON.stringify({ ok: true }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    logStep("ERROR in mark-sos-used", { message });
    return new Response(JSON.stringify({ error: message }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
}));

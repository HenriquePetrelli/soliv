import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { EXTRA_PRICES, PLAN_LIMITS, parseTier, stripeState, tierRank, type StripeState, type Tier } from "../_shared/billing.ts";
import { PLAN_PRICES, findCustomerId, listSubscriptions, newStripe, syncCustomerEmail } from "../_shared/stripe.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: any) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CHECK-SUBSCRIPTION] ${step}${detailsStr}`);
};

// Monthly quotas (SOS, appointments) reset by calendar month — but this
// function runs on Deno's UTC clock, not Brazil's. Comparing getUTCFullYear/
// getUTCMonth means the "month" flips ~3h early (21h-24h BRT), so a use late
// on the last day of the month could get attributed to the next month and
// wrongly block a legitimate use early in that next month. Compare the
// month as lived in America/Sao_Paulo instead.
const brazilYearMonth = (date: Date) => {
  const brazil = new Date(date.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return { year: brazil.getFullYear(), month: brazil.getMonth() };
};
const isSameBrazilMonth = (a: Date, b: Date) => {
  const ym1 = brazilYearMonth(a);
  const ym2 = brazilYearMonth(b);
  return ym1.year === ym2.year && ym1.month === ym2.month;
};

// sos_last_used is a plain `date` column (no time-of-day), unlike
// appointments_last_used (timestamptz). A date-only value like
// "2026-02-01" must be compared by its own Y/M digits — re-parsing it as
// `new Date("2026-02-01")` treats it as UTC midnight, and converting THAT
// to Brazil time rolls it back to Jan 31 21:00, wrongly classifying every
// "1st of the month" value as the previous month.
const isSameBrazilMonthAsDateOnly = (storedDateOnly: string, instant: Date): boolean => {
  const [storedYear, storedMonth] = storedDateOnly.split('-').map(Number);
  const brazilInstant = new Date(instant.toLocaleString('en-US', { timeZone: 'America/Sao_Paulo' }));
  return storedYear === brazilInstant.getFullYear() && storedMonth === brazilInstant.getMonth() + 1;
};

serve(async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");


    // Use the service role key to perform writes (upsert) in Supabase
    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    logStep("Authenticating user with token");
    
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    // Estado no Stripe: vem do cache (stripe_customer_state), que o webhook
    // mantém em dia. Só consulta o Stripe quando o cache não existe, passou
    // de 6 h ou o app pede (`force`, ex.: volta do checkout). Antes o Stripe
    // era consultado toda vez que o app abria: num pico de acesso, o limite de
    // requisições do Stripe derrubava a checagem de todo mundo.
    const body = await req.json().catch(() => ({}));
    const force = body?.force === true;
    const CACHE_MS = 6 * 60 * 60 * 1000;
    const { data: cached } = await supabaseClient
      .from("stripe_customer_state")
      .select("stripe_customer_id, state, synced_at")
      .eq("user_id", user.id)
      .maybeSingle();
    let customerId: string | null;
    let stripeSub: StripeState;
    if (!force && cached && Date.now() - new Date(cached.synced_at).getTime() < CACHE_MS) {
      customerId = cached.stripe_customer_id;
      stripeSub = cached.state as StripeState;
      logStep("Stripe state from cache", { syncedAt: cached.synced_at });
    } else {
      const stripe = newStripe();
      customerId = await findCustomerId(stripe, supabaseClient, user);
      logStep(customerId ? "Found Stripe customer" : "No Stripe customer", { customerId });
      // Todas as assinaturas: em dia, em teste ou com pagamento atrasado (que
      // mantém o acesso enquanto o Stripe tenta cobrar de novo).
      stripeSub = customerId
        ? stripeState(PLAN_PRICES, await listSubscriptions(stripe, customerId), Math.floor(Date.now() / 1000))
        : stripeState(PLAN_PRICES, [], 0);
      if (customerId) {
        // Quem trocou o e-mail da conta passa a receber recibos no e-mail novo.
        await syncCustomerEmail(stripe, customerId, user).catch((e) => logStep("Could not sync customer email", { message: String(e) }));
      }
      const { error: cacheError } = await supabaseClient.from("stripe_customer_state").upsert({
        user_id: user.id,
        stripe_customer_id: customerId,
        state: stripeSub,
        synced_at: new Date().toISOString(),
      });
      if (cacheError) logStep("Could not cache Stripe state", { message: cacheError.message });
    }
    const stripeTier = stripeSub.tier;
    const stripeEnd = stripeSub.periodEnd;
    if (stripeSub.extraSubscriptions > 0) logStep("More than one live subscription (double charge)", { customerId, extra: stripeSub.extraSubscriptions });
    logStep("Stripe state", stripeSub);

    // B2B: plano oferecido pela empresa (organization_members). Vale o maior
    // entre o do Stripe e o da empresa — o mesmo que o trigger
    // apply_organization_entitlement grava em `subscribers`.
    const { data: orgRows } = await supabaseClient.rpc("organization_entitlement", { p_user_id: user.id });
    const org = (orgRows ?? [])[0] as { tier: string; organization_name: string; ends_on: string | null } | undefined;
    const orgTier = parseTier(org?.tier);
    const fromOrganization = Boolean(org && orgTier && tierRank(orgTier) > tierRank(stripeTier));

    const subscriptionTier: Tier | null = fromOrganization ? orgTier : stripeTier;
    const hasActiveSub = subscriptionTier !== null;
    const subscriptionEnd = fromOrganization ? (org!.ends_on ? new Date(`${org!.ends_on}T23:59:59-03:00`).toISOString() : null) : stripeEnd;
    const planLimits = PLAN_LIMITS[subscriptionTier ?? "none"];
    logStep("Determined subscription tier", { subscriptionTier, source: fromOrganization ? "organization" : "stripe" });

    // Get current usage and SOS flags from database
    // A linha é da pessoa (user_id), não do e-mail: quem troca o e-mail da
    // conta continua com a mesma linha e os mesmos contadores do mês (antes
    // ganhava uma linha nova, zerada, e o SOS do mês "voltava").
    const subscriberColumns = "id, email, current_usage, sos_used_this_month, sos_last_used, appointments_used_this_month, appointments_last_used, subscribed, subscription_tier, user_id";
    const { data: byUser } = await supabaseClient
      .from("subscribers")
      .select(subscriberColumns)
      .eq("user_id", user.id)
      .order("updated_at", { ascending: false })
      .limit(1);
    let existingSubscriberRow = byUser?.[0] ?? null;
    if (!existingSubscriberRow) {
      const { data: byEmail } = await supabaseClient.from("subscribers").select(subscriberColumns).eq("email", user.email).maybeSingle();
      // Linha pelo e-mail só se não for de outra conta (o e-mail pode ter sido
      // de outra pessoa, que trocou de e-mail): senão a pessoa nova herdaria
      // o plano e os contadores do mês de outra conta.
      existingSubscriberRow = byEmail && (!byEmail.user_id || byEmail.user_id === user.id) ? byEmail : null;
    }
    const rowFilter = existingSubscriberRow ? { column: "id", value: existingSubscriberRow.id } : { column: "email", value: user.email };

    const currentUsage = existingSubscriberRow?.current_usage || { appointments: 0, sos_uses: 0 };
    let sosUsedThisMonth = existingSubscriberRow?.sos_used_this_month ?? false;
    let sosLastUsed = existingSubscriberRow?.sos_last_used ?? null as string | null;
    let appointmentsUsedThisMonth = existingSubscriberRow?.appointments_used_this_month ?? false;
    let appointmentsLastUsed = existingSubscriberRow?.appointments_last_used ?? null as string | null;

    // Disponibilidade do mês. Essencial: 1 SOS. Completo: 1 SOS e 1 consulta.
    // Flex: 1 atendimento no mês, SOS ou consulta (usou um, o outro acaba).
    const now = new Date();
    const sameMonth = sosLastUsed
      ? isSameBrazilMonthAsDateOnly(sosLastUsed, now)
      : false;
    const sameMonthAppointments = appointmentsLastUsed
      ? isSameBrazilMonth(new Date(appointmentsLastUsed), now)
      : false;

    if (subscriptionTier) {
      // Virada do mês: zera as marcas do mês anterior.
      if (sosUsedThisMonth && sosLastUsed && !sameMonth) {
        await supabaseClient
          .from("subscribers")
          .update({ sos_used_this_month: false, sos_last_used: null, updated_at: new Date().toISOString() })
          .eq(rowFilter.column, rowFilter.value)
          // Só zera se ninguém usou o SOS do mês novo enquanto esta checagem rodava.
          .eq("sos_last_used", sosLastUsed);
        sosUsedThisMonth = false;
        sosLastUsed = null;
      }
      if (planLimits.appointments > 0 && appointmentsUsedThisMonth && appointmentsLastUsed && !sameMonthAppointments) {
        await supabaseClient
          .from("subscribers")
          .update({ appointments_used_this_month: false, appointments_last_used: null, updated_at: new Date().toISOString() })
          .eq(rowFilter.column, rowFilter.value)
          // Só zera se a consulta do mês novo não foi reservada enquanto esta checagem rodava.
          .eq("appointments_last_used", appointmentsLastUsed);
        appointmentsUsedThisMonth = false;
        appointmentsLastUsed = null;
      }
    }

    // No Flex, qualquer um dos dois usados gasta o atendimento do mês.
    const sharedUsed = planLimits.shared && (sosUsedThisMonth || appointmentsUsedThisMonth);
    const label = subscriptionTier ? subscriptionTier.toUpperCase() : "";

    let canUseSOS = false;
    let sosReason = "Usuário não possui assinatura ativa";
    if (subscriptionTier) {
      canUseSOS = !sosUsedThisMonth && !sharedUsed;
      sosReason = canUseSOS
        ? `Pode usar SOS (${label}: 1x/mês)`
        : planLimits.shared && !sosUsedThisMonth
          ? "Atendimento do mês já usado em uma consulta agendada (FLEX: SOS ou consulta, 1x/mês)"
          : `Limite mensal de SOS já utilizado (${label}: 1x/mês)`;
    }

    let canScheduleAppointment = false;
    let appointmentReason = "Sem assinatura ativa";
    if (subscriptionTier && planLimits.appointments === 0) {
      appointmentReason = "Agendamento de consultas disponível nos planos Flex e Completo";
    } else if (subscriptionTier) {
      canScheduleAppointment = !appointmentsUsedThisMonth && !sharedUsed;
      appointmentReason = canScheduleAppointment
        ? `Pode agendar consulta (${label}: 1x/mês)`
        : planLimits.shared && !appointmentsUsedThisMonth
          ? "Atendimento do mês já usado em um SOS (FLEX: SOS ou consulta, 1x/mês)"
          : `Limite mensal de consultas agendadas já utilizado (${label}: 1x/mês)`;
    }

    // Atendimentos avulsos já pagos e ainda não usados: valem quando a cota
    // do plano não existe ou acabou.
    const { data: creditRows } = await supabaseClient
      .from("extra_credits")
      .select("kind")
      .eq("user_id", user.id)
      .eq("status", "available");
    const extraCredits = {
      sos: (creditRows ?? []).filter((r) => r.kind === "sos").length,
      appointment: (creditRows ?? []).filter((r) => r.kind === "appointment").length,
    };
    const planCanUseSos = canUseSOS;
    const planCanSchedule = canScheduleAppointment;
    const planSosReason = sosReason;
    const planAppointmentReason = appointmentReason;
    if (!canUseSOS && extraCredits.sos > 0) {
      canUseSOS = true;
      sosReason = "Pode usar SOS (avulso)";
    }
    if (!canScheduleAppointment && extraCredits.appointment > 0) {
      canScheduleAppointment = true;
      appointmentReason = "Pode agendar consulta (avulsa)";
    }
    const extraPrices = EXTRA_PRICES[subscriptionTier ? "plan" : "free"];

    // Update subscriber in database
    // Grava o estado do Stripe (entitlement_source = 'stripe'); o trigger do
    // banco soma o plano da empresa, se houver.
    const stripeRow = {
      email: user.email,
      user_id: user.id,
      stripe_customer_id: customerId,
      subscribed: stripeTier !== null,
      subscription_tier: stripeTier,
      subscription_end: stripeEnd,
      plan_limits: PLAN_LIMITS[stripeTier ?? "none"],
      entitlement_source: "stripe",
      cancel_at_period_end: stripeTier !== null && stripeSub.cancelAtPeriodEnd,
      updated_at: new Date().toISOString(),
    };
    // O uso do mês (SOS e consulta) não é regravado numa linha existente:
    // ele muda por outros caminhos (início do SOS, agendamento, devoluções) e
    // regravar o valor lido no começo desta checagem apagava um uso feito no
    // meio dela (SOS ou consulta extra de graça).
    const { error: writeError } = existingSubscriberRow
      ? await supabaseClient.from("subscribers").update(stripeRow).eq("id", existingSubscriberRow.id)
      : await supabaseClient.from("subscribers").upsert({
          ...stripeRow,
          current_usage: currentUsage,
          sos_used_this_month: sosUsedThisMonth,
          sos_last_used: sosLastUsed,
          appointments_used_this_month: appointmentsUsedThisMonth,
          appointments_last_used: appointmentsLastUsed,
        }, { onConflict: "email" });
    if (writeError) logStep("Could not write subscriber row", { message: writeError.message });

    logStep("Updated database with subscription info", { subscribed: hasActiveSub, subscriptionTier, planLimits });
    return new Response(JSON.stringify({
      subscribed: hasActiveSub,
      subscription_tier: subscriptionTier,
      subscription_end: subscriptionEnd,
      plan_limits: planLimits,
      current_usage: currentUsage,
      can_use_sos: canUseSOS,
      reason: sosReason,
      can_schedule_appointment: canScheduleAppointment,
      appointment_reason: appointmentReason,
      // Cota do próprio plano (sem contar avulsos), para a tela explicar o motivo.
      plan_can_use_sos: planCanUseSos,
      plan_can_schedule_appointment: planCanSchedule,
      plan_sos_reason: planSosReason,
      plan_appointment_reason: planAppointmentReason,
      extra_credits: extraCredits,
      extra_prices: extraPrices,
      plan_type: subscriptionTier,
      entitlement_source: hasActiveSub ? (fromOrganization ? "organization" : "stripe") : null,
      organization_name: fromOrganization ? org!.organization_name : null,
      // Paga uma assinatura própria além do benefício da empresa: o app avisa
      // que pode cancelar (é o que Headspace e Calm fazem com quem já pagava).
      personal_subscription_tier: fromOrganization ? stripeTier : null,
      // Estado da assinatura própria, para a tela de planos.
      stripe_status: stripeSub.status,
      cancel_at_period_end: stripeSub.cancelAtPeriodEnd,
      pending_tier: stripeSub.pendingTier,
      pending_from: stripeSub.pendingFrom,
      payment_issue: stripeSub.status === "past_due",
      extra_subscriptions: stripeSub.extraSubscriptions,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in check-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
});
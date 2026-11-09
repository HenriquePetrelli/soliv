import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { cancelMode } from "../_shared/billing.ts";
import { findCustomerId, liveSubscriptions, newStripe, releaseSchedule } from "../_shared/stripe.ts";
import { monitored } from "../_shared/monitoring.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

// Direito de arrependimento (CDC, art. 49): quem cancela em até 7 dias da
// primeira contratação recebe de volta tudo o que pagou. O prazo conta da
// assinatura mais antiga do cliente na Stripe (canceladas inclusive), para
// que cancelar e assinar de novo não reabra a janela.
const WITHDRAWAL_DAYS = 7;
const DAY_MS = 24 * 60 * 60 * 1000;

interface RefundableCharge {
  chargeId: string;
  invoiceId: string;
  amount: number;
}

const findWithdrawalRefund = async (stripe: Stripe, customerId: string) => {
  const allSubscriptions = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 100 });
  if (allSubscriptions.data.length === 0) {
    return { eligible: false, deadline: null as string | null, charges: [] as RefundableCharge[], amount: 0 };
  }
  const firstCreatedMs = Math.min(...allSubscriptions.data.map((sub) => sub.created * 1000));
  const deadlineMs = firstCreatedMs + WITHDRAWAL_DAYS * DAY_MS;
  const deadline = new Date(deadlineMs).toISOString();
  if (Date.now() > deadlineMs) {
    return { eligible: false, deadline, charges: [] as RefundableCharge[], amount: 0 };
  }

  const invoices = await stripe.invoices.list({
    customer: customerId,
    status: "paid",
    created: { gte: Math.floor(firstCreatedMs / 1000) - 60 },
    limit: 100,
    expand: ["data.charge"],
  });
  const charges: RefundableCharge[] = [];
  for (const invoice of invoices.data) {
    const charge = invoice.charge as Stripe.Charge | string | null;
    if (!charge || typeof charge === "string") continue;
    const remaining = charge.amount - charge.amount_refunded;
    if (remaining > 0) charges.push({ chargeId: charge.id, invoiceId: invoice.id, amount: remaining });
  }
  const amount = charges.reduce((total, charge) => total + charge.amount, 0);
  return { eligible: amount > 0, deadline, charges, amount };
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CANCEL-SUBSCRIPTION] ${step}${detailsStr}`);
};

serve(monitored("cancel-subscription", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  try {
    logStep("Function started");

    const stripeKey = Deno.env.get("STRIPE_SECRET_KEY");
    if (!stripeKey) throw new Error("STRIPE_SECRET_KEY is not set");
    logStep("Stripe key verified");

    const supabaseClient = createClient(
      Deno.env.get("SUPABASE_URL") ?? "",
      Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
      { auth: { persistSession: false } }
    );

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    logStep("Authorization header found");

    const token = authHeader.replace("Bearer ", "");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(token);
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id, email: user.email });

    const stripe = newStripe();
    const customerId = await findCustomerId(stripe, supabaseClient, user);
    if (!customerId) {
      throw new Error("No Stripe customer found for this user");
    }
    logStep("Found Stripe customer", { customerId });

    const body = await req.json().catch(() => null);
    const withdrawal = await findWithdrawalRefund(stripe, customerId);
    const subscriptions = await liveSubscriptions(stripe, customerId);
    const main = subscriptions[0];
    const mode = cancelMode(withdrawal.eligible, main?.status ?? "active");
    const accessUntil = mode === "period_end" && main ? new Date(main.current_period_end * 1000).toISOString() : null;

    // Só consulta: o app mostra, antes de confirmar, se haverá reembolso.
    if (body?.preview === true) {
      // Consultas futuras que serão canceladas: no cancelamento imediato, todas;
      // no fim do período, as marcadas para depois do fim do plano (o banco as
      // cancela quando o plano termina, com aviso 3 dias antes).
      let futureAppointments = 0;
      const cancelFrom = mode === "immediate" ? new Date().toISOString() : accessUntil;
      if (cancelFrom) {
        const { count } = await supabaseClient
          .from("appointments")
          .select("id", { count: "exact", head: true })
          .eq("patient_id", user.id)
          .eq("appointment_type", "regular")
          .in("status", ["pending", "scheduled", "confirmed", "reschedule_proposed"])
          .gte("scheduled_at", cancelFrom);
        futureAppointments = count ?? 0;
      }
      return new Response(JSON.stringify({
        future_appointments: futureAppointments,
        refund_eligible: withdrawal.eligible,
        refund_amount: withdrawal.amount,
        refund_deadline: withdrawal.deadline,
        mode,
        access_until: accessUntil,
      }), {
        headers: { ...corsHeaders, "Content-Type": "application/json" },
        status: 200,
      });
    }

    if (subscriptions.length === 0) {
      throw new Error("No active subscription found to cancel");
    }

    // Fora do prazo de arrependimento, o plano segue até o fim do período já
    // pago e não renova (como Calm, Headspace e Spotify). Antes o
    // cancelamento cortava o acesso na hora, sem devolver o resto do mês.
    const cancelledSubscriptions: string[] = [];
    for (const subscription of subscriptions) {
      await releaseSchedule(stripe, subscription);
      if (mode === "period_end" && subscription.status !== "past_due") {
        await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: true });
        logStep("Subscription set to cancel at period end", { subscriptionId: subscription.id });
      } else {
        await stripe.subscriptions.cancel(subscription.id);
        logStep("Cancelled subscription", { subscriptionId: subscription.id });
      }
      cancelledSubscriptions.push(subscription.id);
    }

    if (mode === "immediate") {
      // Só a assinatura do Stripe acabou; o trigger do banco mantém o plano
      // da empresa (B2B), se houver. Os contadores do mês ficam como estão.
      await supabaseClient.from("subscribers").update({
        stripe_customer_id: customerId,
        subscribed: false,
        subscription_tier: null,
        subscription_end: null,
        plan_limits: { appointments: 0, sos_uses: 0 },
        entitlement_source: "stripe",
        cancel_at_period_end: false,
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.id);
    } else if (accessUntil) {
      // O plano continua até o fim do período pago; o app mostra o aviso na
      // hora (sem esperar o webhook) e o banco encerra o plano nessa data.
      await supabaseClient.from("subscribers").update({
        cancel_at_period_end: true,
        subscription_end: accessUntil,
        updated_at: new Date().toISOString(),
      }).eq("user_id", user.id).eq("entitlement_source", "stripe");
    }

    // A assinatura mudou: o próximo check-subscription consulta o Stripe de novo.
    await supabaseClient.from("stripe_customer_state").delete().eq("user_id", user.id);
    logStep("Updated database with cancellation", { cancelledSubscriptions });

    // Cancelou na hora (arrependimento com reembolso ou pagamento em atraso):
    // consultas futuras pedidas com o plano são canceladas e o psicólogo é
    // avisado (senão viravam consulta de graça, paga ao psicólogo no repasse).
    // Se a pessoa ainda tem um plano com consultas (Flex ou Completo) pela empresa, nada muda.
    let cancelledAppointments = 0;
    if (mode === "immediate") {
      const { data: count, error: apptError } = await supabaseClient.rpc("cancel_appointments_after_plan_loss", {
        p_user_id: user.id,
      });
      if (apptError) logStep("Could not cancel future appointments", { message: apptError.message });
      else cancelledAppointments = Number(count ?? 0);
    }

    // Reembolso depois do cancelamento: se falhar, a cobrança já parou e o
    // suporte conclui a devolução pelo registro abaixo.
    let refundStatus: "none" | "refunded" | "failed" = "none";
    let refundedAmount = 0;
    if (withdrawal.eligible) {
      const refunds: { refundId: string; chargeId: string; invoiceId: string; amount: number }[] = [];
      try {
        for (const charge of withdrawal.charges) {
          const refund = await stripe.refunds.create(
            {
              charge: charge.chargeId,
              amount: charge.amount,
              reason: "requested_by_customer",
              metadata: { motivo: "direito_de_arrependimento", user_id: user.id },
            },
            { idempotencyKey: `withdrawal-${charge.chargeId}-${charge.amount}` },
          );
          refunds.push({ refundId: refund.id, chargeId: charge.chargeId, invoiceId: charge.invoiceId, amount: charge.amount });
          refundedAmount += charge.amount;
        }
        refundStatus = "refunded";
        logStep("Withdrawal refund issued", { refunds });
      } catch (refundError) {
        refundStatus = "failed";
        logStep("ERROR issuing withdrawal refund", {
          message: refundError instanceof Error ? refundError.message : String(refundError),
          refunds,
        });
      }

      await supabaseClient.from("security_audit_log").insert({
        user_id: user.id,
        action: refundStatus === "refunded" ? "withdrawal_refund_issued" : "withdrawal_refund_failed",
        table_name: "subscribers",
        record_id: user.id,
        new_values: {
          stripe_customer_id: customerId,
          expected_amount: withdrawal.amount,
          refunded_amount: refundedAmount,
          refunds,
        },
      });
    }

    return new Response(JSON.stringify({
      success: true,
      message: "Assinatura cancelada com sucesso",
      mode,
      access_until: accessUntil,
      cancelled_subscriptions: cancelledSubscriptions,
      refund_status: refundStatus,
      refunded_amount: refundedAmount,
      cancelled_appointments: cancelledAppointments,
    }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 200,
    });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in cancel-subscription", { message: errorMessage });
    return new Response(JSON.stringify({ error: errorMessage }), {
      headers: { ...corsHeaders, "Content-Type": "application/json" },
      status: 500,
    });
  }
}));
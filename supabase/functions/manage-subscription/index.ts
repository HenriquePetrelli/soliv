import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type Stripe from "https://esm.sh/stripe@14.21.0";
import { changeDirection, parseTier, tierForPrice } from "../_shared/billing.ts";
import { PLAN_PRICES, findCustomerId, liveSubscriptions, newStripe, releaseSchedule } from "../_shared/stripe.ts";

// Mudanças na assinatura própria, sem passar por um novo checkout:
//   - preview_change / change_plan: subir de plano cobra só a diferença
//     proporcional na hora e libera o plano novo já; descer de plano vale na
//     próxima renovação (a pessoa usa até o fim o que já pagou), via
//     subscription schedule do Stripe.
//   - keep_current: desiste de uma troca para baixo já agendada.
//   - resume: desfaz um cancelamento agendado para o fim do período.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: unknown) =>
  console.log(`[MANAGE-SUBSCRIPTION] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });

const iso = (seconds: number) => new Date(seconds * 1000).toISOString();

/** Quanto será cobrado agora ao subir de plano (só as linhas proporcionais). */
const upgradeAmount = async (stripe: Stripe, subscription: Stripe.Subscription, price: string, prorationDate: number) => {
  const upcoming = await stripe.invoices.retrieveUpcoming({
    customer: typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id,
    subscription: subscription.id,
    subscription_items: [{ id: subscription.items.data[0].id, price }],
    subscription_proration_behavior: "always_invoice",
    subscription_proration_date: prorationDate,
  });
  return upcoming.lines.data.filter((line) => line.proration).reduce((total, line) => total + line.amount, 0);
};

Deno.serve(async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });

  try {
    if (!Deno.env.get("STRIPE_SECRET_KEY")) throw new Error("STRIPE_SECRET_KEY is not set");
    const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
      auth: { persistSession: false },
    });

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);
    const { data: userData, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData?.user;
    if (userError || !user) return json({ error: "Unauthorized" }, 401);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "");

    const stripe = newStripe();
    const customerId = await findCustomerId(stripe, supabase, user);
    const subscription = customerId ? (await liveSubscriptions(stripe, customerId))[0] : undefined;
    if (!subscription) return json({ error_code: "no_subscription" });

    const currentPrice = subscription.items.data[0]?.price.id;
    const currentTier = tierForPrice(PLAN_PRICES, currentPrice);

    // Desistiu do cancelamento (manter, subir ou descer de plano): tira a marca
    // na hora, senão a rotina expire-cancelled-subscriptions encerraria o
    // plano de quem continua pagando caso o webhook do Stripe não chegue.
    const clearCancelFlag = () =>
      supabase.from("subscribers").update({ cancel_at_period_end: false }).eq("user_id", user.id);
    // A assinatura mudou: o próximo check-subscription consulta o Stripe de novo.
    const invalidateStripeCache = () => supabase.from("stripe_customer_state").delete().eq("user_id", user.id);

    if (action === "resume") {
      await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: false });
      await clearCancelFlag();
      log("Cancellation undone", { subscription: subscription.id });
      await invalidateStripeCache();
      return json({ ok: true });
    }

    if (action === "keep_current") {
      await releaseSchedule(stripe, subscription);
      log("Scheduled change undone", { subscription: subscription.id });
      await invalidateStripeCache();
      return json({ ok: true });
    }

    if (action !== "preview_change" && action !== "change_plan") return json({ error: "Ação inválida" }, 400);

    const target = parseTier(body?.plan);
    if (!target) return json({ error: "Plano inválido" }, 400);
    if (!PLAN_PRICES[target]) return json({ error: `Preço do plano ${target} não configurado no Stripe` }, 500);
    if (subscription.status === "past_due") return json({ error_code: "payment_issue" });

    const direction = changeDirection(currentTier, target);
    if (direction === "same") return json({ error_code: "same_plan" });
    const targetPrice = PLAN_PRICES[target];

    if (direction === "upgrade") {
      // A data da prévia volta do app para cobrar o mesmo valor mostrado. Só
      // vale se for dos últimos minutos: uma data no fim do período deixaria a
      // diferença quase zero (Completo quase de graça até a renovação).
      const nowSeconds = Math.floor(Date.now() / 1000);
      const sent = Number(body?.proration_date);
      const prorationDate =
        Number.isInteger(sent) && sent <= nowSeconds && sent >= nowSeconds - 15 * 60 ? sent : nowSeconds;
      if (action === "preview_change") {
        return json({
          direction,
          amount_due: await upgradeAmount(stripe, subscription, targetPrice, prorationDate),
          proration_date: prorationDate,
          renews_on: iso(subscription.current_period_end),
        });
      }
      // Uma troca para baixo agendada ou um cancelamento agendado deixam de
      // valer: quem sobe de plano quer continuar.
      await releaseSchedule(stripe, subscription);
      try {
        await stripe.subscriptions.update(subscription.id, {
          items: [{ id: subscription.items.data[0].id, price: targetPrice }],
          proration_behavior: "always_invoice",
          proration_date: prorationDate,
          // Se o cartão recusar a diferença, nada muda (não fica pela metade).
          payment_behavior: "error_if_incomplete",
          cancel_at_period_end: false,
          metadata: { ...subscription.metadata, user_id: user.id, plan: target },
        });
      } catch (error) {
        log("Upgrade payment failed", { message: error instanceof Error ? error.message : String(error) });
        return json({ error_code: "payment_failed" });
      }
      await clearCancelFlag();
      log("Upgraded", { subscription: subscription.id, from: currentTier, to: target });
      await invalidateStripeCache();
      return json({ ok: true, direction });
    }

    // Descer de plano: vale na renovação.
    if (action === "preview_change") {
      return json({ direction, effective_on: iso(subscription.current_period_end) });
    }
    if (subscription.cancel_at_period_end) {
      // Uma assinatura com cancelamento agendado não aceita agenda de troca;
      // escolher outro plano é desistir do cancelamento.
      await stripe.subscriptions.update(subscription.id, { cancel_at_period_end: false });
      await clearCancelFlag();
    }
    const scheduleRef = subscription.schedule;
    const scheduleId =
      (typeof scheduleRef === "string" ? scheduleRef : scheduleRef?.id) ??
      (await stripe.subscriptionSchedules.create({ from_subscription: subscription.id })).id;
    const schedule = await stripe.subscriptionSchedules.retrieve(scheduleId);
    const currentPhaseStart = schedule.current_phase?.start_date ?? subscription.current_period_start;
    await stripe.subscriptionSchedules.update(scheduleId, {
      end_behavior: "release",
      phases: [
        {
          items: [{ price: currentPrice, quantity: 1 }],
          start_date: currentPhaseStart,
          end_date: subscription.current_period_end,
          proration_behavior: "none",
        },
        {
          items: [{ price: targetPrice, quantity: 1 }],
          iterations: 1,
          proration_behavior: "none",
          metadata: { user_id: user.id, plan: target },
        },
      ],
    });
    log("Downgrade scheduled", { subscription: subscription.id, to: target, on: iso(subscription.current_period_end) });
    await invalidateStripeCache();
    return json({ ok: true, direction, effective_on: iso(subscription.current_period_end) });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("ERROR", { message });
    return json({ error: message }, 500);
  }
});

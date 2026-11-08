import Stripe from "https://esm.sh/stripe@14.21.0";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PLAN_LIMITS, stripeState } from "../_shared/billing.ts";
import { PLAN_PRICES, listSubscriptions, newStripe } from "../_shared/stripe.ts";
import { grantFromPaymentIntent } from "../_shared/extras.ts";

// Mantém `subscribers` em dia com o Stripe sem depender de a pessoa abrir o
// app (check-subscription): cancelamento, renovação recusada, troca de plano
// pelo portal etc.
//
// Configure em Stripe → Developers → Webhooks, apontando para
// https://<project>.supabase.co/functions/v1/stripe-webhook, com os eventos:
//   checkout.session.completed, customer.subscription.created,
//   customer.subscription.updated, customer.subscription.deleted,
//   invoice.paid, invoice.payment_failed
// e grave o signing secret como STRIPE_WEBHOOK_SECRET.
//
// Cada evento sincroniza o CLIENTE inteiro, lendo as assinaturas direto do
// Stripe: os eventos podem chegar fora de ordem (um "updated" antigo depois do
// "deleted") e o payload do evento pode estar desatualizado.

const log = (step: string, details?: unknown) =>
  console.log(`[STRIPE-WEBHOOK] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

const stripe = newStripe();
const cryptoProvider = Stripe.createSubtleCryptoProvider();

const supabase = createClient(
  Deno.env.get("SUPABASE_URL") ?? "",
  Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
  { auth: { persistSession: false } }
);

const customerIdOf = (customer: string | { id: string } | null | undefined) =>
  !customer ? null : typeof customer === "string" ? customer : customer.id;

/** A linha de `subscribers` da pessoa: pelo cliente do Stripe, pelo user_id ou pelo e-mail. */
const findSubscriberRow = async (customerId: string, userId: string | null, email: string | null) => {
  const byCustomer = await supabase.from("subscribers").select("id").eq("stripe_customer_id", customerId).order("updated_at", { ascending: false }).limit(1);
  if (byCustomer.data?.[0]) return byCustomer.data[0].id as string;
  if (userId) {
    const byUser = await supabase.from("subscribers").select("id").eq("user_id", userId).order("updated_at", { ascending: false }).limit(1);
    if (byUser.data?.[0]) return byUser.data[0].id as string;
  }
  if (email) {
    // Só uma linha sem dono ou do próprio usuário, ainda sem outro cliente do
    // Stripe: o e-mail pode ter sido de outra pessoa antes.
    const byEmail = await supabase.from("subscribers").select("id, user_id, stripe_customer_id").eq("email", email).maybeSingle();
    const row = byEmail.data;
    if (
      row &&
      (!row.user_id || row.user_id === userId) &&
      (!row.stripe_customer_id || row.stripe_customer_id === customerId)
    ) {
      return row.id as string;
    }
  }
  return null;
};

const syncCustomer = async (customerId: string, userIdHint?: string | null) => {
  const customer = await stripe.customers.retrieve(customerId);
  if ("deleted" in customer && customer.deleted) {
    log("Deleted customer, skipped", { customerId });
    return;
  }
  const subscriptions = await listSubscriptions(stripe, customerId);
  const state = stripeState(PLAN_PRICES, subscriptions, Math.floor(Date.now() / 1000));
  const userId = userIdHint ?? customer.metadata?.user_id ?? subscriptions.find((s: Stripe.Subscription) => s.metadata?.user_id)?.metadata.user_id ?? null;

  const patch = {
    stripe_customer_id: customerId,
    subscribed: state.tier !== null,
    subscription_tier: state.tier,
    subscription_end: state.periodEnd,
    // Cancelada e sem renovação: o banco encerra o plano em subscription_end
    // (rotina expire-cancelled-subscriptions), mesmo sem novo aviso do Stripe.
    cancel_at_period_end: state.tier !== null && state.cancelAtPeriodEnd,
    plan_limits: PLAN_LIMITS[state.tier ?? "none"],
    // Estado do Stripe; o trigger do banco soma o plano da empresa (B2B), se houver.
    entitlement_source: "stripe",
    updated_at: new Date().toISOString(),
  };

  const rowId = await findSubscriberRow(customerId, userId, customer.email);
  if (rowId) {
    const { error } = await supabase.from("subscribers").update(patch).eq("id", rowId);
    if (error) throw error;
  } else if (userId) {
    const { data: authUser } = await supabase.auth.admin.getUserById(userId);
    const email = authUser?.user?.email ?? customer.email;
    if (!email) {
      log("No email for new subscriber row, skipped", { customerId });
      return;
    }
    const { error } = await supabase.from("subscribers").upsert({ ...patch, user_id: userId, email }, { onConflict: "email" });
    if (error) throw error;
  } else {
    // Nada liga o cliente a uma conta: check-subscription cria a linha na
    // próxima visita.
    log("No subscriber row and no user id, skipped", { customerId });
    return;
  }
  // Cache que o check-subscription usa no lugar de consultar o Stripe.
  if (userId) {
    const { error: cacheError } = await supabase.from("stripe_customer_state").upsert({
      user_id: userId,
      stripe_customer_id: customerId,
      state,
      synced_at: new Date().toISOString(),
    });
    if (cacheError) log("Could not cache Stripe state", { message: cacheError.message });
  }
  log("Subscriber synced", { customerId, status: state.status, tier: state.tier, cancelAtPeriodEnd: state.cancelAtPeriodEnd });
};

/**
 * Cobrança recusada: avisa no app e por push (antes só aparecia um aviso no
 * Perfil, para quem abrisse o app). Um aviso por dia, mesmo com várias
 * tentativas do Stripe.
 */
const notifyPaymentFailed = async (customerId: string) => {
  const { data: row } = await supabase
    .from("subscribers")
    .select("user_id")
    .eq("stripe_customer_id", customerId)
    .not("user_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1)
    .maybeSingle();
  const userId = row?.user_id as string | undefined;
  if (!userId) return;
  const since = new Date(Date.now() - 20 * 60 * 60 * 1000).toISOString();
  const { count } = await supabase
    .from("notifications")
    .select("id", { count: "exact", head: true })
    .eq("patient_id", userId)
    .eq("title", "Pagamento não aprovado")
    .gte("created_at", since);
  if ((count ?? 0) > 0) return;
  const { error } = await supabase.from("notifications").insert({
    patient_id: userId,
    title: "Pagamento não aprovado",
    message: "Não conseguimos cobrar a renovação do seu plano. Atualize o cartão para não perder o SOS e as consultas.",
    status: "unread",
    push: true,
    link: "/profile",
  });
  if (error) log("Could not notify payment failure", { message: error.message });
};

Deno.serve(async (req) => {
  if (req.method !== "POST") return new Response("Method not allowed", { status: 405 });

  const secret = Deno.env.get("STRIPE_WEBHOOK_SECRET");
  const signature = req.headers.get("stripe-signature");
  if (!secret || !signature) return new Response("Missing signature", { status: 400 });

  let event: Stripe.Event;
  try {
    const body = await req.text();
    event = await stripe.webhooks.constructEventAsync(body, signature, secret, undefined, cryptoProvider);
  } catch (err) {
    log("Invalid signature", { message: err instanceof Error ? err.message : String(err) });
    return new Response("Invalid signature", { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object as Stripe.Checkout.Session;
        const customerId = customerIdOf(session.customer);
        if (session.mode === "subscription" && customerId) {
          await syncCustomer(customerId, session.metadata?.user_id ?? session.client_reference_id ?? null);
        }
        // Atendimento avulso pago pela página do Stripe (buy-extra): libera o
        // crédito mesmo que a pessoa não volte ao app.
        if (session.mode === "payment" && session.metadata?.origin === "soliv-avulso" && session.payment_intent) {
          const piId = typeof session.payment_intent === "string" ? session.payment_intent : session.payment_intent.id;
          const pi = await stripe.paymentIntents.retrieve(piId);
          const creditId = await grantFromPaymentIntent(supabase, pi);
          log("Extra credit granted", { session: session.id, creditId });
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
      case "customer.subscription.paused":
      case "customer.subscription.resumed": {
        const subscription = event.data.object as Stripe.Subscription;
        await syncCustomer(customerIdOf(subscription.customer)!, subscription.metadata?.user_id ?? null);
        break;
      }
      case "invoice.paid":
      case "invoice.payment_failed": {
        const invoice = event.data.object as Stripe.Invoice;
        const customerId = customerIdOf(invoice.customer);
        if (customerId && invoice.subscription) await syncCustomer(customerId);
        if (event.type === "invoice.payment_failed" && customerId) {
          log("Payment failed", { invoice: invoice.id, attempt: invoice.attempt_count });
          await notifyPaymentFailed(customerId);
        }
        break;
      }
      default:
        log("Ignored event", { type: event.type });
    }
    return new Response(JSON.stringify({ received: true }), { headers: { "Content-Type": "application/json" } });
  } catch (err) {
    // 500 faz o Stripe tentar de novo, que é o que queremos em falhas passageiras.
    log("Error handling event", { type: event.type, message: err instanceof Error ? err.message : String(err) });
    return new Response("Webhook handler failed", { status: 500 });
  }
});

import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import type Stripe from "https://esm.sh/stripe@14.21.0";
import { EXTRA_LABELS, EXTRA_PRICES, parseExtraKind, type ExtraKind } from "../_shared/billing.ts";
import { EXTRA_PRICE_IDS, findCustomerId, newStripe } from "../_shared/stripe.ts";
import { grantFromPaymentIntent as grant } from "../_shared/extras.ts";
import { monitored } from "../_shared/monitoring.ts";

// Atendimento avulso (SOS ou consulta agendada), cobrado na hora.
//   - action "buy": com cartão salvo no Stripe, cobra direto e devolve
//     { ok, credit_id }. Sem cartão (ou se o banco pedir autenticação), abre o
//     pagamento do Stripe uma vez ({ url }) e guarda o cartão para as próximas.
//   - action "confirm" { session_id }: na volta do pagamento, libera o crédito
//     (o webhook também libera; os dois juntos não duplicam).
// O preço é sempre decidido aqui: com plano pago, preço de assinante.

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const log = (step: string, details?: unknown) =>
  console.log(`[BUY-EXTRA] ${step}${details ? ` - ${JSON.stringify(details)}` : ""}`);

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });

const supabase = createClient(Deno.env.get("SUPABASE_URL") ?? "", Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "", {
  auth: { persistSession: false },
});

const savedCard = async (stripe: Stripe, customerId: string): Promise<string | null> => {
  const customer = await stripe.customers.retrieve(customerId);
  if ("deleted" in customer && customer.deleted) return null;
  const preferred = customer.invoice_settings?.default_payment_method;
  if (preferred) return typeof preferred === "string" ? preferred : preferred.id;
  const cards = await stripe.paymentMethods.list({ customer: customerId, type: "card", limit: 1 });
  return cards.data[0]?.id ?? null;
};

Deno.serve(monitored("buy-extra", async (req) => {
  if (req.method === "OPTIONS") return new Response(null, { headers: corsHeaders });
  try {
    if (!Deno.env.get("STRIPE_SECRET_KEY")) throw new Error("STRIPE_SECRET_KEY is not set");
    const authHeader = req.headers.get("Authorization");
    if (!authHeader) return json({ error: "Missing authorization header" }, 401);
    const { data: userData, error: userError } = await supabase.auth.getUser(authHeader.replace("Bearer ", ""));
    const user = userData?.user;
    if (userError || !user?.email) return json({ error: "Unauthorized" }, 401);

    const { data: profile } = await supabase.from("profiles").select("user_type").eq("user_id", user.id).maybeSingle();
    if (profile?.user_type !== "patient") return json({ error_code: "not_patient" }, 403);

    const body = await req.json().catch(() => ({}));
    const action = String(body?.action ?? "buy");
    const stripe = newStripe();

    if (action === "confirm") {
      const sessionId = String(body?.session_id ?? "");
      if (!sessionId.startsWith("cs_")) return json({ error: "Sessão inválida" }, 400);
      const session = await stripe.checkout.sessions.retrieve(sessionId, { expand: ["payment_intent"] });
      const pi = session.payment_intent as Stripe.PaymentIntent | null;
      if (session.metadata?.user_id !== user.id) return json({ error: "Sessão inválida" }, 400);
      // Ainda sem pagamento (a pessoa voltou sem pagar, ou o banco ainda está aprovando).
      if (!pi || session.payment_status !== "paid" || pi.status !== "succeeded") return json({ ok: false, pending: true });
      const creditId = await grant(supabase, pi);
      // Cartão usado nesta compra vira o padrão para as próximas cobranças avulsas.
      const pm = typeof pi.payment_method === "string" ? pi.payment_method : pi.payment_method?.id;
      if (pm && session.customer) {
        const customerId = typeof session.customer === "string" ? session.customer : session.customer.id;
        const customer = await stripe.customers.retrieve(customerId);
        if (!("deleted" in customer && customer.deleted) && !customer.invoice_settings?.default_payment_method) {
          await stripe.customers.update(customerId, { invoice_settings: { default_payment_method: pm } }).catch(() => {});
        }
      }
      return json({ ok: Boolean(creditId), credit_id: creditId, kind: parseExtraKind(pi.metadata?.extra_kind) });
    }

    if (action !== "buy") return json({ error: "Ação inválida" }, 400);
    const kind = parseExtraKind(body?.kind);
    if (!kind) return json({ error: "Tipo inválido" }, 400);

    // Conta bloqueada não compra SOS (não poderia usar).
    if (kind === "sos") {
      const { data: patient } = await supabase.from("patients").select("is_blocked, blocked_until").eq("user_id", user.id).maybeSingle();
      if (patient?.is_blocked && (!patient.blocked_until || new Date(patient.blocked_until) > new Date())) {
        return json({ error_code: "blocked" });
      }
    }

    const { data: paid } = await supabase.rpc("has_paid_plan", { p_user_id: user.id });
    const priceTier: "free" | "plan" = paid ? "plan" : "free";
    // Preço do catálogo do Stripe (produto avulso); se o ID não existir no
    // modo atual, usa o valor de tabela.
    let amount = EXTRA_PRICES[priceTier][kind as ExtraKind];
    let description = EXTRA_LABELS[kind as ExtraKind];
    let catalogPrice: string | null = null;
    try {
      const price = await stripe.prices.retrieve(EXTRA_PRICE_IDS[priceTier][kind as ExtraKind], { expand: ["product"] });
      if (price.active && price.currency === "brl" && price.type === "one_time" && price.unit_amount) {
        amount = price.unit_amount;
        catalogPrice = price.id;
        const product = price.product as Stripe.Product;
        if (product?.name) description = product.name;
      }
    } catch (error) {
      log("Catalog price not found, using table price", { message: error instanceof Error ? error.message : String(error) });
    }
    const metadata = { user_id: user.id, extra_kind: kind, price_tier: priceTier, origin: "soliv-avulso" };

    let customerId = await findCustomerId(stripe, supabase, user);
    if (!customerId) {
      const customer = await stripe.customers.create(
        { email: user.email, metadata: { user_id: user.id } },
        { idempotencyKey: `customer-${user.id}` },
      );
      customerId = customer.id;
    }
    // Cliente do Stripe ligado à conta (para a próxima compra achar o cartão).
    await supabase.from("subscribers").update({ stripe_customer_id: customerId }).eq("user_id", user.id).is("stripe_customer_id", null);

    // Mesmo toque repetido (rede ruim) não cobra duas vezes.
    const requestKey = typeof body?.request_id === "string" && /^[0-9a-f-]{36}$/i.test(body.request_id)
      ? body.request_id
      : `${Math.floor(Date.now() / 60000)}`;

    const card = await savedCard(stripe, customerId);
    if (card) {
      try {
        const pi = await stripe.paymentIntents.create(
          {
            amount,
            currency: "brl",
            customer: customerId,
            payment_method: card,
            confirm: true,
            off_session: true,
            description,
            metadata,
          },
          { idempotencyKey: `extra-${user.id}-${kind}-${requestKey}` },
        );
        if (pi.status === "succeeded") {
          const creditId = await grant(supabase, pi);
          log("Charged saved card", { userId: user.id, kind, amount, pi: pi.id });
          return json({ ok: true, credit_id: creditId, amount_cents: amount });
        }
        log("Saved card needs another step, falling back to checkout", { status: pi.status });
      } catch (error) {
        // Cartão recusado ou banco pedindo autenticação: segue para a página do Stripe.
        log("Saved card charge failed, falling back to checkout", { message: error instanceof Error ? error.message : String(error) });
      }
    }

    const origin = req.headers.get("origin") ?? "";
    const session = await stripe.checkout.sessions.create(
      {
        mode: "payment",
        customer: customerId,
        client_reference_id: user.id,
        locale: "pt-BR",
        line_items: [
          catalogPrice
            ? { quantity: 1, price: catalogPrice }
            : { quantity: 1, price_data: { currency: "brl", unit_amount: amount, product_data: { name: description } } },
        ],
        payment_intent_data: { setup_future_usage: "off_session", metadata, description },
        metadata,
        success_url: `${origin}/avulso/sucesso?session_id={CHECKOUT_SESSION_ID}&tipo=${kind}`,
        cancel_url: `${origin}${kind === "sos" ? "/sos" : "/appointments"}`,
      },
      { idempotencyKey: `extra-checkout-${user.id}-${kind}-${requestKey}` },
    );
    log("Checkout created", { userId: user.id, kind, amount });
    return json({ url: session.url, amount_cents: amount });
  } catch (error) {
    const message = error instanceof Error ? error.message : String(error);
    log("ERROR", { message });
    return json({ error: message }, 500);
  }
}));

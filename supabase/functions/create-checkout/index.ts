import { serve } from "https://deno.land/std@0.190.0/http/server.ts";
import { createClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { PLAN_PRICES, findCustomerId, liveSubscriptions, newStripe } from "../_shared/stripe.ts";
import { parseTier, tierRank } from "../_shared/billing.ts";
import { monitored } from "../_shared/monitoring.ts";

const corsHeaders = {
  "Access-Control-Allow-Origin": "*",
  "Access-Control-Allow-Headers": "authorization, x-client-info, apikey, content-type",
};

const logStep = (step: string, details?: unknown) => {
  const detailsStr = details ? ` - ${JSON.stringify(details)}` : '';
  console.log(`[CREATE-CHECKOUT] ${step}${detailsStr}`);
};

const json = (body: unknown, status = 200) =>
  new Response(JSON.stringify(body), { headers: { ...corsHeaders, "Content-Type": "application/json" }, status });

serve(monitored("create-checkout", async (req) => {
  if (req.method === "OPTIONS") {
    return new Response(null, { headers: corsHeaders });
  }

  const supabaseClient = createClient(
    Deno.env.get("SUPABASE_URL") ?? "",
    Deno.env.get("SUPABASE_SERVICE_ROLE_KEY") ?? "",
    { auth: { persistSession: false } },
  );

  try {
    if (!Deno.env.get("STRIPE_SECRET_KEY")) throw new Error("STRIPE_SECRET_KEY is not set");

    const authHeader = req.headers.get("Authorization");
    if (!authHeader) throw new Error("No authorization header provided");
    const { data: userData, error: userError } = await supabaseClient.auth.getUser(authHeader.replace("Bearer ", ""));
    if (userError) throw new Error(`Authentication error: ${userError.message}`);
    const user = userData.user;
    if (!user?.email) throw new Error("User not authenticated or email not available");
    logStep("User authenticated", { userId: user.id });

    // O cliente só diz o plano; o preço vem do servidor.
    const { plan: requestedPlan } = await req.json();
    const plan = parseTier(requestedPlan);
    if (!plan) throw new Error("Plano inválido");
    if (!PLAN_PRICES[plan]) throw new Error(`Preço do plano ${plan} não configurado no Stripe`);

    // O plano da empresa já cobre este plano (ou um maior): não há o que pagar.
    const { data: orgRows } = await supabaseClient.rpc("organization_entitlement", { p_user_id: user.id });
    const orgTier = ((orgRows ?? [])[0] as { tier?: string } | undefined)?.tier ?? null;
    if (orgTier && tierRank(orgTier) >= tierRank(plan)) {
      logStep("Plan already covered by organization", { orgTier, plan });
      return json({ error_code: "covered_by_organization" });
    }

    const stripe = newStripe();
    let customerId = await findCustomerId(stripe, supabaseClient, user);

    // Quem já assina troca de plano pela manage-subscription (com cobrança
    // proporcional). Um novo checkout criaria uma segunda assinatura e a
    // pessoa pagaria as duas — era o que acontecia no "Trocar para".
    if (customerId && (await liveSubscriptions(stripe, customerId)).length > 0) {
      logStep("Already subscribed, checkout refused", { customerId });
      return json({ error_code: "already_subscribed" });
    }

    if (!customerId) {
      const customer = await stripe.customers.create(
        { email: user.email, metadata: { user_id: user.id } },
        { idempotencyKey: `customer-${user.id}` },
      );
      customerId = customer.id;
      logStep("Customer created", { customerId });
    }

    const origin = req.headers.get("origin") ?? "";
    const session = await stripe.checkout.sessions.create({
      customer: customerId,
      client_reference_id: user.id,
      line_items: [{ price: PLAN_PRICES[plan], quantity: 1 }],
      mode: "subscription",
      locale: "pt-BR",
      allow_promotion_codes: true,
      subscription_data: { metadata: { user_id: user.id, plan } },
      success_url: `${origin}/subscription-success?session_id={CHECKOUT_SESSION_ID}`,
      cancel_url: `${origin}/subscription-plans`,
      metadata: { user_id: user.id, plan },
    }, {
      // Dois toques seguidos em "Assinar" abrem o mesmo checkout (e não duas
      // assinaturas pagas).
      idempotencyKey: `checkout-${user.id}-${plan}-${Math.floor(Date.now() / 60000)}`,
    });

    logStep("Checkout session created", { sessionId: session.id });
    return json({ url: session.url });
  } catch (error) {
    const errorMessage = error instanceof Error ? error.message : String(error);
    logStep("ERROR in create-checkout", { message: errorMessage });
    return json({ error: errorMessage }, 500);
  }
}));

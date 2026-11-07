import type Stripe from "https://esm.sh/stripe@14.21.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { parseExtraKind } from "./billing.ts";

/**
 * Libera o crédito de um atendimento avulso pago (idempotente pelo
 * PaymentIntent: buy-extra e o webhook podem chamar os dois).
 */
export const grantFromPaymentIntent = async (supabase: SupabaseClient, pi: Stripe.PaymentIntent): Promise<string | null> => {
  const userId = pi.metadata?.user_id;
  const kind = parseExtraKind(pi.metadata?.extra_kind);
  const tier = pi.metadata?.price_tier === "plan" ? "plan" : "free";
  if (pi.status !== "succeeded" || !userId || !kind) return null;
  const { data, error } = await supabase.rpc("grant_extra_credit", {
    p_user_id: userId,
    p_kind: kind,
    p_amount_cents: pi.amount_received || pi.amount,
    p_price_tier: tier,
    p_payment_intent: pi.id,
  });
  if (error) throw error;
  return data as string;
};

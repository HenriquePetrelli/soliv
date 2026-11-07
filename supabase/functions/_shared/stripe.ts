import Stripe from "https://esm.sh/stripe@14.21.0";
import type { SupabaseClient } from "https://esm.sh/@supabase/supabase-js@2.45.0";
import { rankLiveSubscriptions, type PlanPrices } from "./billing.ts";

// Os planos vêm dos price IDs do Stripe configurados como secrets
// (STRIPE_PRICE_ESSENCIAL / STRIPE_PRICE_FLEX / STRIPE_PRICE_COMPLETO).
// Preço desconhecido não dá plano nenhum.
//
// O Essencial tem o mesmo preço (R$ 69,90) e os mesmos benefícios do antigo
// Plus, então o preço antigo serve de padrão. Flex e Completo precisam de
// preços novos no Stripe. Assinaturas antigas no preço do Premium (R$ 120,00,
// com SOS e consulta) continuam valendo como Completo até serem trocadas.
const LEGACY_PREMIUM_PRICE = Deno.env.get("STRIPE_PRICE_LEGACY_PREMIUM") ?? "price_1S3q9YPhFwqSktZsejrePGuS";

export const PLAN_PRICES: PlanPrices = {
  Essencial: Deno.env.get("STRIPE_PRICE_ESSENCIAL") ?? Deno.env.get("STRIPE_PRICE_PLUS") ?? "price_1S3qAKPhFwqSktZsXexQefrx",
  Flex: Deno.env.get("STRIPE_PRICE_FLEX") ?? "",
  Completo: Deno.env.get("STRIPE_PRICE_COMPLETO") ?? "",
  legacy: { [LEGACY_PREMIUM_PRICE]: "Completo" },
};

export const newStripe = () =>
  new Stripe(Deno.env.get("STRIPE_SECRET_KEY") ?? "", {
    apiVersion: "2023-10-16",
    httpClient: Stripe.createFetchHttpClient(),
  });

const isDeleted = (customer: Stripe.Customer | Stripe.DeletedCustomer): customer is Stripe.DeletedCustomer =>
  "deleted" in customer && customer.deleted === true;

/**
 * Cliente do Stripe da pessoa. Antes era buscado só pelo e-mail, o que
 * quebrava quando ela trocava o e-mail da conta (o app passava a não achar a
 * assinatura paga e oferecia assinar de novo). Ordem: o ID já gravado em
 * `subscribers` para o user_id; um cliente com metadata.user_id; o e-mail.
 */
export const findCustomerId = async (
  stripe: Stripe,
  supabase: SupabaseClient,
  user: { id: string; email?: string | null },
): Promise<string | null> => {
  const { data: rows } = await supabase
    .from("subscribers")
    .select("stripe_customer_id")
    .eq("user_id", user.id)
    .not("stripe_customer_id", "is", null)
    .order("updated_at", { ascending: false })
    .limit(1);
  const stored = rows?.[0]?.stripe_customer_id as string | undefined;
  if (stored) {
    try {
      const customer = await stripe.customers.retrieve(stored);
      if (!isDeleted(customer)) return customer.id;
    } catch {
      // Cliente apagado no Stripe ou de outra conta (teste x produção): segue a busca.
    }
  }
  if (!user.email) return null;
  const byEmail = await stripe.customers.list({ email: user.email, limit: 10 });
  const mine = byEmail.data.find((customer: Stripe.Customer) => customer.metadata?.user_id === user.id);
  if (mine) return mine.id;
  // Cliente antigo, sem user_id, com o mesmo e-mail: só se ninguém mais o usa.
  // Antes valia qualquer cliente com o e-mail, inclusive o de OUTRA conta
  // (ex.: alguém que trocou de e-mail e outra pessoa se cadastrou com o
  // antigo), e a pessoa nova passava a usar e cancelar a assinatura alheia.
  for (const customer of byEmail.data as Stripe.Customer[]) {
    if (customer.metadata?.user_id) continue;
    const { data: claimed } = await supabase
      .from("subscribers")
      .select("user_id")
      .eq("stripe_customer_id", customer.id)
      .neq("user_id", user.id)
      .limit(1);
    if (!claimed || claimed.length === 0) return customer.id;
  }
  return null;
};

/** Mantém o e-mail do cliente no Stripe igual ao da conta (recibos e faturas). */
export const syncCustomerEmail = async (stripe: Stripe, customerId: string, user: { id: string; email?: string | null }) => {
  if (!user.email) return;
  const customer = await stripe.customers.retrieve(customerId);
  if (isDeleted(customer)) return;
  if (customer.email !== user.email || customer.metadata?.user_id !== user.id) {
    await stripe.customers.update(customerId, { email: user.email, metadata: { ...customer.metadata, user_id: user.id } });
  }
};

/** Todas as assinaturas do cliente, com a agenda de troca de plano. */
export const listSubscriptions = async (stripe: Stripe, customerId: string) => {
  const result = await stripe.subscriptions.list({ customer: customerId, status: "all", limit: 20, expand: ["data.schedule"] });
  return result.data;
};

export const liveSubscriptions = async (stripe: Stripe, customerId: string) =>
  rankLiveSubscriptions(PLAN_PRICES, await listSubscriptions(stripe, customerId));

/** Desfaz uma troca de plano agendada (a assinatura volta a renovar no plano atual). */
export const releaseSchedule = async (stripe: Stripe, subscription: Stripe.Subscription) => {
  const schedule = subscription.schedule;
  const scheduleId = typeof schedule === "string" ? schedule : schedule?.id;
  if (!scheduleId) return;
  const current = typeof schedule === "string" ? await stripe.subscriptionSchedules.retrieve(scheduleId) : schedule;
  if (current && (current.status === "active" || current.status === "not_started")) {
    await stripe.subscriptionSchedules.release(scheduleId);
  }
};

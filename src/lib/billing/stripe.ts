import "server-only";
import Stripe from "stripe";
import { BRAND } from "../brand";
import { createAdminClient } from "../supabase/server";
import { PREMIUM_PRICING } from "./plans";

// Suscripciones con Stripe Checkout + portal de cliente. Stripe guarda los
// datos de la tarjeta: la plataforma nunca los ve ni los almacena.

let stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

/**
 * Línea de pedido de Premium. Si hay un precio creado en Stripe
 * (STRIPE_PRICE_PREMIUM_MONTHLY / _YEARLY) se usa; si no, el precio se define
 * aquí mismo a partir de `PREMIUM_PRICING`, sin configurar nada en Stripe.
 */
export function premiumLineItem(interval: "month" | "year"): Stripe.Checkout.SessionCreateParams.LineItem {
  const priceId = interval === "month" ? process.env.STRIPE_PRICE_PREMIUM_MONTHLY : process.env.STRIPE_PRICE_PREMIUM_YEARLY;
  if (priceId) return { price: priceId, quantity: 1 };
  const amount = interval === "month" ? PREMIUM_PRICING.monthly : PREMIUM_PRICING.yearly;
  return {
    quantity: 1,
    price_data: {
      currency: PREMIUM_PRICING.currency.toLowerCase(),
      unit_amount: Math.round(amount * 100),
      recurring: { interval },
      tax_behavior: "inclusive",
      product_data: { name: `${BRAND.name} Premium`, description: interval === "year" ? "Suscripción anual" : "Suscripción mensual" },
    },
  };
}

/**
 * Pone al día el plan del usuario consultando a Stripe. Se usa al volver del
 * pago y al abrir «Cuenta», de modo que Premium se activa aunque el webhook
 * todavía no esté configurado (el webhook sigue siendo lo recomendable).
 */
export async function refreshSubscriptions(userId: string, customerId: string | null, sessionId?: string): Promise<void> {
  const client = getStripe();
  if (!client || !createAdminClient()) return;
  try {
    let customer = customerId;
    if (sessionId) {
      const session = await client.checkout.sessions.retrieve(sessionId);
      // La sesión debe ser de este usuario: nadie activa Premium con el pago de otro.
      if (session.client_reference_id !== userId) return;
      customer = typeof session.customer === "string" ? session.customer : (session.customer?.id ?? customer);
    }
    if (!customer) return;
    const list = await client.subscriptions.list({ customer, status: "all", limit: 5 });
    for (const subscription of list.data) {
      await syncSubscription({ ...subscription, metadata: { ...subscription.metadata, user_id: userId } } as Stripe.Subscription);
    }
  } catch (err) {
    console.error("[stripe refresh]", err);
  }
}

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/**
 * Sincroniza una suscripción de Stripe con la base de datos (tabla
 * `subscriptions` y `profiles.plan`). Se ejecuta desde el webhook con la
 * clave secreta de Supabase, único camino por el que cambia el plan.
 */
export async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error("Falta la clave secreta de Supabase: no se puede actualizar el plan.");

  const customerId = typeof subscription.customer === "string" ? subscription.customer : subscription.customer.id;
  let userId = subscription.metadata?.user_id as string | undefined;
  if (!userId) {
    const { data } = await admin.from("profiles").select("id").eq("stripe_customer_id", customerId).maybeSingle();
    userId = data?.id as string | undefined;
  }
  if (!userId) throw new Error(`Suscripción ${subscription.id} sin usuario asociado.`);

  const item = subscription.items.data[0];
  // Según la versión de la API, el fin de periodo está en el item o en la suscripción.
  const periodEnd =
    (item as unknown as { current_period_end?: number })?.current_period_end ??
    (subscription as unknown as { current_period_end?: number }).current_period_end ??
    null;

  await admin.from("subscriptions").upsert({
    id: subscription.id,
    user_id: userId,
    status: subscription.status,
    price_id: item?.price.id ?? null,
    billing_interval: item?.price.recurring?.interval === "year" ? "year" : "month",
    current_period_end: periodEnd ? new Date(periodEnd * 1000).toISOString() : null,
    cancel_at_period_end: subscription.cancel_at_period_end,
  });

  // Premium mientras exista alguna suscripción activa del usuario.
  const { data: active } = await admin
    .from("subscriptions")
    .select("id")
    .eq("user_id", userId)
    .in("status", [...ACTIVE_STATUSES])
    .limit(1);
  await admin
    .from("profiles")
    .update({ plan: active && active.length > 0 ? "premium" : "free", stripe_customer_id: customerId })
    .eq("id", userId);
}

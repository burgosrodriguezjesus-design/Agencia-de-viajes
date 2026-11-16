import "server-only";
import Stripe from "stripe";
import { createAdminClient } from "../supabase/server";

// Suscripciones con Stripe Checkout + portal de cliente. Stripe guarda los
// datos de la tarjeta: la plataforma nunca los ve ni los almacena.

let stripe: Stripe | null = null;

export function getStripe(): Stripe | null {
  if (!process.env.STRIPE_SECRET_KEY) return null;
  stripe ??= new Stripe(process.env.STRIPE_SECRET_KEY);
  return stripe;
}

export function priceIdFor(interval: "month" | "year"): string | null {
  return (
    (interval === "month" ? process.env.STRIPE_PRICE_PREMIUM_MONTHLY : process.env.STRIPE_PRICE_PREMIUM_YEARLY) || null
  );
}

const ACTIVE_STATUSES = new Set(["active", "trialing"]);

/**
 * Sincroniza una suscripción de Stripe con la base de datos (tabla
 * `subscriptions` y `profiles.plan`). Se ejecuta desde el webhook con la
 * clave secreta de Supabase, único camino por el que cambia el plan.
 */
export async function syncSubscription(subscription: Stripe.Subscription): Promise<void> {
  const admin = createAdminClient();
  if (!admin) throw new Error("SUPABASE_SECRET_KEY no configurada: no se puede actualizar el plan.");

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

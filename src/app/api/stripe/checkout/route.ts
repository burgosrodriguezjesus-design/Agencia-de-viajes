import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/brand";
import { getStripe, priceIdFor } from "@/lib/billing/stripe";
import { getProfile, getSessionUser } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

/** Inicia el pago de Premium. El usuario confirma la compra en Stripe. */
export async function POST(request: Request) {
  const form = await request.formData();
  const interval = form.get("interval") === "year" ? "year" : "month";

  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) return NextResponse.redirect(new URL("/login?next=/app/cuenta", SITE_URL), 303);

  const stripe = getStripe();
  const price = priceIdFor(interval);
  if (!stripe || !price) {
    return NextResponse.redirect(new URL("/app/cuenta?pagos=pendiente", SITE_URL), 303);
  }

  const profile = await getProfile(supabase, user.id);
  const session = await stripe.checkout.sessions.create({
    mode: "subscription",
    line_items: [{ price, quantity: 1 }],
    ...(profile?.stripe_customer_id
      ? { customer: profile.stripe_customer_id }
      : { customer_email: user.email ?? undefined }),
    client_reference_id: user.id,
    subscription_data: { metadata: { user_id: user.id } },
    allow_promotion_codes: true,
    billing_address_collection: "auto",
    automatic_tax: { enabled: false },
    consent_collection: { terms_of_service: "none" },
    locale: "es",
    success_url: `${SITE_URL}/app/cuenta?pago=ok`,
    cancel_url: `${SITE_URL}/app/cuenta?pago=cancelado`,
  });
  if (!session.url) return NextResponse.redirect(new URL("/app/cuenta?pagos=error", SITE_URL), 303);
  return NextResponse.redirect(session.url, 303);
}

import { NextResponse } from "next/server";
import { SITE_URL } from "@/lib/brand";
import { getStripe } from "@/lib/billing/stripe";
import { getProfile, getSessionUser } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

/** Portal de Stripe: cambiar de plan, método de pago, facturas y cancelación. */
export async function POST() {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) return NextResponse.redirect(new URL("/login", SITE_URL), 303);
  const stripe = getStripe();
  const profile = await getProfile(supabase, user.id);
  if (!stripe || !profile?.stripe_customer_id) {
    return NextResponse.redirect(new URL("/app/cuenta?pagos=pendiente", SITE_URL), 303);
  }
  const session = await stripe.billingPortal.sessions.create({
    customer: profile.stripe_customer_id,
    return_url: `${SITE_URL}/app/cuenta`,
  });
  return NextResponse.redirect(session.url, 303);
}

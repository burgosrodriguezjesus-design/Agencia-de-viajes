import type Stripe from "stripe";
import { getStripe, syncSubscription } from "@/lib/billing/stripe";

/**
 * Webhook de Stripe: única vía por la que un usuario pasa a Premium o vuelve
 * a Gratis. Se verifica la firma antes de procesar nada.
 */
export async function POST(request: Request) {
  const stripe = getStripe();
  const secret = process.env.STRIPE_WEBHOOK_SECRET;
  const signature = request.headers.get("stripe-signature");
  if (!stripe || !secret) return Response.json({ error: "Stripe no configurado." }, { status: 503 });
  if (!signature) return Response.json({ error: "Falta la firma." }, { status: 400 });

  let event: Stripe.Event;
  try {
    event = await stripe.webhooks.constructEventAsync(await request.text(), signature, secret);
  } catch {
    return Response.json({ error: "Firma no válida." }, { status: 400 });
  }

  try {
    switch (event.type) {
      case "checkout.session.completed": {
        const session = event.data.object;
        if (session.mode === "subscription" && session.subscription) {
          const id = typeof session.subscription === "string" ? session.subscription : session.subscription.id;
          await syncSubscription(await stripe.subscriptions.retrieve(id));
        }
        break;
      }
      case "customer.subscription.created":
      case "customer.subscription.updated":
      case "customer.subscription.deleted":
        await syncSubscription(event.data.object);
        break;
      default:
        break;
    }
  } catch (err) {
    console.error("[stripe webhook]", err);
    // 500 para que Stripe reintente.
    return Response.json({ error: "No se pudo procesar el evento." }, { status: 500 });
  }
  return Response.json({ received: true });
}

import { Download } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { DeleteAccountForm, ProfileForm } from "@/components/account-forms";
import { PricingPlans } from "@/components/pricing-plans";
import { Badge, buttonClass, Card, Notice } from "@/components/ui";
import { PLANS } from "@/lib/billing/plans";
import { refreshSubscriptions } from "@/lib/billing/stripe";
import { getAgentUsage, getProfile } from "@/lib/data";
import { getIntegrationStatus, isStripeConfigured } from "@/lib/providers/status";
import { loadSession } from "@/lib/trip-context";

export const metadata: Metadata = { title: "Cuenta" };

const STATE_LABEL = { active: "Activa", pending: "Pendiente", optional: "Opcional" } as const;
const STATE_TONE = { active: "save", pending: "warn", optional: "neutral" } as const;

export default async function AccountPage({ searchParams }: { searchParams: Promise<{ pago?: string; pagos?: string; session_id?: string }> }) {
  const { supabase, user } = await loadSession();
  const { pago, pagos, session_id } = await searchParams;
  // Pone al día el plan con Stripe (al volver del pago o si ya es cliente).
  const before = await getProfile(supabase, user.id);
  if (session_id || before?.stripe_customer_id) {
    await refreshSubscriptions(user.id, before?.stripe_customer_id ?? null, session_id);
  }
  const profile = session_id || before?.stripe_customer_id ? await getProfile(supabase, user.id) : before;
  const plan = profile?.plan ?? "free";
  const usage = await getAgentUsage(supabase, user.id, plan);
  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("status, billing_interval, current_period_end, cancel_at_period_end")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing", "past_due"])
    .maybeSingle();
  const stripeReady = isStripeConfigured();

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 space-y-8 px-4 py-10 sm:px-6">
      <div>
        <h1 className="font-display text-4xl font-medium tracking-tight">Tu cuenta</h1>
        <p className="mt-1.5 text-muted">{user.email}</p>
      </div>

      {pago === "ok" ? <Notice tone="save">¡Gracias! El pago se ha completado. Tu plan Premium se activa en unos segundos; recarga la página si aún no aparece.</Notice> : null}
      {pago === "cancelado" ? <Notice>Has cancelado el pago. No se ha cobrado nada.</Notice> : null}
      {pagos === "pendiente" ? (
        <Notice tone="warn">
          <strong>Los pagos todavía no están activados.</strong> La suscripción Premium se podrá contratar en cuanto se
          configure Stripe. No se ha cobrado nada.
        </Notice>
      ) : null}
      {pagos === "error" ? <Notice tone="danger">No se pudo iniciar el pago. Inténtalo de nuevo.</Notice> : null}

      <Card className="p-6">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-medium">Plan {PLANS[plan].name}</h2>
            <p className="mt-0.5 text-sm text-muted">
              {subscription
                ? `Facturación ${subscription.billing_interval === "year" ? "anual" : "mensual"}${subscription.current_period_end ? ` · ${subscription.cancel_at_period_end ? "termina" : "se renueva"} el ${new Date(subscription.current_period_end as string).toISOString().slice(0, 10).split("-").reverse().join("/")}` : ""}`
                : "Sin suscripción activa."}
            </p>
          </div>
          <div className="min-w-56">
            <div className="flex items-baseline justify-between text-sm">
              <span className="text-muted">Consultas de IA este mes</span>
              <span className="font-medium tabular-nums">{usage.used} / {usage.limit}</span>
            </div>
            <div className="mt-1.5 h-2 overflow-hidden rounded-full bg-surface-2">
              <div className="h-full rounded-full bg-accent" style={{ width: `${Math.min(100, (usage.used / usage.limit) * 100)}%` }} />
            </div>
          </div>
        </div>
        {!stripeReady && plan === "free" ? (
          <Notice tone="warn" className="mt-5">
            Pagos pendientes de activar: el botón de Premium te avisará de que aún no se puede contratar.
          </Notice>
        ) : null}
        <div className="mt-8">
          <PricingPlans checkout currentPlan={plan} />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-2xl font-medium">Perfil</h2>
        <div className="mt-5">
          <ProfileForm fullName={profile?.full_name ?? ""} homeCity={profile?.home_city ?? ""} marketing={profile?.marketing_consent ?? false} />
        </div>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-2xl font-medium">Estado de las integraciones</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Qué servicios externos están conectados en esta instalación. Lo que figura como pendiente no se simula: la
          función correspondiente aparece desactivada o etiquetada.
        </p>
        <ul className="mt-5 divide-y divide-line">
          {getIntegrationStatus().map((integration) => (
            <li key={integration.id} className="flex flex-wrap items-start justify-between gap-x-6 gap-y-1 py-3.5">
              <div className="min-w-0 flex-1 basis-72">
                <p className="font-medium">{integration.name}</p>
                <p className="text-sm text-muted">{integration.purpose}</p>
                <p className="mt-1 text-xs leading-relaxed text-muted">{integration.detail}</p>
              </div>
              <Badge tone={STATE_TONE[integration.state]}>{STATE_LABEL[integration.state]}</Badge>
            </li>
          ))}
        </ul>
      </Card>

      <Card className="p-6">
        <h2 className="font-display text-2xl font-medium">Tus datos</h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Son tuyos. Puedes descargarlos o eliminarlos cuando quieras. Más detalles en la{" "}
          <Link href="/legal/privacidad" className="text-ink underline underline-offset-4">política de privacidad</Link>.
        </p>
        <div className="mt-5 flex flex-wrap gap-3">
          <a href="/api/account/export" className={buttonClass("secondary")}>
            <Download className="size-4" aria-hidden /> Descargar mis datos (JSON)
          </a>
        </div>
        <div className="mt-6 border-t border-line pt-6">
          <DeleteAccountForm />
        </div>
      </Card>
    </main>
  );
}

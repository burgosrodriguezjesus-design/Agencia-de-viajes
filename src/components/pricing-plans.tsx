"use client";

import { Check } from "lucide-react";
import { useState } from "react";
import { PLANS, PREMIUM_PRICING, yearlySavingPercent } from "@/lib/billing/plans";
import { formatMoney } from "@/lib/domain/money";
import { Badge, Button, ButtonLink, cn } from "./ui";

/**
 * Planes Gratis y Premium con selector mensual/anual.
 * `checkout` activa el botón de pago real (dentro de la cuenta del usuario).
 */
export function PricingPlans({ checkout = false, currentPlan }: { checkout?: boolean; currentPlan?: "free" | "premium" }) {
  const [interval, setInterval] = useState<"month" | "year">("year");
  const price = interval === "month" ? PREMIUM_PRICING.monthly : PREMIUM_PRICING.yearly / 12;

  return (
    <div>
      <div className="mb-8 flex justify-center">
        <div className="inline-flex rounded-full border border-line bg-surface p-1 text-sm" role="group" aria-label="Periodo de facturación">
          {(["month", "year"] as const).map((value) => (
            <button
              key={value}
              type="button"
              onClick={() => setInterval(value)}
              aria-pressed={interval === value}
              className={cn(
                "flex items-center gap-2 rounded-full px-4 py-1.5 font-medium transition",
                interval === value ? "bg-ink text-bg" : "text-muted hover:text-ink",
              )}
            >
              {value === "month" ? "Mensual" : "Anual"}
              {value === "year" ? (
                <span className={cn("rounded-full px-1.5 py-0.5 text-[11px]", interval === "year" ? "bg-bg/15" : "bg-save-soft text-save")}>
                  −{yearlySavingPercent()}%
                </span>
              ) : null}
            </button>
          ))}
        </div>
      </div>

      <div className="mx-auto grid max-w-4xl gap-5 md:grid-cols-2">
        <div className="flex flex-col rounded-3xl border border-line bg-surface p-7">
          <h3 className="font-display text-2xl font-medium">{PLANS.free.name}</h3>
          <p className="mt-1 text-sm text-muted">Para organizar tu próximo viaje.</p>
          <p className="mt-6 flex items-baseline gap-1.5">
            <span className="font-display text-5xl font-medium tracking-tight">0 €</span>
            <span className="text-sm text-muted">para siempre</span>
          </p>
          <FeatureList features={PLANS.free.features} />
          <div className="mt-auto pt-7">
            {checkout ? (
              <Button variant="secondary" disabled className="w-full">
                {currentPlan === "free" ? "Tu plan actual" : "Incluido"}
              </Button>
            ) : (
              <ButtonLink href="/registro" variant="secondary" className="w-full">
                Empezar gratis
              </ButtonLink>
            )}
          </div>
        </div>

        <div className="relative flex flex-col rounded-3xl border border-ink bg-ink p-7 text-bg shadow-float">
          <div className="flex items-center justify-between">
            <h3 className="font-display text-2xl font-medium">{PLANS.premium.name}</h3>
            <Badge className="bg-bg/15 text-bg">Todos los agentes</Badge>
          </div>
          <p className="mt-1 text-sm opacity-70">Para quien viaja varias veces al año.</p>
          <p className="mt-6 flex items-baseline gap-1.5">
            <span className="font-display text-5xl font-medium tracking-tight">{formatMoney(price)}</span>
            <span className="text-sm opacity-70">/ mes</span>
          </p>
          <p className="mt-1 h-5 text-xs opacity-70">
            {interval === "year"
              ? `${formatMoney(PREMIUM_PRICING.yearly)} facturados una vez al año. IVA incluido.`
              : "Facturación mensual. IVA incluido. Cancela cuando quieras."}
          </p>
          <FeatureList features={PLANS.premium.features} inverted />
          <div className="mt-auto pt-7">
            {checkout ? (
              currentPlan === "premium" ? (
                <form action="/api/stripe/portal" method="post">
                  <button className="h-10 w-full rounded-full bg-bg text-sm font-medium text-ink transition hover:opacity-90">
                    Gestionar suscripción
                  </button>
                </form>
              ) : (
                <form action="/api/stripe/checkout" method="post">
                  <input type="hidden" name="interval" value={interval} />
                  <button className="h-10 w-full rounded-full bg-bg text-sm font-medium text-ink transition hover:opacity-90">
                    Pasar a Premium
                  </button>
                </form>
              )
            ) : (
              <ButtonLink href="/registro?next=/app/cuenta" className="w-full bg-bg! text-ink!">
                Probar Premium
              </ButtonLink>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}

function FeatureList({ features, inverted = false }: { features: string[]; inverted?: boolean }) {
  return (
    <ul className="mt-6 space-y-2.5 text-sm">
      {features.map((feature) => (
        <li key={feature} className="flex gap-2.5">
          <Check className={cn("mt-0.5 size-4 shrink-0", inverted ? "opacity-80" : "text-accent")} aria-hidden />
          <span className={inverted ? "opacity-90" : "text-ink"}>{feature}</span>
        </li>
      ))}
    </ul>
  );
}

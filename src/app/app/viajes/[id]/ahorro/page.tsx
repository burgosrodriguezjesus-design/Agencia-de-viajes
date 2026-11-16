import { ArrowRight } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AskAssistantButton } from "@/components/assistant-panel";
import { BudgetBar } from "@/components/budget-bar";
import { SuggestionActions } from "@/components/suggestion-actions";
import { Badge, Card, EmptyState, Notice, PriceBadge } from "@/components/ui";
import { canUseAgent } from "@/lib/billing/plans";
import { BUDGET_CATEGORY_LABEL, buildBudget, formatMoney, isConfirmed, type BudgetCategory } from "@/lib/domain/money";
import { OPTION_CATEGORY_LABEL, type OptionCategory, type Tier, type TripOption } from "@/lib/domain/types";
import { loadBundle, loadTrip } from "@/lib/trip-context";

export const metadata: Metadata = { title: "Ahorro" };

const CATEGORIES: OptionCategory[] = ["flight", "hotel", "transport", "activity", "restaurant"];
const CATEGORY_HREF: Partial<Record<OptionCategory, string>> = { flight: "vuelos", hotel: "hoteles", activity: "experiencias", restaurant: "experiencias" };

function Cell({ option, fallback }: { option?: TripOption; fallback: string }) {
  if (!option || option.price_amount === null) return <span className="text-sm text-muted">{fallback}</span>;
  return (
    <div>
      <p className="font-medium tabular-nums">{formatMoney(option.price_amount, option.price_currency)}</p>
      <p className="max-w-44 truncate text-xs text-muted" title={option.title}>{option.title}</p>
      <div className="mt-1">
        <PriceBadge status={option.price_status} source={option.price_source} />
      </div>
    </div>
  );
}

export default async function SavingsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ trip, plan }, bundle] = await Promise.all([loadTrip(id), loadBundle(id)]);
  const summary = buildBudget(trip, bundle.items, bundle.options);
  const base = `/app/viajes/${id}`;

  const open = bundle.suggestions.filter((s) => s.status === "proposed");
  const applied = bundle.suggestions.filter((s) => s.status === "applied");
  const saving = (list: typeof open, basis: "verified" | "estimate") =>
    list.filter((s) => s.basis === basis).reduce((sum, s) => sum + ((s.current_amount ?? 0) - (s.proposed_amount ?? 0)), 0);
  const verifiedSaving = saving(open, "verified");
  const estimatedSaving = saving(open, "estimate");
  const hasComparison = open.length > 0;

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-medium">Ahorro y presupuesto</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Cuánto cuesta el viaje de verdad y dónde se puede gastar menos. Solo mostramos un ahorro cuando hay dos
            precios que comparar, y decimos si son verificados o estimados.
          </p>
        </div>
        {canUseAgent(plan, "presupuesto") ? (
          <AskAssistantButton message="Quiero gastar menos en este viaje. Analiza el presupuesto completo, completa las partidas que falten y registra propuestas de ahorro concretas con su comparación.">
            Optimizar con IA
          </AskAssistantButton>
        ) : null}
      </div>

      {!canUseAgent(plan, "presupuesto") ? (
        <Notice>
          El optimizador de presupuesto forma parte del plan Premium. En el plan gratuito ves el coste total y el
          comparador con los precios que tú guardes. <Link href="/app/cuenta" className="font-medium underline underline-offset-4">Ver Premium</Link>
        </Notice>
      ) : null}

      {/* 5. Coste total estimado + inicial frente a optimizado */}
      <div className="grid gap-5 lg:grid-cols-2">
        <Card className="p-6">
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">
            {summary.isEstimate ? "Coste total estimado del viaje" : "Coste total confirmado del viaje"}
          </p>
          <p className="mt-1 font-display text-5xl font-medium tracking-tight tabular-nums">{formatMoney(summary.total, trip.currency)}</p>
          <p className="mt-1 text-sm text-muted">
            Incluye lo que has elegido y lo programado en el itinerario.
            {trip.budget_total !== null ? ` Presupuesto: ${formatMoney(trip.budget_total, trip.currency)}.` : ""}
          </p>
          <BudgetBar summary={summary} className="mt-5" />
          <table className="mt-6 w-full text-sm">
            <thead>
              <tr className="text-left text-xs text-muted">
                <th className="pb-2 font-medium">Partida</th>
                <th className="pb-2 text-right font-medium">Confirmado</th>
                <th className="pb-2 text-right font-medium">Estimado</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {(Object.keys(summary.byCategory) as BudgetCategory[]).map((category) => {
                const row = summary.byCategory[category];
                return (
                  <tr key={category}>
                    <td className="py-2.5">
                      {BUDGET_CATEGORY_LABEL[category]}
                      {row.missing > 0 ? <span className="ml-2 text-xs text-muted">({row.missing} sin precio)</span> : null}
                    </td>
                    <td className="py-2.5 text-right tabular-nums">{row.confirmed > 0 ? formatMoney(row.confirmed, trip.currency) : "—"}</td>
                    <td className="py-2.5 text-right text-warn tabular-nums">{row.estimated > 0 ? formatMoney(row.estimated, trip.currency) : "—"}</td>
                  </tr>
                );
              })}
            </tbody>
          </table>
          {summary.byCategory.flight.confirmed + summary.byCategory.flight.estimated === 0 || summary.byCategory.hotel.confirmed + summary.byCategory.hotel.estimated === 0 ? (
            <p className="mt-4 text-xs leading-relaxed text-muted">
              Falta elegir {summary.byCategory.flight.confirmed + summary.byCategory.flight.estimated === 0 ? "vuelo" : ""}
              {summary.byCategory.flight.confirmed + summary.byCategory.flight.estimated === 0 && summary.byCategory.hotel.confirmed + summary.byCategory.hotel.estimated === 0 ? " y " : ""}
              {summary.byCategory.hotel.confirmed + summary.byCategory.hotel.estimated === 0 ? "alojamiento" : ""}: el total todavía no los incluye.
            </p>
          ) : null}
        </Card>

        <Card className="flex flex-col p-6">
          <p className="text-xs font-semibold tracking-wider text-muted uppercase">Presupuesto actual frente a optimizado</p>
          {hasComparison ? (
            <>
              <div className="mt-4 grid grid-cols-[1fr_auto_1fr] items-center gap-3">
                <div>
                  <p className="text-xs text-muted">Actual</p>
                  <p className="font-display text-3xl font-medium tabular-nums">{formatMoney(summary.total, trip.currency)}</p>
                </div>
                <ArrowRight className="size-5 text-muted" aria-hidden />
                <div>
                  <p className="text-xs text-muted">Si aplicas las propuestas</p>
                  <p className="font-display text-3xl font-medium text-save tabular-nums">
                    {formatMoney(Math.max(0, summary.total - verifiedSaving - estimatedSaving), trip.currency)}
                  </p>
                </div>
              </div>
              <dl className="mt-6 space-y-2 text-sm">
                <div className="flex items-center justify-between rounded-xl bg-save-soft px-4 py-3">
                  <dt>Ahorro con precios verificados</dt>
                  <dd className="font-semibold text-save tabular-nums">{verifiedSaving > 0 ? `−${formatMoney(verifiedSaving, trip.currency)}` : "—"}</dd>
                </div>
                <div className="flex items-center justify-between rounded-xl bg-warn-soft px-4 py-3">
                  <dt>Ahorro estimado (sin verificar)</dt>
                  <dd className="font-semibold text-warn tabular-nums">{estimatedSaving > 0 ? `−${formatMoney(estimatedSaving, trip.currency)}` : "—"}</dd>
                </div>
              </dl>
              <p className="mt-auto pt-4 text-xs leading-relaxed text-muted">
                El ahorro estimado compara cifras orientativas: confírmalo en el proveedor antes de darlo por hecho.
              </p>
            </>
          ) : (
            <div className="my-auto py-6 text-center">
              <p className="font-display text-xl font-medium">Todavía no hay comparaciones</p>
              <p className="mx-auto mt-2 max-w-sm text-sm leading-relaxed text-muted">
                No mostramos ahorros sin una comparación real. Guarda al menos dos opciones de vuelo u hotel, o pide al
                optimizador que analice el viaje.
              </p>
            </div>
          )}
        </Card>
      </div>

      {/* Propuestas de ahorro */}
      <section>
        <h3 className="font-display text-xl font-medium">Propuestas de ahorro</h3>
        {open.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="Sin propuestas pendientes">
              Cuando el optimizador encuentre una alternativa más barata, aparecerá aquí con su precio actual, el
              alternativo y lo que cambia.
            </EmptyState>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {open.map((s) => {
              const diff = (s.current_amount ?? 0) - (s.proposed_amount ?? 0);
              return (
                <li key={s.id} className="rounded-2xl border border-line bg-surface p-5">
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <Badge>{BUDGET_CATEGORY_LABEL[s.category as BudgetCategory] ?? s.category}</Badge>
                        <Badge tone={s.basis === "verified" ? "save" : "warn"}>
                          {s.basis === "verified" ? "Comparación verificada" : "Comparación estimada"}
                        </Badge>
                      </div>
                      <p className="mt-2 font-medium">{s.title}</p>
                      {s.detail ? <p className="mt-1 text-sm leading-relaxed text-muted">{s.detail}</p> : null}
                    </div>
                    <div className="text-right">
                      <p className="text-sm text-muted tabular-nums">
                        <span className="line-through">{formatMoney(s.current_amount, s.currency)}</span>
                        <ArrowRight className="mx-1.5 inline size-3.5" aria-hidden />
                        <span className="font-medium text-ink">{formatMoney(s.proposed_amount, s.currency)}</span>
                      </p>
                      <p className={s.basis === "verified" ? "font-display text-2xl font-medium text-save tabular-nums" : "font-display text-2xl font-medium text-warn tabular-nums"}>
                        −{formatMoney(diff, s.currency)}
                      </p>
                    </div>
                  </div>
                  <div className="mt-4 border-t border-line pt-3">
                    <SuggestionActions tripId={id} id={s.id} title={s.title} status={s.status} />
                  </div>
                </li>
              );
            })}
          </ul>
        )}
        {applied.length > 0 ? (
          <p className="mt-3 text-sm text-muted">
            {applied.length} {applied.length === 1 ? "propuesta marcada como aplicada" : "propuestas marcadas como aplicadas"}: {applied.map((s) => s.title).join(" · ")}
          </p>
        ) : null}
      </section>

      {/* Comparador por categoría: 1 económico · 2 calidad-precio · 3 premium · 4 diferencia */}
      <section>
        <h3 className="font-display text-xl font-medium">Comparador</h3>
        <p className="mt-1 max-w-2xl text-sm text-muted">
          Para cada partida, la alternativa más económica con precio confirmado, la de mejor relación calidad-precio y la premium.
        </p>
        <div className="scroll-quiet mt-4 overflow-x-auto rounded-2xl border border-line bg-surface">
          <table className="w-full min-w-[46rem] text-left">
            <thead>
              <tr className="border-b border-line text-xs text-muted">
                <th className="px-5 py-3 font-medium">Partida</th>
                <th className="px-5 py-3 font-medium">Más económico confirmado</th>
                <th className="px-5 py-3 font-medium">Mejor calidad-precio</th>
                <th className="px-5 py-3 font-medium">Premium</th>
                <th className="px-5 py-3 text-right font-medium">Diferencia</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-line">
              {CATEGORIES.map((category) => {
                const options = bundle.options.filter((o) => o.category === category);
                const byTier = (tier: Tier) => options.find((o) => o.tier === tier);
                const cheapestConfirmed = options
                  .filter((o) => o.price_amount !== null && isConfirmed(o.price_status))
                  .sort((a, b) => a.price_amount! - b.price_amount!)[0];
                const premium = byTier("premium");
                const reference = cheapestConfirmed ?? byTier("cheapest");
                const diff =
                  reference && premium && reference.price_amount !== null && premium.price_amount !== null && reference.id !== premium.id
                    ? premium.price_amount - reference.price_amount
                    : null;
                const bothConfirmed = reference && premium ? isConfirmed(reference.price_status) && isConfirmed(premium.price_status) : false;
                return (
                  <tr key={category} className="align-top">
                    <th scope="row" className="px-5 py-4 font-medium">
                      {CATEGORY_HREF[category] ? (
                        <Link href={`${base}/${CATEGORY_HREF[category]}`} className="underline-offset-4 hover:underline">
                          {OPTION_CATEGORY_LABEL[category]}
                        </Link>
                      ) : (
                        OPTION_CATEGORY_LABEL[category]
                      )}
                      <span className="block text-xs font-normal text-muted">{options.length} {options.length === 1 ? "opción" : "opciones"}</span>
                    </th>
                    <td className="px-5 py-4">
                      <Cell option={cheapestConfirmed} fallback={options.length === 0 ? "Sin opciones" : "Sin precio confirmado"} />
                    </td>
                    <td className="px-5 py-4"><Cell option={byTier("best_value")} fallback="—" /></td>
                    <td className="px-5 py-4"><Cell option={premium} fallback="—" /></td>
                    <td className="px-5 py-4 text-right">
                      {diff !== null && diff > 0 ? (
                        <>
                          <p className="font-medium tabular-nums">{formatMoney(diff, trip.currency)}</p>
                          <p className="text-xs text-muted">{bothConfirmed ? "entre precios confirmados" : "incluye estimaciones"}</p>
                        </>
                      ) : (
                        <span className="text-sm text-muted">—</span>
                      )}
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
        <p className="mt-3 text-xs leading-relaxed text-muted">
          «Confirmado» = precio devuelto por un proveedor o introducido por ti. Las actividades y comidas del itinerario
          se suman en el coste total; aquí se comparan las alternativas guardadas de cada partida.
        </p>
      </section>
    </div>
  );
}

import { ArrowRight, BedDouble, CloudRain, FileText, Plane, Share2, Sun } from "lucide-react";
import Link from "next/link";
import { AskAssistantButton } from "@/components/assistant-panel";
import { BudgetBar } from "@/components/budget-bar";
import { GenerationRunner } from "@/components/generation-runner";
import { Card, Notice } from "@/components/ui";
import { canUseAgent } from "@/lib/billing/plans";
import { formatDayShort, tripDates } from "@/lib/domain/dates";
import { buildBudget, formatMoney } from "@/lib/domain/money";
import { isAiConfigured } from "@/lib/providers/status";
import { getForecast, type DayForecast } from "@/lib/providers/weather";
import { loadBundle, loadTrip } from "@/lib/trip-context";

export default async function TripOverviewPage({
  params,
  searchParams,
}: {
  params: Promise<{ id: string }>;
  searchParams: Promise<{ generar?: string }>;
}) {
  const { id } = await params;
  const [{ trip, plan, canEdit, supabase }, bundle, { generar }] = await Promise.all([loadTrip(id), loadBundle(id), searchParams]);
  const base = `/app/viajes/${id}`;
  const dates = tripDates(trip.start_date, trip.end_date);
  const scheduled = bundle.items.filter((i) => i.day_date !== null);
  const saved = bundle.items.filter((i) => i.day_date === null);
  const summary = buildBudget(trip, bundle.items, bundle.options);
  const ai = isAiConfigured();
  const isEmpty = bundle.items.length === 0;

  const stages = !ai
    ? ["itinerario"]
    : [
        "experiencias",
        "itinerario",
        ...(canUseAgent(plan, "vuelos") && trip.origin ? ["vuelos"] : []),
        ...(canUseAgent(plan, "hoteles") ? ["hoteles"] : []),
        ...(canUseAgent(plan, "presupuesto") ? ["presupuesto"] : []),
      ];

  let forecast: DayForecast[] = [];
  if (trip.dest_lat !== null && trip.dest_lng !== null) {
    forecast = await getForecast({ lat: trip.dest_lat, lng: trip.dest_lng }, trip.start_date, trip.end_date).catch(() => []);
  }
  const { count: docCount } = await supabase.from("documents").select("id", { count: "exact", head: true }).eq("trip_id", id);

  const flight = bundle.options.find((o) => o.category === "flight" && o.selected);
  const hotel = bundle.options.find((o) => o.category === "hotel" && o.selected);
  const steps = [
    { done: Boolean(flight), icon: Plane, label: flight ? `Vuelo elegido: ${flight.title}` : "Compara y elige vuelo", href: `${base}/vuelos` },
    { done: Boolean(hotel), icon: BedDouble, label: hotel ? `Alojamiento elegido: ${hotel.title}` : "Compara y elige alojamiento", href: `${base}/hoteles` },
    { done: (docCount ?? 0) > 0, icon: FileText, label: (docCount ?? 0) > 0 ? `${docCount} documentos guardados` : "Guarda billetes y confirmaciones", href: `${base}/documentos` },
    { done: false, icon: Share2, label: "Comparte el viaje con quien te acompaña", href: `${base}/compartir` },
  ];

  return (
    <div className="space-y-8">
      {isEmpty && canEdit ? (
        <GenerationRunner tripId={id} autoStart={generar === "1"} aiEnabled={ai} stages={stages} />
      ) : null}

      {!ai && !isEmpty ? (
        <Notice tone="warn">
          Este itinerario se ha creado en <strong>modo básico</strong>: lugares de interés reales (Wikipedia) agrupados
          por cercanía, sin selección ni precios de IA. Los agentes se activan al configurar la clave de la API de Claude.
        </Notice>
      ) : null}

      <div className="grid gap-5 lg:grid-cols-[1.4fr_1fr]">
        <Card className="p-6">
          <div className="flex flex-wrap items-start justify-between gap-3">
            <div>
              <p className="text-xs font-semibold tracking-wider text-muted uppercase">
                {summary.isEstimate ? "Coste total estimado" : "Coste total confirmado"}
              </p>
              <p className="mt-1 font-display text-5xl font-medium tracking-tight tabular-nums">{formatMoney(summary.total, trip.currency)}</p>
              <p className="mt-1 text-sm text-muted">
                {trip.budget_total !== null ? `de un presupuesto de ${formatMoney(trip.budget_total, trip.currency)}` : "Sin presupuesto fijado"}
                {trip.travelers > 1 && summary.total > 0 ? ` · ${formatMoney(summary.total / trip.travelers, trip.currency)} por persona` : ""}
              </p>
            </div>
            <AskAssistantButton message="Quiero gastar menos en este viaje. Revisa el presupuesto completo y dime dónde se puede ahorrar.">
              Optimizar presupuesto
            </AskAssistantButton>
          </div>
          <BudgetBar summary={summary} className="mt-6" />
          <Link href={`${base}/ahorro`} className="mt-5 inline-flex items-center gap-1 text-sm font-medium text-accent underline-offset-4 hover:underline">
            Ver desglose y comparador <ArrowRight className="size-4" aria-hidden />
          </Link>
        </Card>

        <Card className="p-6">
          <h2 className="font-display text-xl font-medium">Siguientes pasos</h2>
          <ul className="mt-4 space-y-1">
            {steps.map((step) => (
              <li key={step.href}>
                <Link href={step.href} className="group flex items-center gap-3 rounded-xl px-2 py-2.5 transition hover:bg-surface-2">
                  <span className={step.done ? "grid size-8 place-items-center rounded-full bg-save-soft text-save" : "grid size-8 place-items-center rounded-full bg-surface-2 text-muted"}>
                    <step.icon className="size-4" aria-hidden />
                  </span>
                  <span className={step.done ? "flex-1 text-sm text-muted" : "flex-1 text-sm font-medium"}>{step.label}</span>
                  <ArrowRight className="size-4 text-muted opacity-0 transition group-hover:opacity-100" aria-hidden />
                </Link>
              </li>
            ))}
          </ul>
        </Card>
      </div>

      <section>
        <div className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h2 className="font-display text-2xl font-medium">Tu viaje día a día</h2>
            <p className="mt-0.5 text-sm text-muted">
              {scheduled.length} planes programados{saved.length > 0 ? ` · ${saved.length} ideas guardadas` : ""}
            </p>
          </div>
          <Link href={`${base}/itinerario`} className="inline-flex items-center gap-1 text-sm font-medium text-accent underline-offset-4 hover:underline">
            Abrir planificador <ArrowRight className="size-4" aria-hidden />
          </Link>
        </div>
        <ol className="mt-5 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
          {dates.map((date, i) => {
            const items = scheduled.filter((it) => it.day_date === date);
            const day = bundle.days.find((d) => d.day_date === date);
            const weather = forecast.find((f) => f.date === date);
            return (
              <li key={date}>
                <Link href={`${base}/itinerario`} className="block h-full rounded-2xl border border-line bg-surface p-4 transition hover:border-ink/30">
                  <div className="flex items-center justify-between gap-2">
                    <p className="text-xs font-semibold tracking-wider text-accent uppercase">Día {i + 1}</p>
                    {weather ? (
                      <span className="inline-flex items-center gap-1 text-xs text-muted" title={`${weather.summary} · previsión de Open-Meteo`}>
                        {weather.rainy ? <CloudRain className="size-3.5" aria-hidden /> : <Sun className="size-3.5" aria-hidden />}
                        {weather.tempMax}°
                      </span>
                    ) : null}
                  </div>
                  <p className="mt-1 font-medium first-letter:uppercase">{formatDayShort(date)}</p>
                  {day?.title ? <p className="text-sm text-muted">{day.title}</p> : null}
                  <ul className="mt-3 space-y-1 text-sm text-muted">
                    {items.slice(0, 4).map((it) => (
                      <li key={it.id} className="truncate">
                        <span className="mr-1.5 text-xs tabular-nums opacity-70">{it.start_time?.slice(0, 5) ?? "·"}</span>
                        {it.title}
                      </li>
                    ))}
                    {items.length > 4 ? <li className="text-xs">+{items.length - 4} más</li> : null}
                    {items.length === 0 ? <li className="text-xs italic">Día libre</li> : null}
                  </ul>
                </Link>
              </li>
            );
          })}
        </ol>
      </section>
    </div>
  );
}

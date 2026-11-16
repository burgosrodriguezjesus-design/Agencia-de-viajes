import { ExternalLink } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { AskAssistantButton } from "@/components/assistant-panel";
import { AffiliateTag, Badge, EmptyState, PriceBadge } from "@/components/ui";
import { formatDayShort, formatDuration } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import type { ItineraryItem } from "@/lib/domain/types";
import { toLinkViews } from "@/lib/link-views";
import { activityLinks } from "@/lib/providers/links";
import { loadBundle, loadTrip } from "@/lib/trip-context";

export const metadata: Metadata = { title: "Experiencias" };

function ExperienceCard({ item, tripId }: { item: ItineraryItem; tripId: string }) {
  return (
    <li className="flex gap-4 rounded-2xl border border-line bg-surface p-3.5">
      {item.image_url ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={item.image_url} alt="" loading="lazy" className="size-24 shrink-0 rounded-xl object-cover" />
      ) : (
        <div className="grid size-24 shrink-0 place-items-center rounded-xl bg-surface-2 font-display text-3xl text-muted/50">{item.title.slice(0, 1)}</div>
      )}
      <div className="min-w-0 flex-1">
        <p className="font-medium">{item.title}</p>
        <p className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
          <span className="first-letter:uppercase">{item.category ?? (item.kind === "meal" ? "restaurante" : "actividad")}</span>
          <span>· {formatDuration(item.duration_min)}</span>
          {item.indoor ? <span>· a cubierto</span> : null}
          {item.price_status !== "unknown" ? (
            <>
              {item.price_status !== "free" ? <span className="font-medium text-ink tabular-nums">{formatMoney(item.price_amount, item.price_currency)}</span> : null}
              <PriceBadge status={item.price_status} source={item.price_source} />
            </>
          ) : null}
        </p>
        {item.description ? <p className="mt-1.5 line-clamp-2 text-sm leading-relaxed text-muted">{item.description}</p> : null}
        <p className="mt-2 flex flex-wrap items-center gap-3 text-xs">
          <Link href={`/app/viajes/${tripId}/itinerario`} className="font-medium text-accent underline-offset-4 hover:underline">
            {item.day_date ? `Programado: ${formatDayShort(item.day_date)}` : "Sin programar · arrástralo a un día"}
          </Link>
          {item.source_url ? (
            <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-muted hover:text-ink">
              Fuente <ExternalLink className="size-3" aria-hidden />
            </a>
          ) : item.created_by.startsWith("agente:") ? (
            <Badge tone="warn" title="Sugerencia de la IA sin fuente enlazada: confirma que existe y sus horarios">Sin verificar</Badge>
          ) : null}
        </p>
      </div>
    </li>
  );
}

export default async function ExperiencesPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ trip }, bundle] = await Promise.all([loadTrip(id), loadBundle(id)]);
  const activities = bundle.items.filter((i) => i.kind === "activity");
  const meals = bundle.items.filter((i) => i.kind === "meal");
  const free = activities.filter((i) => i.price_status === "free");
  const links = toLinkViews(activityLinks(trip.destination), id);

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-medium">Experiencias</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Todo lo que hay en el viaje: actividades, museos, excursiones y sitios para comer. Los lugares enlazan a su fuente.
          </p>
        </div>
        <AskAssistantButton message="Propón más experiencias para este viaje que encajen con mis preferencias, incluyendo planes gratuitos y un par de restaurantes cerca de lo que ya tengo planificado. Guárdalas como ideas sin programar.">
          Pedir más ideas
        </AskAssistantButton>
      </div>

      {bundle.items.length === 0 ? (
        <EmptyState title="Todavía no hay experiencias">
          Genera el plan desde el Resumen o pide ideas al asistente. También puedes añadirlas a mano en el Itinerario.
        </EmptyState>
      ) : (
        <>
          <section>
            <h3 className="flex items-center gap-2 font-display text-xl font-medium">
              Actividades <Badge>{activities.length}</Badge>
              {free.length > 0 ? <Badge tone="save">{free.length} gratis</Badge> : null}
            </h3>
            <ul className="mt-4 grid gap-3 lg:grid-cols-2">
              {activities.map((item) => (
                <ExperienceCard key={item.id} item={item} tripId={id} />
              ))}
            </ul>
          </section>
          {meals.length > 0 ? (
            <section>
              <h3 className="flex items-center gap-2 font-display text-xl font-medium">
                Restaurantes y comidas <Badge>{meals.length}</Badge>
              </h3>
              <ul className="mt-4 grid gap-3 lg:grid-cols-2">
                {meals.map((item) => (
                  <ExperienceCard key={item.id} item={item} tripId={id} />
                ))}
              </ul>
            </section>
          ) : null}
        </>
      )}

      <section className="rounded-2xl border border-line bg-surface-2/60 p-5">
        <h3 className="font-display text-xl font-medium">Entradas y excursiones en {trip.destination}</h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Consulta precios y disponibilidad reales en los proveedores. Reservas tú directamente con ellos.
        </p>
        <ul className="mt-4 flex flex-wrap gap-2">
          {links.map((link) => (
            <li key={link.provider} className="inline-flex items-center gap-2">
              <a href={link.href} target="_blank" rel="noopener noreferrer nofollow sponsored" className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium transition hover:border-ink/40">
                {link.label} <ExternalLink className="size-3.5" aria-hidden />
              </a>
              {link.isAffiliate ? <AffiliateTag /> : null}
            </li>
          ))}
        </ul>
      </section>
    </div>
  );
}

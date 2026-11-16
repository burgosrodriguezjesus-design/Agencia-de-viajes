import { CalendarDays, Plus, Users } from "lucide-react";
import type { Metadata } from "next";
import Link from "next/link";
import { ButtonLink, EmptyState, Notice } from "@/components/ui";
import { PLANS } from "@/lib/billing/plans";
import { listTrips } from "@/lib/data";
import { formatDateRange, tripDates } from "@/lib/domain/dates";
import { formatMoney } from "@/lib/domain/money";
import { TRIP_TYPES } from "@/lib/domain/types";
import { loadSession } from "@/lib/trip-context";
import { SafeImg } from "@/components/safe-img";

export const metadata: Metadata = { title: "Mis viajes" };

export default async function TripsPage({ searchParams }: { searchParams: Promise<{ aviso?: string }> }) {
  const { supabase, user, plan } = await loadSession();
  const [{ aviso }, trips] = await Promise.all([searchParams, listTrips(supabase)]);
  const own = trips.filter((t) => t.owner_id === user.id);
  const limit = PLANS[plan].maxTrips;
  const atLimit = limit !== null && own.length >= limit;

  return (
    <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-10 sm:px-6">
      <div className="flex flex-wrap items-end justify-between gap-4">
        <div>
          <h1 className="font-display text-4xl font-medium tracking-tight">Mis viajes</h1>
          <p className="mt-1.5 text-muted">Cada viaje tiene su propio espacio: itinerario, opciones, presupuesto y documentos.</p>
        </div>
        {!atLimit ? (
          <ButtonLink href="/app/nuevo" variant="accent">
            <Plus className="size-4" aria-hidden /> Nuevo viaje
          </ButtonLink>
        ) : null}
      </div>

      {aviso === "invitacion-no-valida" ? (
        <Notice tone="warn" className="mt-6">La invitación no es válida o ha caducado. Pide a quien te invitó un enlace nuevo.</Notice>
      ) : null}
      {atLimit ? (
        <Notice className="mt-6">
          El plan gratuito incluye {limit} viaje. Para planificar varios a la vez,{" "}
          <Link href="/app/cuenta" className="font-medium underline underline-offset-4">pasa a Premium</Link>.
        </Notice>
      ) : null}

      {trips.length === 0 ? (
        <div className="mt-10">
          <EmptyState
            title="Aún no tienes ningún viaje"
            action={<ButtonLink href="/app/nuevo" variant="accent">Crear mi primer viaje</ButtonLink>}
          >
            Dinos a dónde quieres ir y tu equipo de agentes preparará un primer plan con lugares reales.
          </EmptyState>
        </div>
      ) : (
        <ul className="mt-8 grid gap-5 sm:grid-cols-2 lg:grid-cols-3">
          {trips.map((trip) => (
            <li key={trip.id}>
              <Link href={`/app/viajes/${trip.id}`} className="group block overflow-hidden rounded-2xl border border-line bg-surface shadow-card transition hover:-translate-y-0.5 hover:shadow-float">
                <div className="relative aspect-[16/9] overflow-hidden bg-surface-2">
                  {trip.cover_image_url ? (
                                        <SafeImg src={trip.cover_image_url} loading="lazy" className="size-full object-cover transition duration-700 group-hover:scale-105" />
                  ) : (
                    <div className="grid size-full place-items-center bg-linear-to-br from-accent-soft to-surface-2 font-display text-5xl text-accent/40">
                      {trip.destination.slice(0, 1)}
                    </div>
                  )}
                  {trip.owner_id !== user.id ? (
                    <span className="absolute top-3 left-3 rounded-full bg-black/60 px-2.5 py-1 text-xs font-medium text-white backdrop-blur">Compartido contigo</span>
                  ) : null}
                </div>
                <div className="p-5">
                  <h2 className="font-display text-2xl leading-tight font-medium">{trip.title}</h2>
                  <p className="mt-0.5 text-sm text-muted">
                    {[trip.destination_country, TRIP_TYPES.find((t) => t.value === trip.trip_type)?.label].filter(Boolean).join(" · ")}
                  </p>
                  <div className="mt-4 flex flex-wrap items-center gap-x-4 gap-y-1 text-sm text-muted">
                    <span className="inline-flex items-center gap-1.5">
                      <CalendarDays className="size-4" aria-hidden />
                      {formatDateRange(trip.start_date, trip.end_date)} · {tripDates(trip.start_date, trip.end_date).length} días
                    </span>
                    <span className="inline-flex items-center gap-1.5">
                      <Users className="size-4" aria-hidden />
                      {trip.travelers}
                    </span>
                    {trip.budget_total !== null ? <span className="tabular-nums">{formatMoney(trip.budget_total, trip.currency)}</span> : null}
                  </div>
                </div>
              </Link>
            </li>
          ))}
        </ul>
      )}
    </main>
  );
}

import { CalendarDays, MapPin, Umbrella, Users } from "lucide-react";
import type { Metadata } from "next";
import { notFound } from "next/navigation";
import { Suspense } from "react";
import { ThemeToggle } from "@/components/client-bits";
import { TripMap } from "@/components/trip-map";
import { ButtonLink, Logo, PriceBadge } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { formatDateRange, formatDayLong, formatDuration, tripDates } from "@/lib/domain/dates";
import { hasCoords } from "@/lib/domain/geo";
import { formatMoney } from "@/lib/domain/money";
import type { ItineraryItem, Trip, TripDay } from "@/lib/domain/types";
import { createClient } from "@/lib/supabase/server";
import { SafeImg } from "@/components/safe-img";

export const metadata: Metadata = { title: "Viaje compartido", robots: { index: false, follow: false } };

type SharedItem = Pick<
  ItineraryItem,
  "id" | "day_date" | "position" | "kind" | "category" | "title" | "description" | "start_time" | "duration_min" | "lat" | "lng" | "source_url" | "image_url" | "price_amount" | "price_currency" | "price_per" | "price_status"
>;

interface SharedTrip {
  trip: Pick<Trip, "title" | "destination" | "destination_country" | "dest_lat" | "dest_lng" | "start_date" | "end_date" | "travelers" | "currency" | "cover_image_url" | "cover_image_credit">;
  days: Pick<TripDay, "day_date" | "title" | "rain_plan">[];
  items: SharedItem[];
}

async function SharedTripView({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[0-9a-f]{48}$/.test(token)) notFound();
  const supabase = await createClient();
  const { data } = await supabase.rpc("get_shared_trip", { p_token: token });
  if (!data) notFound();
  const { trip, days, items } = data as SharedTrip;
  const dates = tripDates(trip.start_date, trip.end_date);
  const points = items.filter(hasCoords).map((i) => ({ id: i.id, lat: i.lat, lng: i.lng, label: i.title, badge: "•" }));

  return (
    <>
      <section className="relative isolate overflow-hidden border-b border-line bg-surface">
        {trip.cover_image_url ? (
          <>
                        <SafeImg src={trip.cover_image_url} className="absolute inset-0 -z-10 size-full object-cover opacity-30" />
            <div className="absolute inset-0 -z-10 bg-linear-to-t from-surface via-surface/80 to-surface/30" />
          </>
        ) : null}
        <div className="mx-auto max-w-5xl px-5 py-14 sm:px-8 sm:py-20">
          <p className="text-xs font-semibold tracking-[0.18em] text-accent uppercase">Itinerario compartido</p>
          <h1 className="mt-3 font-display text-5xl leading-[1.03] font-medium tracking-tight sm:text-6xl">{trip.title}</h1>
          <p className="mt-4 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5"><MapPin className="size-4" aria-hidden />{[trip.destination, trip.destination_country].filter(Boolean).join(", ")}</span>
            <span className="inline-flex items-center gap-1.5"><CalendarDays className="size-4" aria-hidden />{formatDateRange(trip.start_date, trip.end_date)} · {dates.length} días</span>
            <span className="inline-flex items-center gap-1.5"><Users className="size-4" aria-hidden />{trip.travelers}</span>
          </p>
        </div>
      </section>

      <div className="mx-auto grid max-w-5xl gap-8 px-5 py-10 sm:px-8 lg:grid-cols-[1fr_22rem]">
        <ol className="space-y-8">
          {dates.map((date, index) => {
            const day = days.find((d) => d.day_date === date);
            const dayItems = items.filter((i) => i.day_date === date);
            return (
              <li key={date}>
                <p className="text-xs font-semibold tracking-wider text-accent uppercase">Día {index + 1}</p>
                <h2 className="font-display text-2xl font-medium first-letter:uppercase">{formatDayLong(date)}</h2>
                {day?.title ? <p className="text-muted">{day.title}</p> : null}
                {dayItems.length === 0 ? (
                  <p className="mt-3 text-sm text-muted italic">Día libre</p>
                ) : (
                  <ul className="mt-4 space-y-2">
                    {dayItems.map((item) => (
                      <li key={item.id} className="flex gap-3 rounded-xl border border-line bg-surface p-3">
                        <span className="w-12 shrink-0 pt-0.5 text-center">
                          <span className="block text-sm font-semibold tabular-nums">{item.start_time?.slice(0, 5) ?? "—"}</span>
                          <span className="block text-[11px] text-muted">{formatDuration(item.duration_min)}</span>
                        </span>
                        <span className="min-w-0 flex-1">
                          <span className="block font-medium">{item.title}</span>
                          {item.description ? <span className="mt-0.5 block text-sm leading-relaxed text-muted">{item.description}</span> : null}
                          {item.price_status !== "unknown" ? (
                            <span className="mt-1.5 flex items-center gap-2 text-xs">
                              {item.price_status !== "free" ? <span className="tabular-nums">{formatMoney(Number(item.price_amount), item.price_currency)}</span> : null}
                              <PriceBadge status={item.price_status} />
                            </span>
                          ) : null}
                        </span>
                      </li>
                    ))}
                  </ul>
                )}
                {day?.rain_plan ? (
                  <p className="mt-3 flex gap-2 rounded-xl bg-surface-2 px-3 py-2.5 text-sm leading-relaxed text-muted">
                    <Umbrella className="mt-0.5 size-4 shrink-0" aria-hidden />
                    <span><strong className="font-medium text-ink">Si llueve: </strong>{day.rain_plan}</span>
                  </p>
                ) : null}
              </li>
            );
          })}
        </ol>
        <aside className="lg:sticky lg:top-6 lg:self-start">
          <div className="h-80">
            <TripMap points={points} showRoute={false} fallbackCenter={trip.dest_lat !== null && trip.dest_lng !== null ? { lat: trip.dest_lat, lng: trip.dest_lng } : null} />
          </div>
          <div className="mt-5 rounded-2xl border border-line bg-surface p-5">
            <p className="font-display text-xl font-medium">¿Planeas tu propio viaje?</p>
            <p className="mt-1 text-sm leading-relaxed text-muted">Un equipo de agentes de IA te prepara el itinerario y te ayuda a gastar menos.</p>
            <ButtonLink href="/" variant="accent" className="mt-4 w-full">Probar {BRAND.name} gratis</ButtonLink>
          </div>
          {trip.cover_image_credit ? <p className="mt-3 text-[11px] text-muted">{trip.cover_image_credit}</p> : null}
        </aside>
      </div>
    </>
  );
}

export default function SharedTripPage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <div className="min-h-dvh">
      <header className="border-b border-line">
        <div className="mx-auto flex h-16 max-w-5xl items-center justify-between px-5 sm:px-8">
          <Logo />
          <ThemeToggle />
        </div>
      </header>
      <Suspense fallback={<div className="mx-auto h-96 max-w-5xl animate-pulse-soft px-5 py-14" aria-busy="true" />}>
        <SharedTripView params={params} />
      </Suspense>
    </div>
  );
}

import "server-only";
import { normalizeItem, normalizeOption } from "./data";
import { tripDates } from "./domain/dates";
import { isConfirmed, pickTiers, toRankable } from "./domain/money";
import { optimizeDayOrder, PACE_CONFIG, scheduleDay } from "./domain/schedule";
import type { ItineraryItem, OptionCategory, Tier, Trip, TripOption } from "./domain/types";
import type { FlightOffer } from "./providers/flights";
import type { HotelOffer } from "./providers/hotels";
import { flightLinks, hotelLinks } from "./providers/links";
import type { ServerSupabase } from "./supabase/server";

// Operaciones sobre un viaje compartidas por las acciones de la interfaz y
// por las herramientas de los agentes. Siempre con el cliente del usuario.

function check<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

/** Crea las filas de día que falten para las fechas del viaje. */
export async function ensureDays(supabase: ServerSupabase, trip: Pick<Trip, "id" | "start_date" | "end_date">) {
  const rows = tripDates(trip.start_date, trip.end_date).map((day_date) => ({ trip_id: trip.id, day_date }));
  if (rows.length === 0) return;
  check(await supabase.from("trip_days").upsert(rows, { onConflict: "trip_id,day_date", ignoreDuplicates: true }));
}

export async function getDayItems(supabase: ServerSupabase, tripId: string, dayDate: string): Promise<ItineraryItem[]> {
  const data = check(
    await supabase
      .from("itinerary_items")
      .select("*")
      .eq("trip_id", tripId)
      .eq("day_date", dayDate)
      .order("position"),
  );
  return ((data ?? []) as ItineraryItem[]).map(normalizeItem);
}

export type NewItem = Partial<Omit<ItineraryItem, "id" | "trip_id" | "position">> & { title: string };

/** Inserta elementos al final de su día (o en "guardados" si day_date es null). */
export async function appendItems(supabase: ServerSupabase, tripId: string, items: NewItem[]): Promise<ItineraryItem[]> {
  if (items.length === 0) return [];
  const existing = check(
    await supabase.from("itinerary_items").select("day_date, position").eq("trip_id", tripId),
  ) as { day_date: string | null; position: number }[];
  const next = new Map<string, number>();
  for (const row of existing ?? []) {
    const key = row.day_date ?? "saved";
    next.set(key, Math.max(next.get(key) ?? 0, row.position + 1));
  }
  const rows = items.map((item) => {
    const key = item.day_date ?? "saved";
    const position = next.get(key) ?? 0;
    next.set(key, position + 1);
    return { ...item, trip_id: tripId, position };
  });
  const data = check(await supabase.from("itinerary_items").insert(rows).select("*"));
  return ((data ?? []) as ItineraryItem[]).map(normalizeItem);
}

/**
 * Reordena (opcionalmente optimizando la ruta) y recalcula los horarios de un
 * día. Devuelve el día ya organizado con los trayectos aproximados.
 */
export async function organizeDay(
  supabase: ServerSupabase,
  trip: Pick<Trip, "id" | "pace">,
  dayDate: string,
  opts: { optimize?: boolean; dayStart?: string; order?: string[] } = {},
) {
  let items = await getDayItems(supabase, trip.id, dayDate);
  if (opts.order) {
    const rank = new Map(opts.order.map((id, i) => [id, i]));
    items = items
      .slice()
      .sort((a, b) => (rank.get(a.id) ?? 1e6 + a.position) - (rank.get(b.id) ?? 1e6 + b.position));
  }
  if (opts.optimize) items = optimizeDayOrder(items);
  const pace = PACE_CONFIG[trip.pace];
  const scheduled = scheduleDay(items, { dayStart: opts.dayStart ?? pace.dayStart, buffer: pace.buffer });
  await Promise.all(
    scheduled.map((entry, position) =>
      supabase
        .from("itinerary_items")
        .update({ position, start_time: entry.start_time })
        .eq("id", entry.item.id)
        .eq("trip_id", trip.id)
        .then(check),
    ),
  );
  return scheduled;
}

/** Marca una opción como elegida. Vuelo y hotel son de selección única. */
export async function selectOption(supabase: ServerSupabase, tripId: string, optionId: string, selected = true) {
  const option = check(
    await supabase.from("trip_options").select("id, category").eq("id", optionId).eq("trip_id", tripId).maybeSingle(),
  ) as { id: string; category: OptionCategory } | null;
  if (!option) throw new Error("La opción no existe en este viaje.");
  if (selected && (option.category === "flight" || option.category === "hotel")) {
    check(
      await supabase
        .from("trip_options")
        .update({ selected: false })
        .eq("trip_id", tripId)
        .eq("category", option.category)
        .neq("id", optionId),
    );
  }
  check(await supabase.from("trip_options").update({ selected }).eq("id", optionId).eq("trip_id", tripId));
}

/** Recalcula las etiquetas económico / calidad-precio / premium de una categoría. */
export async function assignTiers(supabase: ServerSupabase, tripId: string, category: OptionCategory) {
  const data = check(await supabase.from("trip_options").select("*").eq("trip_id", tripId).eq("category", category));
  const options = ((data ?? []) as TripOption[]).map(normalizeOption);
  const tiers = pickTiers(options.map(toRankable));
  const tierById = new Map<string, Tier>();
  // Si una misma opción gana varias categorías, se queda con la más informativa.
  (["premium", "cheapest", "best_value"] as Tier[]).forEach((tier) => {
    const id = tiers[tier];
    if (id) tierById.set(id, tier);
  });
  await Promise.all(
    options
      .filter((o) => (tierById.get(o.id) ?? null) !== o.tier)
      .map((o) =>
        supabase
          .from("trip_options")
          .update({ tier: tierById.get(o.id) ?? null })
          .eq("id", o.id)
          .eq("trip_id", tripId)
          .then(check),
      ),
  );
}

/** Sustituye las opciones de un proveedor por una nueva tanda verificada. */
async function replaceProviderOptions(
  supabase: ServerSupabase,
  tripId: string,
  category: OptionCategory,
  provider: string,
  rows: Record<string, unknown>[],
): Promise<TripOption[]> {
  check(
    await supabase
      .from("trip_options")
      .delete()
      .eq("trip_id", tripId)
      .eq("category", category)
      .eq("provider", provider)
      .eq("selected", false),
  );
  if (rows.length === 0) return [];
  const data = check(await supabase.from("trip_options").insert(rows).select("*"));
  await assignTiers(supabase, tripId, category);
  return ((data ?? []) as TripOption[]).map(normalizeOption);
}

export async function saveFlightOffers(supabase: ServerSupabase, trip: Trip, offers: FlightOffer[], agent: string) {
  const link = flightLinks(trip)[0];
  const rows = offers.map((o) => ({
    trip_id: trip.id,
    category: "flight",
    title: `${o.airline} · ${o.outbound.origin} → ${o.outbound.destination}`,
    subtitle: o.stops === 0 ? "Directo" : `${o.stops} escala${o.stops > 1 ? "s" : ""}`,
    provider: "Duffel",
    details: {
      airline: o.airline,
      stops: o.stops,
      duration_min: o.durationMin,
      departure: o.outbound.departure,
      arrival: o.outbound.arrival,
      origin_airport: o.outbound.origin,
      destination_airport: o.outbound.destination,
      baggage: o.baggage,
      fees_note: "Precio total para todos los viajeros con tasas incluidas. Extras (asientos, maletas adicionales) aparte.",
    },
    price_amount: o.totalAmount,
    price_currency: o.currency,
    price_status: "verified",
    price_source: "Duffel",
    price_checked_at: o.fetchedAt,
    booking_url: link?.url ?? null,
    is_affiliate: link?.isAffiliate ?? false,
    created_by: agent,
  }));
  return replaceProviderOptions(supabase, trip.id, "flight", "Duffel", rows);
}

export async function saveHotelOffers(supabase: ServerSupabase, trip: Trip, offers: HotelOffer[], agent: string) {
  const rows = offers.map((o) => {
    const link = hotelLinks(trip, `${o.name} ${trip.destination}`)[0];
    return {
      trip_id: trip.id,
      category: "hotel",
      title: o.name,
      subtitle: [o.stars ? `${o.stars}★` : null, o.board, o.address].filter(Boolean).join(" · ") || null,
      provider: "LiteAPI",
      details: {
        rating: o.rating ?? undefined,
        stars: o.stars ?? undefined,
        area: o.address ?? undefined,
        distance_center_km: o.distanceCenterKm ?? undefined,
        board: o.board ?? undefined,
        taxes_note: o.taxesNote,
        conditions: o.refundable === null ? undefined : o.refundable ? "Cancelación gratuita" : "No reembolsable",
        image_url: o.imageUrl ?? undefined,
      },
      price_amount: o.totalAmount,
      price_currency: o.currency,
      price_status: "verified",
      price_source: "LiteAPI",
      price_checked_at: o.fetchedAt,
      booking_url: link.url,
      is_affiliate: link.isAffiliate,
      created_by: agent,
    };
  });
  return replaceProviderOptions(supabase, trip.id, "hotel", "LiteAPI", rows);
}

/**
 * Registra una propuesta de ahorro. Si se indican dos opciones del viaje, los
 * importes se leen de la base de datos y la propuesta solo es "verificada"
 * cuando ambos precios están confirmados; en cualquier otro caso es estimación.
 */
export async function createSuggestion(
  supabase: ServerSupabase,
  trip: Pick<Trip, "id" | "currency">,
  input: {
    category: string;
    title: string;
    detail?: string | null;
    currentAmount?: number | null;
    proposedAmount?: number | null;
    currentOptionId?: string | null;
    proposedOptionId?: string | null;
  },
) {
  let current = input.currentAmount ?? null;
  let proposed = input.proposedAmount ?? null;
  let basis: "verified" | "estimate" = "estimate";
  if (input.currentOptionId && input.proposedOptionId) {
    const data = check(
      await supabase
        .from("trip_options")
        .select("*")
        .eq("trip_id", trip.id)
        .in("id", [input.currentOptionId, input.proposedOptionId]),
    );
    const options = ((data ?? []) as TripOption[]).map(normalizeOption);
    const a = options.find((o) => o.id === input.currentOptionId);
    const b = options.find((o) => o.id === input.proposedOptionId);
    if (a && b && a.price_amount !== null && b.price_amount !== null && a.price_currency === b.price_currency) {
      current = a.price_amount;
      proposed = b.price_amount;
      if (isConfirmed(a.price_status) && isConfirmed(b.price_status)) basis = "verified";
    }
  }
  if (current === null || proposed === null || proposed >= current) {
    throw new Error("No hay una comparación real: se necesitan dos importes y que la alternativa sea más barata.");
  }
  check(
    await supabase.from("budget_suggestions").insert({
      trip_id: trip.id,
      category: input.category,
      title: input.title,
      detail: input.detail ?? null,
      current_amount: current,
      proposed_amount: proposed,
      currency: trip.currency,
      basis,
    }),
  );
  return { ahorro: Math.round((current - proposed) * 100) / 100, base: basis };
}

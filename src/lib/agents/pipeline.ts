import "server-only";
import { canUseAgent } from "../billing/plans";
import { normalizeTrip } from "../data";
import { tripDates } from "../domain/dates";
import { clusterIntoDays } from "../domain/geo";
import { PACE_CONFIG } from "../domain/schedule";
import type { Trip } from "../domain/types";
import { geocode } from "../providers/geocoding";
import { findPois, getDestinationMedia, type Poi } from "../providers/places";
import { isAiConfigured } from "../providers/status";
import { appendItems, ensureDays, organizeDay, type NewItem } from "../trip-ops";
import { runSpecialist } from "./orchestrator";
import { describeAgentError, type AgentContext } from "./runtime";

// Generación inicial del viaje. Los agentes colaboran por etapas a través del
// viaje compartido (patrón "pizarra"):
//
//   preparación ─▶ experiencias ─▶ itinerario ─▶ vuelos ∥ hoteles ─▶ presupuesto
//
// Sin clave de IA se ejecuta el "modo básico": un itinerario algorítmico con
// lugares reales de Wikipedia, agrupados por cercanía y ordenados por ruta.

export interface PipelineResult {
  mode: "ai" | "basic";
  warnings: string[];
}

async function loadTrip(ctx: AgentContext): Promise<Trip> {
  const { data, error } = await ctx.supabase.from("trips").select("*").eq("id", ctx.tripId).single();
  if (error || !data) throw new Error("No se pudo cargar el viaje.");
  return normalizeTrip(data as Trip);
}

/** Coordenadas, país y foto del destino; filas de día. Determinista. */
async function prepareTrip(ctx: AgentContext, warnings: string[]): Promise<Trip> {
  let trip = await loadTrip(ctx);
  const patch: Record<string, unknown> = { status: "planning" };

  if (trip.dest_lat === null || trip.dest_lng === null) {
    try {
      const place = await geocode(trip.destination);
      if (place) {
        patch.dest_lat = place.lat;
        patch.dest_lng = place.lng;
        patch.destination_country = place.country;
        patch.country_code = place.countryCode;
      } else {
        warnings.push("No hemos podido localizar el destino en el mapa. Revisa el nombre de la ciudad.");
      }
    } catch {
      warnings.push("El servicio de mapas no responde ahora mismo; el destino queda sin coordenadas.");
    }
  }
  if (!trip.cover_image_url) {
    const media = await getDestinationMedia(trip.destination).catch(() => null);
    if (media) {
      patch.cover_image_url = media.imageUrl;
      patch.cover_image_credit = media.credit;
    }
  }
  const { error } = await ctx.supabase.from("trips").update(patch).eq("id", trip.id);
  if (error) throw new Error(error.message);
  trip = await loadTrip(ctx);
  await ensureDays(ctx.supabase, trip);
  ctx.emit({ type: "trip_updated" });
  return trip;
}

function describeTrip(trip: Trip): string {
  const days = tripDates(trip.start_date, trip.end_date).length;
  return [
    `Destino: ${trip.destination}${trip.destination_country ? ` (${trip.destination_country})` : ""}.`,
    `Fechas: ${trip.start_date} a ${trip.end_date} (${days} días).`,
    `Viajeros: ${trip.travelers}. Tipo de viaje: ${trip.trip_type}. Ritmo: ${trip.pace}.`,
    trip.budget_total !== null ? `Presupuesto total: ${trip.budget_total} ${trip.currency}.` : "Sin presupuesto fijado.",
    trip.origin ? `Sale desde: ${trip.origin}.` : "",
    trip.preferences ? `Preferencias del viajero: ${trip.preferences}` : "",
  ]
    .filter(Boolean)
    .join("\n");
}

/** Itinerario algorítmico con datos abiertos (sin IA). */
export async function buildBasicPlan(ctx: AgentContext, trip: Trip): Promise<{ created: number }> {
  if (trip.dest_lat === null || trip.dest_lng === null) return { created: 0 };
  const dates = tripDates(trip.start_date, trip.end_date);
  const pace = PACE_CONFIG[trip.pace];
  const wanted = Math.min(40, dates.length * pace.perDay);
  let pois: Poi[] = await findPois({ lat: trip.dest_lat, lng: trip.dest_lng }, { radiusKm: 8, limit: wanted });
  if (pois.length === 0) return { created: 0 };
  pois = pois.slice(0, wanted);

  const assignment = clusterIntoDays(pois, dates.length, pace.perDay);
  const items: NewItem[] = pois.map((poi, i) => ({
    day_date: dates[assignment[i]] ?? dates[0],
    title: poi.title,
    description: poi.description,
    kind: "activity",
    category: "lugar de interés",
    duration_min: 90,
    lat: poi.lat,
    lng: poi.lng,
    place_ref: poi.ref,
    source_url: poi.sourceUrl,
    image_url: poi.imageUrl,
    price_status: "unknown",
    price_currency: trip.currency,
    created_by: "modo-basico",
  }));
  const created = await appendItems(ctx.supabase, trip.id, items);
  ctx.emit({ type: "trip_updated" });
  await Promise.all(dates.map((date) => organizeDay(ctx.supabase, trip, date, { optimize: true })));
  ctx.emit({ type: "trip_updated" });
  return { created: created.length };
}

async function stage(
  ctx: AgentContext,
  warnings: string[],
  id: "experiencias" | "itinerario" | "vuelos" | "hoteles" | "presupuesto",
  task: string,
) {
  try {
    await runSpecialist(id, task, ctx);
  } catch (err) {
    warnings.push(`El agente de ${id} no pudo terminar: ${describeAgentError(err)}`);
  }
}

export async function generateTripPlan(ctx: AgentContext): Promise<PipelineResult> {
  const warnings: string[] = [];
  const trip = await prepareTrip(ctx, warnings);
  const brief = describeTrip(trip);

  if (!isAiConfigured()) {
    ctx.emit({ type: "agent", agent: "itinerario", status: "start", detail: "Itinerario básico (sin IA)" });
    try {
      const { created } = await buildBasicPlan(ctx, trip);
      if (created === 0) warnings.push("No hemos encontrado lugares de interés para este destino en las fuentes abiertas.");
      ctx.emit({ type: "agent", agent: "itinerario", status: "done", detail: "Itinerario básico (sin IA)" });
    } catch (err) {
      ctx.emit({ type: "agent", agent: "itinerario", status: "error", detail: "Itinerario básico (sin IA)" });
      warnings.push(`No se pudo generar el itinerario básico: ${err instanceof Error ? err.message : "error"}`);
    }
    await ctx.supabase.from("trips").update({ status: "ready" }).eq("id", trip.id);
    return { mode: "basic", warnings };
  }

  await stage(
    ctx,
    warnings,
    "experiencias",
    `Acabamos de crear este viaje y está vacío. Selecciona los mejores planes para este viajero y guárdalos como ideas sin programar (dia: null). Cantidad orientativa: los que caben en el viaje a su ritmo, más un pequeño margen para que el arquitecto pueda elegir.\n\n${brief}`,
  );
  await stage(
    ctx,
    warnings,
    "itinerario",
    `El experto en experiencias acaba de guardar ideas sin programar. Constrúyeles un itinerario completo día a día: reparte las ideas, organiza cada día por ruta, pon título a cada día y deja escrito el plan de lluvia. Las ideas que no encajen pueden quedarse guardadas.\n\n${brief}`,
  );

  const premiumStages: Promise<void>[] = [];
  if (canUseAgent(ctx.plan, "vuelos") && trip.origin) {
    premiumStages.push(
      stage(ctx, warnings, "vuelos", `Prepara las opciones de vuelo de este viaje y deja guardadas las alternativas para comparar.\n\n${brief}`),
    );
  }
  if (canUseAgent(ctx.plan, "hoteles")) {
    premiumStages.push(
      stage(ctx, warnings, "hoteles", `Prepara las opciones de alojamiento de este viaje teniendo en cuenta el itinerario ya planificado, y deja guardadas las alternativas para comparar.\n\n${brief}`),
    );
  }
  await Promise.all(premiumStages);

  if (canUseAgent(ctx.plan, "presupuesto")) {
    await stage(
      ctx,
      warnings,
      "presupuesto",
      `El viaje ya tiene itinerario y opciones de vuelo y hotel. Completa las partidas que falten para que el presupuesto sea realista y registra las oportunidades de ahorro que encuentres.\n\n${brief}`,
    );
  }

  await ctx.supabase.from("trips").update({ status: "ready" }).eq("id", trip.id);
  ctx.emit({ type: "trip_updated" });
  return { mode: "ai", warnings };
}

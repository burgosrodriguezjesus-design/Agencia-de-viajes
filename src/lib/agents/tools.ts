import "server-only";
import { z } from "zod";
import { getTripBundle, normalizeTrip } from "../data";
import { isIsoDate, tripDates, tripNights } from "../domain/dates";
import { hasCoords } from "../domain/geo";
import { buildBudget, formatMoney, PRICE_STATUS_LABEL } from "../domain/money";
import { dayTravelTotals } from "../domain/schedule";
import type { ItineraryItem, Trip } from "../domain/types";
import { isFlightSearchConfigured, searchFlights } from "../providers/flights";
import { geocode } from "../providers/geocoding";
import { isHotelSearchConfigured, searchHotels } from "../providers/hotels";
import { activityLinks, flightLinks, hotelLinks, transportLinks } from "../providers/links";
import { findPois, findRestaurants } from "../providers/places";
import { getForecast } from "../providers/weather";
import {
  appendItems,
  assignTiers,
  createSuggestion,
  ensureDays,
  organizeDay,
  saveFlightOffers,
  saveHotelOffers,
  selectOption,
  type NewItem,
} from "../trip-ops";
import { defineTool, type AgentContext } from "./runtime";

// Herramientas de los agentes. Reglas estructurales que NO dependen del prompt:
//  · El modelo no puede crear precios "verificados": su esquema solo admite
//    estimate / free / unknown. Los verificados los escribe el código del
//    proveedor (Duffel, LiteAPI).
//  · El modelo no aporta URLs de reserva: se generan aquí a partir del viaje.
//  · Fuente e imagen de un lugar solo se guardan si vienen de una búsqueda
//    real hecha en esta ejecución (referencia `ref`).
//  · No existe ninguna herramienta de compra o reserva.

/** Lugares devueltos por búsquedas reales durante la ejecución, por referencia. */
const placeCache = new WeakMap<AgentContext, Map<string, KnownPlace>>();

interface KnownPlace {
  title: string;
  lat: number;
  lng: number;
  sourceUrl: string;
  imageUrl: string | null;
  address: string | null;
}

function places(ctx: AgentContext): Map<string, KnownPlace> {
  let map = placeCache.get(ctx);
  if (!map) {
    map = new Map();
    placeCache.set(ctx, map);
  }
  return map;
}

async function loadTrip(ctx: AgentContext): Promise<Trip> {
  const { data, error } = await ctx.supabase.from("trips").select("*").eq("id", ctx.tripId).single();
  if (error || !data) throw new Error("No se pudo cargar el viaje.");
  return normalizeTrip(data as Trip);
}

function ok<T>(result: { data: T; error: { message: string } | null }): T {
  if (result.error) throw new Error(result.error.message);
  return result.data;
}

const isoDate = z.string().regex(/^\d{4}-\d{2}-\d{2}$/, "Formato YYYY-MM-DD");
const hhmm = z.string().regex(/^\d{2}:\d{2}$/, "Formato HH:MM");
const uuid = z.string().uuid();

function assertTripDay(trip: Trip, day: string) {
  if (!isIsoDate(day) || day < trip.start_date || day > trip.end_date) {
    throw new Error(`El día ${day} está fuera del viaje (${trip.start_date} a ${trip.end_date}).`);
  }
}

function describeItemPrice(item: ItineraryItem): string {
  if (item.price_status === "free") return "gratis";
  if (item.price_amount === null) return "sin precio";
  return `${formatMoney(item.price_amount, item.price_currency)}/${item.price_per === "person" ? "persona" : "grupo"} (${PRICE_STATUS_LABEL[item.price_status].toLowerCase()})`;
}

// ── Lectura ─────────────────────────────────────────────────────────────

export const verViaje = defineTool({
  name: "ver_viaje",
  label: "Revisando el viaje",
  description:
    "Devuelve el estado actual y completo del viaje: datos, itinerario por días con identificadores, ideas guardadas, opciones de vuelo/hotel/transporte, presupuesto y propuestas de ahorro. Llámala antes de modificar nada y siempre que necesites datos actualizados.",
  schema: z.object({}),
  run: async (_input, ctx) => {
    const trip = await loadTrip(ctx);
    const bundle = await getTripBundle(ctx.supabase, ctx.tripId);
    const budget = buildBudget(trip, bundle.items, bundle.options);
    const itemView = (i: ItineraryItem) => ({
      id: i.id,
      hora: i.start_time?.slice(0, 5) ?? null,
      titulo: i.title,
      tipo: i.kind,
      categoria: i.category,
      duracion_min: i.duration_min,
      precio: describeItemPrice(i),
      interior: i.indoor,
      tiene_coordenadas: hasCoords(i),
    });
    return {
      viaje: {
        titulo: trip.title,
        destino: trip.destination,
        pais: trip.destination_country,
        codigo_pais: trip.country_code,
        coordenadas: trip.dest_lat !== null ? { lat: trip.dest_lat, lng: trip.dest_lng } : null,
        origen: trip.origin,
        iata_origen: trip.origin_iata,
        iata_destino: trip.dest_iata,
        fecha_inicio: trip.start_date,
        fecha_fin: trip.end_date,
        noches: tripNights(trip.start_date, trip.end_date),
        viajeros: trip.travelers,
        habitaciones: trip.rooms,
        presupuesto_total: trip.budget_total,
        moneda: trip.currency,
        tipo: trip.trip_type,
        ritmo: trip.pace,
        preferencias: trip.preferences,
      },
      dias: tripDates(trip.start_date, trip.end_date).map((date) => {
        const day = bundle.days.find((d) => d.day_date === date);
        return {
          fecha: date,
          titulo: day?.title ?? null,
          plan_lluvia: day?.rain_plan ?? null,
          actividades: bundle.items.filter((i) => i.day_date === date).map(itemView),
        };
      }),
      ideas_guardadas_sin_programar: bundle.items.filter((i) => i.day_date === null).map(itemView),
      opciones: bundle.options.map((o) => ({
        id: o.id,
        categoria: o.category,
        titulo: o.title,
        detalle: o.subtitle,
        precio_total_grupo: o.price_amount,
        moneda: o.price_currency,
        estado_precio: o.price_status,
        fuente: o.price_source,
        nivel: o.tier,
        elegida: o.selected,
        datos: o.details,
      })),
      presupuesto: {
        total_planificado: budget.total,
        del_cual_confirmado: budget.confirmedTotal,
        del_cual_estimado: budget.estimatedTotal,
        conceptos_sin_precio: budget.missingCount,
        restante: budget.remaining,
        por_categoria: budget.byCategory,
        nota: "Los importes estimados no son precios reales. Solo 'verified' y 'user' están confirmados.",
      },
      ahorros_propuestos: bundle.suggestions
        .filter((s) => s.status === "proposed")
        .map((s) => ({ titulo: s.title, actual: s.current_amount, propuesto: s.proposed_amount, base: s.basis })),
      precios_verificados_disponibles: {
        vuelos: isFlightSearchConfigured(),
        hoteles: isHotelSearchConfigured(),
      },
    };
  },
});

export const buscarLugares = defineTool({
  name: "buscar_lugares",
  label: "Buscando lugares de interés",
  description:
    "Busca lugares de interés reales (monumentos, museos, parques, barrios, templos...) cerca de un punto, ordenados por popularidad. Fuente: Wikipedia. Por defecto busca alrededor del destino del viaje. Cada resultado trae una `ref` que debes usar al añadirlo al itinerario. No incluye precios ni horarios.",
  schema: z.object({
    lat: z.number().min(-90).max(90).optional().describe("Latitud del centro; por defecto el destino"),
    lng: z.number().min(-180).max(180).optional(),
    radio_km: z.number().min(0.5).max(10).optional().describe("Radio de búsqueda, máximo 10 km"),
    limite: z.number().int().min(5).max(40).optional(),
  }),
  run: async (input, ctx) => {
    const trip = await loadTrip(ctx);
    const center =
      input.lat !== undefined && input.lng !== undefined
        ? { lat: input.lat, lng: input.lng }
        : trip.dest_lat !== null && trip.dest_lng !== null
          ? { lat: trip.dest_lat, lng: trip.dest_lng }
          : null;
    if (!center) throw new Error("El viaje no tiene coordenadas. Usa primero `geocodificar`.");
    const pois = await findPois(center, { radiusKm: input.radio_km, limit: input.limite ?? 30 });
    const cache = places(ctx);
    pois.forEach((p) =>
      cache.set(p.ref, { title: p.title, lat: p.lat, lng: p.lng, sourceUrl: p.sourceUrl, imageUrl: p.imageUrl, address: null }),
    );
    return pois.map((p) => ({
      ref: p.ref,
      nombre: p.title,
      descripcion: p.description,
      lat: p.lat,
      lng: p.lng,
      km_del_centro: Math.round(p.distanceKm * 10) / 10,
      popularidad: p.popularity,
    }));
  },
});

export const buscarRestaurantes = defineTool({
  name: "buscar_restaurantes",
  label: "Buscando restaurantes",
  description:
    "Busca restaurantes reales cerca de un punto. Fuente: OpenStreetMap. Devuelve nombre, tipo de cocina y `ref`. No incluye precios, valoraciones ni horarios: no los inventes.",
  schema: z.object({
    lat: z.number().min(-90).max(90),
    lng: z.number().min(-180).max(180),
    cocina: z.string().max(40).optional().describe("Filtro de cocina en inglés, p. ej. 'japanese', 'italian'"),
    radio_m: z.number().int().min(200).max(3000).optional(),
  }),
  run: async (input, ctx) => {
    const list = await findRestaurants(
      { lat: input.lat, lng: input.lng },
      { cuisine: input.cocina, radiusM: input.radio_m },
    );
    const cache = places(ctx);
    list.forEach((r) =>
      cache.set(r.ref, { title: r.name, lat: r.lat, lng: r.lng, sourceUrl: r.sourceUrl, imageUrl: null, address: r.address }),
    );
    return list.map((r) => ({
      ref: r.ref,
      nombre: r.name,
      cocina: r.cuisine,
      direccion: r.address,
      metros: Math.round(r.distanceKm * 1000),
    }));
  },
});

export const geocodificar = defineTool({
  name: "geocodificar",
  label: "Localizando en el mapa",
  description: "Obtiene las coordenadas de una ciudad o localidad (no de direcciones ni monumentos).",
  schema: z.object({ lugar: z.string().min(2).max(120) }),
  run: async (input) => {
    const place = await geocode(input.lugar);
    if (!place) return { encontrado: false };
    return { encontrado: true, nombre: place.name, pais: place.country, codigo_pais: place.countryCode, lat: place.lat, lng: place.lng };
  },
});

export const previsionTiempo = defineTool({
  name: "prevision_tiempo",
  label: "Consultando la previsión del tiempo",
  description:
    "Previsión meteorológica real para los días del viaje (Open-Meteo). Solo existe para los próximos 16 días; si el viaje es más lejano devuelve una lista vacía y NO debes suponer el tiempo.",
  schema: z.object({}),
  run: async (_input, ctx) => {
    const trip = await loadTrip(ctx);
    if (trip.dest_lat === null || trip.dest_lng === null) return { dias: [], nota: "Viaje sin coordenadas." };
    const days = await getForecast({ lat: trip.dest_lat, lng: trip.dest_lng }, trip.start_date, trip.end_date);
    return {
      dias: days.map((d) => ({
        fecha: d.date,
        resumen: d.summary,
        max: d.tempMax,
        min: d.tempMin,
        prob_lluvia: d.rainProbability,
        lluvioso: d.rainy,
      })),
      nota: days.length === 0 ? "Aún no hay previsión para estas fechas (solo disponible 16 días antes)." : undefined,
    };
  },
});

// ── Itinerario ──────────────────────────────────────────────────────────

const precioEstimado = z
  .object({
    importe: z.number().min(0).max(100_000).optional().describe("Importe en la moneda del viaje"),
    por: z.enum(["persona", "grupo"]).optional(),
    estado: z
      .enum(["estimate", "free", "unknown"])
      .describe("estimate = estimación tuya; free = gratuito; unknown = no lo sabes. Nunca hay precios verificados aquí."),
  })
  .optional();

const actividadNueva = z.object({
  dia: isoDate.nullable().describe("Fecha del día, o null para guardarla como idea sin programar"),
  titulo: z.string().min(2).max(140),
  descripcion: z.string().max(600).optional().describe("Por qué merece la pena y consejos prácticos"),
  tipo: z.enum(["activity", "meal", "transport", "free_time"]).optional(),
  categoria: z
    .string()
    .max(40)
    .optional()
    .describe("p. ej. museo, monumento, parque, excursión, mercado, restaurante, mirador, barrio, parque temático"),
  duracion_min: z.number().int().min(10).max(720).optional(),
  hora_inicio: hhmm.optional(),
  ref: z.string().max(80).optional().describe("Referencia devuelta por buscar_lugares o buscar_restaurantes"),
  lat: z.number().min(-90).max(90).optional().describe("Solo si no hay ref"),
  lng: z.number().min(-180).max(180).optional(),
  interior: z.boolean().optional().describe("true si es a cubierto (apto para lluvia)"),
  precio: precioEstimado,
});

function toNewItem(a: z.infer<typeof actividadNueva>, trip: Trip, ctx: AgentContext, agent: string): NewItem {
  const known = a.ref ? places(ctx).get(a.ref) : undefined;
  const estado = a.precio?.estado ?? "unknown";
  return {
    day_date: a.dia,
    title: a.titulo,
    description: a.descripcion ?? null,
    kind: a.tipo ?? "activity",
    category: a.categoria ?? null,
    duration_min: a.duracion_min ?? 90,
    start_time: a.hora_inicio ?? null,
    lat: known?.lat ?? a.lat ?? null,
    lng: known?.lng ?? a.lng ?? null,
    address: known?.address ?? null,
    place_ref: known ? a.ref! : null,
    source_url: known?.sourceUrl ?? null,
    image_url: known?.imageUrl ?? null,
    indoor: a.interior ?? null,
    price_amount: estado === "estimate" ? (a.precio?.importe ?? null) : estado === "free" ? 0 : null,
    price_currency: trip.currency,
    price_per: a.precio?.por === "grupo" ? "group" : "person",
    price_status: estado === "estimate" && a.precio?.importe === undefined ? "unknown" : estado,
    price_source: estado === "estimate" ? "Estimación IA" : null,
    created_by: agent,
  };
}

export function anadirActividades(agent: string) {
  return defineTool({
    name: "anadir_actividades",
    label: "Añadiendo planes al itinerario",
    mutates: true,
    description:
      "Añade una o varias actividades, comidas o ideas al viaje en una sola llamada. Usa `ref` siempre que el lugar venga de una búsqueda: así se guardan sus coordenadas, foto y fuente reales. Los precios que indiques son estimaciones y se mostrarán etiquetados como tales.",
    schema: z.object({ actividades: z.array(actividadNueva).min(1).max(40) }),
    run: async (input, ctx) => {
      const trip = await loadTrip(ctx);
      input.actividades.forEach((a) => a.dia && assertTripDay(trip, a.dia));
      await ensureDays(ctx.supabase, trip);
      const created = await appendItems(
        ctx.supabase,
        trip.id,
        input.actividades.map((a) => toNewItem(a, trip, ctx, agent)),
      );
      return { creadas: created.map((i) => ({ id: i.id, titulo: i.title, dia: i.day_date })) };
    },
  });
}

export const actualizarActividad = defineTool({
  name: "actualizar_actividad",
  label: "Actualizando una actividad",
  mutates: true,
  description: "Modifica campos de una actividad existente. Solo se cambian los campos indicados.",
  schema: z.object({
    id: uuid,
    titulo: z.string().min(2).max(140).optional(),
    descripcion: z.string().max(600).optional(),
    duracion_min: z.number().int().min(10).max(720).optional(),
    hora_inicio: hhmm.optional(),
    interior: z.boolean().optional(),
    precio: precioEstimado,
  }),
  run: async (input, ctx) => {
    const trip = await loadTrip(ctx);
    const patch: Record<string, unknown> = {};
    if (input.titulo !== undefined) patch.title = input.titulo;
    if (input.descripcion !== undefined) patch.description = input.descripcion;
    if (input.duracion_min !== undefined) patch.duration_min = input.duracion_min;
    if (input.hora_inicio !== undefined) patch.start_time = input.hora_inicio;
    if (input.interior !== undefined) patch.indoor = input.interior;
    if (input.precio) {
      // Nunca se pisa un precio confirmado por el usuario o por un proveedor.
      const current = ok(
        await ctx.supabase.from("itinerary_items").select("price_status").eq("id", input.id).eq("trip_id", trip.id).maybeSingle(),
      ) as { price_status: string } | null;
      if (current && (current.price_status === "verified" || current.price_status === "user")) {
        throw new Error("Esta actividad tiene un precio confirmado; no se sustituye por una estimación.");
      }
      const estado = input.precio.estado;
      patch.price_status = estado === "estimate" && input.precio.importe === undefined ? "unknown" : estado;
      patch.price_amount = estado === "estimate" ? (input.precio.importe ?? null) : estado === "free" ? 0 : null;
      patch.price_per = input.precio.por === "grupo" ? "group" : "person";
      patch.price_source = estado === "estimate" ? "Estimación IA" : null;
    }
    if (Object.keys(patch).length === 0) return { actualizado: false };
    const data = ok(
      await ctx.supabase.from("itinerary_items").update(patch).eq("id", input.id).eq("trip_id", trip.id).select("id"),
    ) as { id: string }[] | null;
    if (!data || data.length === 0) throw new Error("No existe esa actividad en el viaje.");
    return { actualizado: true };
  },
});

export const eliminarActividades = defineTool({
  name: "eliminar_actividades",
  label: "Quitando actividades",
  mutates: true,
  description: "Elimina actividades del viaje por su id.",
  schema: z.object({ ids: z.array(uuid).min(1).max(60) }),
  run: async (input, ctx) => {
    const data = ok(
      await ctx.supabase.from("itinerary_items").delete().eq("trip_id", ctx.tripId).in("id", input.ids).select("id"),
    ) as { id: string }[] | null;
    return { eliminadas: data?.length ?? 0 };
  },
});

export const moverActividades = defineTool({
  name: "mover_actividades",
  label: "Reorganizando los días",
  mutates: true,
  description:
    "Asigna actividades existentes a un día (o las devuelve a ideas guardadas con dia null). Acepta varias a la vez. Después llama a `organizar_dia` en cada día afectado para ordenar la ruta y recalcular horarios.",
  schema: z.object({
    movimientos: z.array(z.object({ id: uuid, dia: isoDate.nullable() })).min(1).max(60),
  }),
  run: async (input, ctx) => {
    const trip = await loadTrip(ctx);
    input.movimientos.forEach((m) => m.dia && assertTripDay(trip, m.dia));
    await ensureDays(ctx.supabase, trip);
    const existing = ok(
      await ctx.supabase.from("itinerary_items").select("day_date, position").eq("trip_id", trip.id),
    ) as { day_date: string | null; position: number }[];
    const next = new Map<string, number>();
    for (const row of existing ?? []) {
      const key = row.day_date ?? "saved";
      next.set(key, Math.max(next.get(key) ?? 0, row.position + 1));
    }
    let moved = 0;
    for (const m of input.movimientos) {
      const key = m.dia ?? "saved";
      const position = next.get(key) ?? 0;
      next.set(key, position + 1);
      const data = ok(
        await ctx.supabase
          .from("itinerary_items")
          .update({ day_date: m.dia, position, ...(m.dia === null ? { start_time: null } : {}) })
          .eq("id", m.id)
          .eq("trip_id", trip.id)
          .select("id"),
      ) as { id: string }[] | null;
      moved += data?.length ?? 0;
    }
    return { movidas: moved };
  },
});

export const organizarDia = defineTool({
  name: "organizar_dia",
  label: "Optimizando la ruta del día",
  mutates: true,
  description:
    "Ordena un día y recalcula sus horarios y trayectos. Con `optimizar_ruta: true` reordena las actividades para minimizar desplazamientos (algoritmo de ruta más corta). Con `orden` impones tú la secuencia de ids. Devuelve el día resultante con los tiempos de trayecto aproximados entre paradas.",
  schema: z.object({
    dia: isoDate,
    optimizar_ruta: z.boolean().optional(),
    orden: z.array(uuid).max(40).optional().describe("Secuencia de ids deseada; si se indica, se ignora optimizar_ruta"),
    hora_inicio: hhmm.optional().describe("Hora de inicio del día; por defecto según el ritmo del viaje"),
  }),
  run: async (input, ctx) => {
    const trip = await loadTrip(ctx);
    assertTripDay(trip, input.dia);
    const scheduled = await organizeDay(ctx.supabase, trip, input.dia, {
      optimize: input.orden ? false : (input.optimizar_ruta ?? true),
      order: input.orden,
      dayStart: input.hora_inicio,
    });
    const totals = dayTravelTotals(scheduled.map((s) => s.legFromPrev));
    return {
      dia: input.dia,
      paradas: scheduled.map((s) => ({
        id: s.item.id,
        titulo: (s.item as ItineraryItem).title,
        inicio: s.start_time,
        fin: s.end_time,
        trayecto_previo: s.legFromPrev
          ? `${s.legFromPrev.minutes} min ${s.legFromPrev.mode === "walk" ? "a pie" : "en transporte"} (aprox.)`
          : null,
      })),
      desplazamiento_total_min: totals.minutes,
      desplazamiento_total_km: Math.round(totals.km * 10) / 10,
    };
  },
});

export const actualizarDia = defineTool({
  name: "actualizar_dia",
  label: "Anotando el día",
  mutates: true,
  description:
    "Pone título a un día (p. ej. 'Templos del este'), y/o define su plan alternativo para lluvia: qué actividades a cubierto sustituirían a las de exterior.",
  schema: z.object({
    dia: isoDate,
    titulo: z.string().max(80).optional(),
    plan_lluvia: z.string().max(600).optional(),
  }),
  run: async (input, ctx) => {
    const trip = await loadTrip(ctx);
    assertTripDay(trip, input.dia);
    const row: Record<string, unknown> = { trip_id: trip.id, day_date: input.dia };
    if (input.titulo !== undefined) row.title = input.titulo;
    if (input.plan_lluvia !== undefined) row.rain_plan = input.plan_lluvia;
    ok(await ctx.supabase.from("trip_days").upsert(row, { onConflict: "trip_id,day_date" }));
    return { actualizado: true };
  },
});

export const actualizarViaje = defineTool({
  name: "actualizar_viaje",
  label: "Actualizando los datos del viaje",
  mutates: true,
  description:
    "Cambia datos generales del viaje: fechas (para añadir o quitar días), presupuesto, ritmo, número de viajeros, preferencias o los códigos IATA de origen y destino. Si se acortan las fechas, las actividades de los días eliminados pasan a ideas guardadas.",
  schema: z.object({
    titulo: z.string().min(2).max(120).optional(),
    fecha_inicio: isoDate.optional(),
    fecha_fin: isoDate.optional(),
    presupuesto_total: z.number().min(0).max(10_000_000).optional(),
    ritmo: z.enum(["relajado", "equilibrado", "intenso"]).optional(),
    viajeros: z.number().int().min(1).max(20).optional(),
    habitaciones: z.number().int().min(1).max(10).optional(),
    preferencias: z.string().max(1000).optional(),
    iata_origen: z.string().regex(/^[A-Z]{3}$/).optional().describe("Código IATA de aeropuerto o ciudad de salida"),
    iata_destino: z.string().regex(/^[A-Z]{3}$/).optional(),
  }),
  run: async (input, ctx) => {
    const trip = await loadTrip(ctx);
    const start = input.fecha_inicio ?? trip.start_date;
    const end = input.fecha_fin ?? trip.end_date;
    if (!isIsoDate(start) || !isIsoDate(end) || end < start) throw new Error("Fechas no válidas.");
    if (tripNights(start, end) > 60) throw new Error("El viaje no puede superar los 60 días.");
    const patch: Record<string, unknown> = {};
    if (input.titulo !== undefined) patch.title = input.titulo;
    if (input.fecha_inicio !== undefined) patch.start_date = start;
    if (input.fecha_fin !== undefined) patch.end_date = end;
    if (input.presupuesto_total !== undefined) patch.budget_total = input.presupuesto_total;
    if (input.ritmo !== undefined) patch.pace = input.ritmo;
    if (input.viajeros !== undefined) patch.travelers = input.viajeros;
    if (input.habitaciones !== undefined) patch.rooms = input.habitaciones;
    if (input.preferencias !== undefined) patch.preferences = input.preferencias;
    if (input.iata_origen !== undefined) patch.origin_iata = input.iata_origen;
    if (input.iata_destino !== undefined) patch.dest_iata = input.iata_destino;
    if (Object.keys(patch).length === 0) return { actualizado: false };
    ok(await ctx.supabase.from("trips").update(patch).eq("id", trip.id));
    if (patch.start_date || patch.end_date) {
      // Lo que quede fuera del nuevo rango vuelve a "ideas guardadas".
      ok(
        await ctx.supabase
          .from("itinerary_items")
          .update({ day_date: null, start_time: null })
          .eq("trip_id", trip.id)
          .or(`day_date.lt.${start},day_date.gt.${end}`),
      );
      ok(await ctx.supabase.from("trip_days").delete().eq("trip_id", trip.id).or(`day_date.lt.${start},day_date.gt.${end}`));
      await ensureDays(ctx.supabase, { id: trip.id, start_date: start, end_date: end });
    }
    return { actualizado: true, fechas: { inicio: start, fin: end, dias: tripDates(start, end).length } };
  },
});

// ── Vuelos, hoteles y opciones ──────────────────────────────────────────

export function buscarVuelos(agent: string) {
  return defineTool({
    name: "buscar_vuelos",
    label: "Buscando vuelos",
    mutates: true,
    description:
      "Busca vuelos con precio REAL en el proveedor (Duffel) entre dos códigos IATA. Puedes cambiar aeropuertos y fechas para comparar combinaciones. Con `guardar: true` las mejores ofertas se guardan en el viaje como precios verificados. Si el proveedor no está configurado devuelve `precios_verificados: false` y enlaces de búsqueda: en ese caso NO hay precios reales y cualquier cifra que des será una estimación.",
    schema: z.object({
      iata_origen: z.string().regex(/^[A-Z]{3}$/),
      iata_destino: z.string().regex(/^[A-Z]{3}$/),
      fecha_ida: isoDate.optional().describe("Por defecto, el inicio del viaje"),
      fecha_vuelta: isoDate.optional().describe("Por defecto, el fin del viaje"),
      max_escalas: z.number().int().min(0).max(2).optional(),
      guardar: z.boolean().optional().describe("Guardar las ofertas en el viaje (por defecto true)"),
    }),
    run: async (input, ctx) => {
      const trip = await loadTrip(ctx);
      const departureDate = input.fecha_ida ?? trip.start_date;
      const returnDate = input.fecha_vuelta ?? trip.end_date;
      const linkTrip = { ...trip, origin_iata: input.iata_origen, dest_iata: input.iata_destino, start_date: departureDate, end_date: returnDate };
      if (!isFlightSearchConfigured()) {
        return {
          precios_verificados: false,
          motivo: "El proveedor de vuelos no está conectado todavía. No hay precios reales disponibles.",
          enlaces_para_el_usuario: flightLinks(linkTrip).map((l) => ({ proveedor: l.provider, url: l.url })),
        };
      }
      const offers = await searchFlights({
        originIata: input.iata_origen,
        destinationIata: input.iata_destino,
        departureDate,
        returnDate,
        adults: trip.travelers,
        maxConnections: input.max_escalas,
      });
      // Selección variada: las más baratas, la más rápida y la mejor directa.
      const picked = new Map<string, (typeof offers)[number]>();
      offers.slice(0, 4).forEach((o) => picked.set(o.id, o));
      const fastest = offers.slice().sort((a, b) => a.durationMin - b.durationMin)[0];
      const direct = offers.find((o) => o.stops === 0);
      [fastest, direct].forEach((o) => o && picked.set(o.id, o));
      const selection = [...picked.values()];
      const sameDates = departureDate === trip.start_date && returnDate === trip.end_date;
      if ((input.guardar ?? true) && sameDates && selection.length > 0) {
        await saveFlightOffers(ctx.supabase, linkTrip, selection, agent);
      }
      return {
        precios_verificados: true,
        fuente: "Duffel",
        guardadas_en_el_viaje: (input.guardar ?? true) && sameDates,
        total_ofertas: offers.length,
        ofertas: selection.map((o) => ({
          aerolinea: o.airline,
          precio_total_grupo: o.totalAmount,
          moneda: o.currency,
          escalas: o.stops,
          duracion_total_min: o.durationMin,
          salida: o.outbound.departure,
          equipaje: o.baggage,
        })),
      };
    },
  });
}

export function buscarHoteles(agent: string) {
  return defineTool({
    name: "buscar_hoteles",
    label: "Buscando alojamiento",
    mutates: true,
    description:
      "Busca alojamientos con precio REAL en el proveedor (LiteAPI) para las fechas y ocupación del viaje. Devuelve precio total de la estancia, valoración, distancia al centro e impuestos. Con `guardar: true` se guardan en el viaje como precios verificados. Si el proveedor no está configurado devuelve `precios_verificados: false` y enlaces de búsqueda: no hay precios reales.",
    schema: z.object({
      ciudad: z.string().min(2).max(80).optional().describe("Por defecto, el destino del viaje"),
      guardar: z.boolean().optional(),
    }),
    run: async (input, ctx) => {
      const trip = await loadTrip(ctx);
      if (!isHotelSearchConfigured() || !trip.country_code) {
        return {
          precios_verificados: false,
          motivo: !isHotelSearchConfigured()
            ? "El proveedor de hoteles no está conectado todavía. No hay precios reales disponibles."
            : "Falta el país del destino para buscar hoteles.",
          enlaces_para_el_usuario: hotelLinks(trip, input.ciudad).map((l) => ({ proveedor: l.provider, url: l.url })),
        };
      }
      const offers = await searchHotels({
        city: input.ciudad ?? trip.destination,
        countryCode: trip.country_code,
        checkin: trip.start_date,
        checkout: trip.end_date,
        adults: trip.travelers,
        rooms: trip.rooms,
        currency: trip.currency,
        center: trip.dest_lat !== null && trip.dest_lng !== null ? { lat: trip.dest_lat, lng: trip.dest_lng } : undefined,
      });
      const picked = new Map<string, (typeof offers)[number]>();
      offers.slice(0, 4).forEach((o) => picked.set(o.id, o));
      offers
        .filter((o) => o.rating !== null)
        .sort((a, b) => (b.rating ?? 0) - (a.rating ?? 0))
        .slice(0, 4)
        .forEach((o) => picked.set(o.id, o));
      const selection = [...picked.values()];
      if ((input.guardar ?? true) && selection.length > 0) {
        await saveHotelOffers(ctx.supabase, trip, selection, agent);
      }
      return {
        precios_verificados: true,
        fuente: "LiteAPI",
        total_ofertas: offers.length,
        ofertas: selection.map((o) => ({
          nombre: o.name,
          precio_total_estancia: o.totalAmount,
          moneda: o.currency,
          estrellas: o.stars,
          valoracion_0_10: o.rating,
          km_del_centro: o.distanceCenterKm,
          regimen: o.board,
          impuestos: o.taxesNote,
          reembolsable: o.refundable,
        })),
      };
    },
  });
}

export function guardarOpciones(agent: string) {
  return defineTool({
    name: "guardar_opciones",
    label: "Guardando alternativas para comparar",
    mutates: true,
    description:
      "Guarda alternativas comparables elaboradas por ti (vuelo, zona u hotel tipo, abono de transporte, presupuesto de comidas...) como ESTIMACIONES. Se muestran siempre con la etiqueta 'Estimación' y un enlace para que el usuario compruebe el precio real. El precio es el total para todo el grupo y toda la estancia. No uses esta herramienta para datos que no puedas razonar; si no tienes base para un importe, déjalo sin precio.",
    schema: z.object({
      categoria: z.enum(["flight", "hotel", "transport", "activity", "restaurant"]),
      opciones: z
        .array(
          z.object({
            titulo: z.string().min(2).max(140),
            detalle: z.string().max(200).optional(),
            precio_total_grupo: z.number().min(0).max(1_000_000).optional(),
            base_de_la_estimacion: z.string().max(240).optional().describe("En qué te basas (rango habitual, temporada, cálculo)"),
            aerolinea: z.string().max(60).optional(),
            escalas: z.number().int().min(0).max(4).optional(),
            duracion_min: z.number().int().min(20).max(4000).optional(),
            equipaje: z.string().max(120).optional(),
            zona: z.string().max(80).optional(),
            km_del_centro: z.number().min(0).max(100).optional(),
            estrellas: z.number().min(1).max(5).optional(),
            calidad_0_10: z.number().min(0).max(10).optional().describe("Tu valoración de calidad/comodidad para ordenar calidad-precio"),
            condiciones: z.string().max(200).optional(),
          }),
        )
        .min(1)
        .max(8),
    }),
    run: async (input, ctx) => {
      const trip = await loadTrip(ctx);
      const rows = input.opciones.map((o) => {
        const link =
          input.categoria === "flight"
            ? flightLinks(trip)[0]
            : input.categoria === "hotel"
              ? hotelLinks(trip, o.zona ? `${o.zona}, ${trip.destination}` : undefined)[0]
              : input.categoria === "activity"
                ? activityLinks(trip.destination, o.titulo)[0]
                : input.categoria === "transport"
                  ? transportLinks(trip)[0]
                  : undefined;
        return {
          trip_id: trip.id,
          category: input.categoria,
          title: o.titulo,
          subtitle: o.detalle ?? null,
          provider: "Estimación IA",
          details: {
            airline: o.aerolinea,
            stops: o.escalas,
            duration_min: o.duracion_min,
            baggage: o.equipaje,
            area: o.zona,
            distance_center_km: o.km_del_centro,
            stars: o.estrellas,
            quality: o.calidad_0_10,
            conditions: o.condiciones,
            notes: o.base_de_la_estimacion,
          },
          price_amount: o.precio_total_grupo ?? null,
          price_currency: trip.currency,
          price_status: o.precio_total_grupo === undefined ? "unknown" : "estimate",
          price_source: o.precio_total_grupo === undefined ? null : "Estimación IA",
          booking_url: link?.url ?? null,
          is_affiliate: link?.isAffiliate ?? false,
          created_by: agent,
        };
      });
      const data = ok(await ctx.supabase.from("trip_options").insert(rows).select("id, title")) as { id: string; title: string }[];
      await assignTiers(ctx.supabase, trip.id, input.categoria);
      return { guardadas: data.map((d) => ({ id: d.id, titulo: d.title })), etiqueta: "Estimación" };
    },
  });
}

export const eliminarOpciones = defineTool({
  name: "eliminar_opciones",
  label: "Limpiando alternativas",
  mutates: true,
  description: "Elimina opciones guardadas (vuelos, hoteles, transporte...) por su id. No elimina las confirmadas por el usuario.",
  schema: z.object({ ids: z.array(uuid).min(1).max(40) }),
  run: async (input, ctx) => {
    const data = ok(
      await ctx.supabase
        .from("trip_options")
        .delete()
        .eq("trip_id", ctx.tripId)
        .neq("price_status", "user")
        .in("id", input.ids)
        .select("id, category"),
    ) as { id: string; category: "flight" | "hotel" | "transport" | "activity" | "restaurant" }[] | null;
    const categories = new Set((data ?? []).map((d) => d.category));
    await Promise.all([...categories].map((c) => assignTiers(ctx.supabase, ctx.tripId, c)));
    return { eliminadas: data?.length ?? 0 };
  },
});

export const elegirOpcion = defineTool({
  name: "elegir_opcion",
  label: "Seleccionando una opción",
  mutates: true,
  description:
    "Marca una opción como la elegida para el presupuesto del viaje (solo una por vuelo y por hotel). Elegir NO es reservar: nadie compra nada hasta que el usuario lo haga por su cuenta en el proveedor.",
  schema: z.object({ id: uuid, elegida: z.boolean().optional() }),
  run: async (input, ctx) => {
    await selectOption(ctx.supabase, ctx.tripId, input.id, input.elegida ?? true);
    return { hecho: true };
  },
});

export const proponerAhorros = defineTool({
  name: "proponer_ahorros",
  label: "Calculando oportunidades de ahorro",
  mutates: true,
  description:
    "Registra propuestas concretas de ahorro para que el usuario las revise. Cada una necesita una comparación real: importe actual frente a importe alternativo. Si comparas dos opciones guardadas, pasa sus ids: los importes se leen del sistema y el ahorro solo se marca 'verificado' si ambos precios lo están. Sin ids, el ahorro se muestra como estimación.",
    schema: z.object({
    propuestas: z
      .array(
        z.object({
          categoria: z.enum(["flight", "hotel", "transport", "activity", "food"]),
          titulo: z.string().min(4).max(140),
          detalle: z.string().max(500).optional().describe("Qué cambia y qué se sacrifica, con honestidad"),
          opcion_actual_id: uuid.optional(),
          opcion_propuesta_id: uuid.optional(),
          importe_actual: z.number().min(0).optional(),
          importe_propuesto: z.number().min(0).optional(),
        }),
      )
      .min(1)
      .max(10),
  }),
  run: async (input, ctx) => {
    const trip = await loadTrip(ctx);
    const results = [];
    for (const p of input.propuestas) {
      try {
        const r = await createSuggestion(ctx.supabase, trip, {
          category: p.categoria,
          title: p.titulo,
          detail: p.detalle,
          currentAmount: p.importe_actual,
          proposedAmount: p.importe_propuesto,
          currentOptionId: p.opcion_actual_id,
          proposedOptionId: p.opcion_propuesta_id,
        });
        results.push({ titulo: p.titulo, registrada: true, ...r });
      } catch (err) {
        results.push({ titulo: p.titulo, registrada: false, motivo: err instanceof Error ? err.message : "error" });
      }
    }
    return { propuestas: results };
  },
});

export const enlacesReserva = defineTool({
  name: "enlaces_reserva",
  label: "Preparando enlaces de reserva",
  description:
    "Devuelve enlaces reales de búsqueda en proveedores externos (ya rellenados con los datos del viaje) para que el usuario compruebe precios en vivo y reserve por su cuenta. Usa siempre estos enlaces: no escribas URLs de memoria.",
  schema: z.object({
    tipo: z.enum(["vuelos", "hoteles", "actividades", "transporte"]),
    consulta: z.string().max(80).optional().describe("Para actividades u hoteles: texto a buscar, p. ej. 'ceremonia del té'"),
  }),
  run: async (input, ctx) => {
    const trip = await loadTrip(ctx);
    const links =
      input.tipo === "vuelos"
        ? flightLinks(trip)
        : input.tipo === "hoteles"
          ? hotelLinks(trip, input.consulta)
          : input.tipo === "actividades"
            ? activityLinks(trip.destination, input.consulta)
            : transportLinks(trip);
    return {
      enlaces: links.map((l) => ({ proveedor: l.provider, url: l.url, afiliado: l.isAffiliate })),
      nota: links.some((l) => l.isAffiliate)
        ? "Algunos enlaces son de afiliado: indícalo al usuario."
        : undefined,
    };
  },
});

"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { z } from "zod";
import { getTrip, requireUser } from "@/lib/data";
import { diffDays, isIsoDate } from "@/lib/domain/dates";
import type { Trip } from "@/lib/domain/types";
import { geocode } from "@/lib/providers/geocoding";
import type { ServerSupabase } from "@/lib/supabase/server";
import { appendItems, assignTiers, ensureDays, organizeDay, selectOption } from "@/lib/trip-ops";

export interface ActionResult {
  ok: boolean;
  error?: string;
}

const fail = (error: string): ActionResult => ({ ok: false, error });
const done: ActionResult = { ok: true };

/** Resuelve usuario + viaje y exige permiso de edición. */
async function editableTrip(tripId: string): Promise<{ supabase: ServerSupabase; trip: Trip; userId: string } | null> {
  const { user, supabase } = await requireUser();
  const found = await getTrip(supabase, tripId, user.id);
  if (!found || found.role === "viewer") return null;
  return { supabase, trip: found.trip, userId: user.id };
}

const NO_ACCESS = "No tienes permiso para modificar este viaje.";

// ── Crear / borrar viaje ────────────────────────────────────────────────

const newTrip = z
  .object({
    destination: z.string().trim().min(2, "Indica un destino.").max(120),
    origin: z.string().trim().max(120).optional(),
    start_date: z.string().refine(isIsoDate, "Fecha de ida no válida."),
    end_date: z.string().refine(isIsoDate, "Fecha de vuelta no válida."),
    travelers: z.coerce.number().int().min(1).max(20),
    rooms: z.coerce.number().int().min(1).max(10),
    budget_total: z.union([z.literal(""), z.coerce.number().min(0).max(10_000_000)]).optional(),
    trip_type: z.enum(["economico", "romantico", "familiar", "aventura", "lujo", "cultural", "personalizado"]),
    pace: z.enum(["relajado", "equilibrado", "intenso"]),
    preferences: z.string().trim().max(1000).optional(),
  })
  .refine((v) => v.end_date >= v.start_date, { message: "La vuelta no puede ser anterior a la ida." })
  .refine((v) => diffDays(v.start_date, v.end_date) <= 60, { message: "El viaje no puede superar los 60 días." })
  .refine((v) => v.rooms <= v.travelers, { message: "No puede haber más habitaciones que viajeros." });

export async function createTrip(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  const { supabase } = await requireUser();
  const parsed = newTrip.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const v = parsed.data;

  // Geocodificación real del destino (si el servicio falla, se reintenta al generar).
  const place = await geocode(v.destination).catch(() => null);
  const city = place?.name ?? v.destination.split(",")[0].trim();

  const { data, error } = await supabase
    .from("trips")
    .insert({
      title: `${city}`,
      destination: city,
      destination_country: place?.country ?? null,
      country_code: place?.countryCode ?? null,
      dest_lat: place?.lat ?? null,
      dest_lng: place?.lng ?? null,
      origin: v.origin || null,
      start_date: v.start_date,
      end_date: v.end_date,
      travelers: v.travelers,
      rooms: v.rooms,
      budget_total: v.budget_total === "" || v.budget_total === undefined ? null : v.budget_total,
      trip_type: v.trip_type,
      pace: v.pace,
      preferences: v.preferences || null,
    })
    .select("id, start_date, end_date")
    .single();

  if (error) {
    if (error.message.includes("PLAN_LIMIT_TRIPS")) {
      return { error: "El plan gratuito incluye 1 viaje. Elimina el actual o pasa a Premium para crear viajes ilimitados." };
    }
    return { error: "No se pudo crear el viaje. Inténtalo de nuevo." };
  }
  await ensureDays(supabase, data as Pick<Trip, "id" | "start_date" | "end_date">);
  redirect(`/app/viajes/${data.id}?generar=1`);
}

export async function deleteTrip(tripId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  // Los documentos se borran con la API de Storage antes de eliminar el viaje.
  const { data: docs } = await supabase.from("documents").select("storage_path").eq("trip_id", tripId);
  if (docs && docs.length > 0) {
    await supabase.storage.from("trip-documents").remove(docs.map((d) => d.storage_path as string));
  }
  const { error, count } = await supabase.from("trips").delete({ count: "exact" }).eq("id", tripId);
  if (error || !count) return fail("Solo quien creó el viaje puede eliminarlo.");
  redirect("/app");
}

// ── Itinerario ──────────────────────────────────────────────────────────

const itemInput = z.object({
  title: z.string().trim().min(2, "Ponle un nombre.").max(140),
  day_date: z.union([z.literal(""), z.string().refine(isIsoDate)]).optional(),
  kind: z.enum(["activity", "meal", "transport", "free_time", "note"]).default("activity"),
  start_time: z.union([z.literal(""), z.string().regex(/^\d{2}:\d{2}$/)]).optional(),
  duration_min: z.coerce.number().int().min(0).max(720).default(60),
  price_amount: z.union([z.literal(""), z.coerce.number().min(0).max(1_000_000)]).optional(),
  price_per: z.enum(["person", "group"]).default("person"),
  is_free: z.string().optional(),
  notes: z.string().trim().max(1000).optional(),
});

export async function addItem(tripId: string, formData: FormData): Promise<ActionResult> {
  const ctx = await editableTrip(tripId);
  if (!ctx) return fail(NO_ACCESS);
  const parsed = itemInput.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const v = parsed.data;
  const day = v.day_date || null;
  if (day && (day < ctx.trip.start_date || day > ctx.trip.end_date)) return fail("Ese día está fuera del viaje.");
  const free = v.is_free === "on";
  const amount = v.price_amount === "" || v.price_amount === undefined ? null : v.price_amount;
  await appendItems(ctx.supabase, tripId, [
    {
      title: v.title,
      day_date: day,
      kind: v.kind,
      start_time: v.start_time || null,
      duration_min: v.duration_min,
      notes: v.notes || null,
      price_amount: free ? 0 : amount,
      price_per: v.price_per,
      // Lo que escribe el usuario es un precio confirmado por él.
      price_status: free ? "free" : amount !== null ? "user" : "unknown",
      price_source: amount !== null && !free ? "Introducido por ti" : null,
      price_currency: ctx.trip.currency,
      created_by: "user",
    },
  ]);
  refresh();
  return done;
}

const itemPatch = z.object({
  title: z.string().trim().min(2).max(140).optional(),
  notes: z.string().trim().max(1000).nullable().optional(),
  start_time: z.string().regex(/^\d{2}:\d{2}$/).nullable().optional(),
  duration_min: z.number().int().min(0).max(720).optional(),
  price_amount: z.number().min(0).max(1_000_000).nullable().optional(),
  price_per: z.enum(["person", "group"]).optional(),
  is_free: z.boolean().optional(),
});

export async function updateItem(tripId: string, itemId: string, input: z.input<typeof itemPatch>): Promise<ActionResult> {
  const ctx = await editableTrip(tripId);
  if (!ctx) return fail(NO_ACCESS);
  const parsed = itemPatch.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const { is_free, price_amount, ...rest } = parsed.data;
  const patch: Record<string, unknown> = { ...rest };
  if (is_free) {
    Object.assign(patch, { price_amount: 0, price_status: "free", price_source: null });
  } else if (price_amount !== undefined) {
    Object.assign(
      patch,
      price_amount === null
        ? { price_amount: null, price_status: "unknown", price_source: null }
        : { price_amount, price_status: "user", price_source: "Introducido por ti", price_checked_at: new Date().toISOString() },
    );
  }
  const { error } = await ctx.supabase.from("itinerary_items").update(patch).eq("id", itemId).eq("trip_id", tripId);
  if (error) return fail("No se pudo guardar el cambio.");
  refresh();
  return done;
}

export async function deleteItem(tripId: string, itemId: string): Promise<ActionResult> {
  const ctx = await editableTrip(tripId);
  if (!ctx) return fail(NO_ACCESS);
  const { error } = await ctx.supabase.from("itinerary_items").delete().eq("id", itemId).eq("trip_id", tripId);
  if (error) return fail("No se pudo eliminar.");
  refresh();
  return done;
}

const layoutInput = z.array(
  z.object({
    day: z.union([z.null(), z.string().refine(isIsoDate)]),
    ids: z.array(z.string().uuid()).max(80),
  }),
).max(70);

/**
 * Guarda el resultado de arrastrar y soltar: el nuevo reparto de actividades
 * por día. Para cada día afectado se recalculan horarios y trayectos.
 */
export async function saveLayout(tripId: string, layout: z.input<typeof layoutInput>): Promise<ActionResult> {
  const ctx = await editableTrip(tripId);
  if (!ctx) return fail(NO_ACCESS);
  const parsed = layoutInput.safeParse(layout);
  if (!parsed.success) return fail("Orden no válido.");
  for (const column of parsed.data) {
    if (column.day && (column.day < ctx.trip.start_date || column.day > ctx.trip.end_date)) return fail("Día fuera del viaje.");
    await Promise.all(
      column.ids.map((id, position) =>
        ctx.supabase
          .from("itinerary_items")
          .update({ day_date: column.day, position, ...(column.day === null ? { start_time: null } : {}) })
          .eq("id", id)
          .eq("trip_id", tripId),
      ),
    );
    if (column.day) await organizeDay(ctx.supabase, ctx.trip, column.day, { order: column.ids });
  }
  refresh();
  return done;
}

export async function optimizeDay(tripId: string, day: string): Promise<ActionResult> {
  const ctx = await editableTrip(tripId);
  if (!ctx) return fail(NO_ACCESS);
  if (!isIsoDate(day)) return fail("Día no válido.");
  await organizeDay(ctx.supabase, ctx.trip, day, { optimize: true });
  refresh();
  return done;
}

export async function updateDay(tripId: string, day: string, input: { notes?: string; title?: string }): Promise<ActionResult> {
  const ctx = await editableTrip(tripId);
  if (!ctx) return fail(NO_ACCESS);
  if (!isIsoDate(day)) return fail("Día no válido.");
  const row: Record<string, unknown> = { trip_id: tripId, day_date: day };
  if (input.notes !== undefined) row.notes = input.notes.slice(0, 2000) || null;
  if (input.title !== undefined) row.title = input.title.slice(0, 80) || null;
  const { error } = await ctx.supabase.from("trip_days").upsert(row, { onConflict: "trip_id,day_date" });
  if (error) return fail("No se pudo guardar la nota.");
  refresh();
  return done;
}

// ── Opciones (vuelos, hoteles, transporte...) ───────────────────────────

const manualOption = z.object({
  category: z.enum(["flight", "hotel", "transport", "activity", "restaurant"]),
  title: z.string().trim().min(2, "Describe la opción.").max(140),
  subtitle: z.string().trim().max(200).optional(),
  price_amount: z.coerce.number().min(0, "Indica el precio total.").max(1_000_000),
  booking_url: z.union([z.literal(""), z.string().url().startsWith("https://", "El enlace debe empezar por https://")]).optional(),
});

/** Opción con el precio que el usuario ha visto en el proveedor. */
export async function addManualOption(tripId: string, formData: FormData): Promise<ActionResult> {
  const ctx = await editableTrip(tripId);
  if (!ctx) return fail(NO_ACCESS);
  const parsed = manualOption.safeParse(Object.fromEntries(formData));
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const v = parsed.data;
  const { error } = await ctx.supabase.from("trip_options").insert({
    trip_id: tripId,
    category: v.category,
    title: v.title,
    subtitle: v.subtitle || null,
    provider: "Añadido por ti",
    price_amount: v.price_amount,
    price_currency: ctx.trip.currency,
    price_status: "user",
    price_source: "Introducido por ti",
    price_checked_at: new Date().toISOString(),
    booking_url: v.booking_url || null,
    created_by: "user",
  });
  if (error) return fail("No se pudo guardar la opción.");
  await assignTiers(ctx.supabase, tripId, v.category);
  refresh();
  return done;
}

/** El usuario confirma el precio real de una opción estimada. */
export async function confirmOptionPrice(tripId: string, optionId: string, amount: number): Promise<ActionResult> {
  const ctx = await editableTrip(tripId);
  if (!ctx) return fail(NO_ACCESS);
  if (!Number.isFinite(amount) || amount < 0 || amount > 1_000_000) return fail("Importe no válido.");
  const { data, error } = await ctx.supabase
    .from("trip_options")
    .update({
      price_amount: amount,
      price_status: "user",
      price_source: "Confirmado por ti",
      price_checked_at: new Date().toISOString(),
    })
    .eq("id", optionId)
    .eq("trip_id", tripId)
    .select("category")
    .maybeSingle();
  if (error || !data) return fail("No se pudo guardar el precio.");
  await assignTiers(ctx.supabase, tripId, data.category);
  refresh();
  return done;
}

export async function chooseOption(tripId: string, optionId: string, selected: boolean): Promise<ActionResult> {
  const ctx = await editableTrip(tripId);
  if (!ctx) return fail(NO_ACCESS);
  try {
    await selectOption(ctx.supabase, tripId, optionId, selected);
  } catch (err) {
    return fail(err instanceof Error ? err.message : "No se pudo seleccionar.");
  }
  refresh();
  return done;
}

export async function deleteOption(tripId: string, optionId: string): Promise<ActionResult> {
  const ctx = await editableTrip(tripId);
  if (!ctx) return fail(NO_ACCESS);
  const { data, error } = await ctx.supabase
    .from("trip_options")
    .delete()
    .eq("id", optionId)
    .eq("trip_id", tripId)
    .select("category")
    .maybeSingle();
  if (error) return fail("No se pudo eliminar.");
  if (data) await assignTiers(ctx.supabase, tripId, data.category);
  refresh();
  return done;
}

export async function setSuggestionStatus(
  tripId: string,
  suggestionId: string,
  status: "applied" | "dismissed" | "proposed",
): Promise<ActionResult> {
  const ctx = await editableTrip(tripId);
  if (!ctx) return fail(NO_ACCESS);
  const { error } = await ctx.supabase
    .from("budget_suggestions")
    .update({ status })
    .eq("id", suggestionId)
    .eq("trip_id", tripId);
  if (error) return fail("No se pudo actualizar.");
  refresh();
  return done;
}

const tripPatch = z.object({
  title: z.string().trim().min(2).max(120).optional(),
  budget_total: z.number().min(0).max(10_000_000).nullable().optional(),
  origin: z.string().trim().max(120).nullable().optional(),
  origin_iata: z.string().regex(/^[A-Za-z]{3}$/, "El código IATA tiene 3 letras.").nullable().optional(),
  dest_iata: z.string().regex(/^[A-Za-z]{3}$/, "El código IATA tiene 3 letras.").nullable().optional(),
});

export async function updateTrip(tripId: string, input: z.input<typeof tripPatch>): Promise<ActionResult> {
  const ctx = await editableTrip(tripId);
  if (!ctx) return fail(NO_ACCESS);
  const parsed = tripPatch.safeParse(input);
  if (!parsed.success) return fail(parsed.error.issues[0].message);
  const patch: Record<string, unknown> = { ...parsed.data };
  if (typeof patch.origin_iata === "string") patch.origin_iata = patch.origin_iata.toUpperCase();
  if (typeof patch.dest_iata === "string") patch.dest_iata = patch.dest_iata.toUpperCase();
  const { error } = await ctx.supabase.from("trips").update(patch).eq("id", tripId);
  if (error) return fail("No se pudo guardar.");
  refresh();
  return done;
}

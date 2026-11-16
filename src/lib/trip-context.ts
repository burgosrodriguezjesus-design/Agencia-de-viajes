import "server-only";
import { notFound } from "next/navigation";
import { cache } from "react";
import { getPlan, getTrip, getTripBundle, requireUser } from "./data";

// Carga del viaje compartida por el layout y las páginas de una misma
// petición (React `cache` evita repetir consultas).

export const loadSession = cache(async () => {
  const { user, supabase } = await requireUser();
  const plan = await getPlan(supabase, user.id);
  return { user, supabase, plan };
});

export const loadTrip = cache(async (tripId: string) => {
  const session = await loadSession();
  const found = await getTrip(session.supabase, tripId, session.user.id);
  if (!found) notFound();
  return { ...session, trip: found.trip, role: found.role, canEdit: found.role !== "viewer" };
});

export const loadBundle = cache(async (tripId: string) => {
  const { supabase } = await loadSession();
  return getTripBundle(supabase, tripId);
});

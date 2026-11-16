import "server-only";
import { redirect } from "next/navigation";
import { PLANS, startOfMonthIso } from "./billing/plans";
import type {
  BudgetSuggestion,
  ItineraryItem,
  Plan,
  Profile,
  Trip,
  TripDay,
  TripOption,
  TripRole,
} from "./domain/types";
import { createClient, type ServerSupabase } from "./supabase/server";

// Capa de acceso a datos: único sitio donde se resuelve el usuario actual.
// Toda consulta va con la sesión del usuario, así que RLS es la autoridad.

export interface SessionUser {
  id: string;
  email: string | null;
}

export async function getSessionUser(supabase?: ServerSupabase): Promise<SessionUser | null> {
  const client = supabase ?? (await createClient());
  const { data, error } = await client.auth.getUser();
  if (error || !data.user) return null;
  return { id: data.user.id, email: data.user.email ?? null };
}

export async function requireUser(): Promise<{ user: SessionUser; supabase: ServerSupabase }> {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) redirect("/login");
  return { user, supabase };
}

export async function getProfile(supabase: ServerSupabase, userId: string): Promise<Profile | null> {
  const { data } = await supabase.from("profiles").select("*").eq("id", userId).maybeSingle();
  return (data as Profile | null) ?? null;
}

export async function getPlan(supabase: ServerSupabase, userId: string): Promise<Plan> {
  const profile = await getProfile(supabase, userId);
  return profile?.plan ?? "free";
}

export async function listTrips(supabase: ServerSupabase): Promise<Trip[]> {
  const { data, error } = await supabase.from("trips").select("*").order("start_date", { ascending: true });
  if (error) throw new Error(error.message);
  return (data ?? []) as Trip[];
}

export async function getTrip(
  supabase: ServerSupabase,
  tripId: string,
  userId: string,
): Promise<{ trip: Trip; role: TripRole } | null> {
  if (!/^[0-9a-f-]{36}$/i.test(tripId)) return null;
  const { data } = await supabase.from("trips").select("*").eq("id", tripId).maybeSingle();
  if (!data) return null;
  const trip = normalizeTrip(data as Trip);
  if (trip.owner_id === userId) return { trip, role: "owner" };
  const { data: member } = await supabase
    .from("trip_members")
    .select("role")
    .eq("trip_id", tripId)
    .eq("user_id", userId)
    .maybeSingle();
  return { trip, role: (member?.role as TripRole | undefined) ?? "viewer" };
}

export interface TripBundle {
  days: TripDay[];
  items: ItineraryItem[];
  options: TripOption[];
  suggestions: BudgetSuggestion[];
}

export async function getTripBundle(supabase: ServerSupabase, tripId: string): Promise<TripBundle> {
  const [days, items, options, suggestions] = await Promise.all([
    supabase.from("trip_days").select("*").eq("trip_id", tripId).order("day_date"),
    supabase.from("itinerary_items").select("*").eq("trip_id", tripId).order("day_date").order("position"),
    supabase.from("trip_options").select("*").eq("trip_id", tripId).order("created_at"),
    supabase.from("budget_suggestions").select("*").eq("trip_id", tripId).order("created_at", { ascending: false }),
  ]);
  const failed = [days, items, options, suggestions].find((r) => r.error);
  if (failed?.error) throw new Error(failed.error.message);
  return {
    days: (days.data ?? []) as TripDay[],
    items: ((items.data ?? []) as ItineraryItem[]).map(normalizeItem),
    options: ((options.data ?? []) as TripOption[]).map(normalizeOption),
    suggestions: ((suggestions.data ?? []) as BudgetSuggestion[]).map((s) => ({
      ...s,
      current_amount: num(s.current_amount),
      proposed_amount: num(s.proposed_amount),
    })),
  };
}

export async function getAgentUsage(
  supabase: ServerSupabase,
  userId: string,
  plan: Plan,
): Promise<{ used: number; limit: number; remaining: number }> {
  const { count } = await supabase
    .from("agent_runs")
    .select("id", { count: "exact", head: true })
    .eq("user_id", userId)
    .gte("created_at", startOfMonthIso());
  const used = count ?? 0;
  const limit = PLANS[plan].monthlyAgentRuns;
  return { used, limit, remaining: Math.max(0, limit - used) };
}

// PostgREST devuelve los `numeric` como texto o número según el valor:
// normalizamos siempre a number.
function num(value: unknown): number | null {
  if (value === null || value === undefined) return null;
  const n = typeof value === "number" ? value : Number(value);
  return Number.isFinite(n) ? n : null;
}

export function normalizeTrip(trip: Trip): Trip {
  return { ...trip, budget_total: num(trip.budget_total) };
}

export function normalizeItem(item: ItineraryItem): ItineraryItem {
  return { ...item, price_amount: num(item.price_amount) };
}

export function normalizeOption(option: TripOption): TripOption {
  return { ...option, price_amount: num(option.price_amount), details: option.details ?? {} };
}

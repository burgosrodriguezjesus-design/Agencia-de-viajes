import { getProfile, getSessionUser } from "@/lib/data";
import { createClient } from "@/lib/supabase/server";

/** Derecho de acceso y portabilidad (RGPD arts. 15 y 20): todos tus datos en JSON. */
export async function GET() {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) return Response.json({ error: "No autenticado." }, { status: 401 });

  const { data: trips } = await supabase.from("trips").select("*").eq("owner_id", user.id);
  const tripIds = (trips ?? []).map((t) => t.id as string);
  const inTrips = async (table: string) =>
    tripIds.length === 0 ? [] : ((await supabase.from(table).select("*").in("trip_id", tripIds)).data ?? []);

  const [profile, days, items, options, suggestions, documents, messages, subscriptions, runs] = await Promise.all([
    getProfile(supabase, user.id),
    inTrips("trip_days"),
    inTrips("itinerary_items"),
    inTrips("trip_options"),
    inTrips("budget_suggestions"),
    inTrips("documents"),
    inTrips("chat_messages"),
    supabase.from("subscriptions").select("*").eq("user_id", user.id).then((r) => r.data ?? []),
    supabase.from("agent_runs").select("agent, kind, status, created_at").eq("user_id", user.id).then((r) => r.data ?? []),
  ]);

  const payload = {
    exportado_el: new Date().toISOString(),
    cuenta: { id: user.id, email: user.email },
    perfil: profile,
    suscripciones: subscriptions,
    viajes: trips ?? [],
    dias: days,
    itinerario: items,
    opciones: options,
    propuestas_de_ahorro: suggestions,
    documentos: documents,
    conversaciones: messages,
    uso_de_agentes: runs,
  };
  return new Response(JSON.stringify(payload, null, 2), {
    headers: {
      "Content-Type": "application/json; charset=utf-8",
      "Content-Disposition": 'attachment; filename="mis-datos.json"',
      "Cache-Control": "no-store",
    },
  });
}

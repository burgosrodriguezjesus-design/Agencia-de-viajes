import { CalendarDays, MapPin, Users } from "lucide-react";
import { AssistantProvider } from "@/components/assistant-panel";
import { TripTabs } from "@/components/trip-tabs";
import { Badge } from "@/components/ui";
import { formatDateRange, tripDates } from "@/lib/domain/dates";
import { TRIP_TYPES } from "@/lib/domain/types";
import { isAiConfigured } from "@/lib/providers/status";
import { loadTrip } from "@/lib/trip-context";
import { SafeImg } from "@/components/safe-img";

export default async function TripLayout({
  children,
  params,
}: {
  children: React.ReactNode;
  params: Promise<{ id: string }>;
}) {
  const { id } = await params;
  const { trip, role, canEdit, supabase } = await loadTrip(id);
  const { data: history } = await supabase
    .from("chat_messages")
    .select("id, role, content")
    .eq("trip_id", id)
    .order("created_at", { ascending: false })
    .limit(30);
  const messages = ((history ?? []) as { id: string; role: "user" | "assistant"; content: string }[]).reverse();

  return (
    <AssistantProvider tripId={id} initialMessages={messages} aiEnabled={isAiConfigured()} canEdit={canEdit}>
      <div className="relative isolate overflow-hidden border-b border-line bg-surface">
        {trip.cover_image_url ? (
          <>
                        <SafeImg src={trip.cover_image_url} className="absolute inset-0 -z-10 size-full object-cover opacity-25" />
            <div className="absolute inset-0 -z-10 bg-linear-to-t from-surface via-surface/85 to-surface/40" />
          </>
        ) : null}
        <div className="mx-auto max-w-7xl px-4 pt-8 sm:px-6 sm:pt-10">
          <div className="flex flex-wrap items-center gap-2">
            <Badge tone="accent">{TRIP_TYPES.find((t) => t.value === trip.trip_type)?.label}</Badge>
            {role !== "owner" ? <Badge>{role === "editor" ? "Colaboras en este viaje" : "Solo lectura"}</Badge> : null}
          </div>
          <h1 className="mt-3 font-display text-4xl leading-[1.05] font-medium tracking-tight sm:text-5xl">{trip.title}</h1>
          <p className="mt-3 flex flex-wrap items-center gap-x-5 gap-y-1.5 text-sm text-muted">
            <span className="inline-flex items-center gap-1.5">
              <MapPin className="size-4" aria-hidden />
              {[trip.destination, trip.destination_country].filter(Boolean).join(", ")}
            </span>
            <span className="inline-flex items-center gap-1.5">
              <CalendarDays className="size-4" aria-hidden />
              {formatDateRange(trip.start_date, trip.end_date)} · {tripDates(trip.start_date, trip.end_date).length} días
            </span>
            <span className="inline-flex items-center gap-1.5">
              <Users className="size-4" aria-hidden />
              {trip.travelers} {trip.travelers === 1 ? "viajero" : "viajeros"} · {trip.rooms} {trip.rooms === 1 ? "habitación" : "habitaciones"}
            </span>
          </p>
          <div className="mt-6">
            <TripTabs tripId={id} />
          </div>
        </div>
      </div>
      <main className="mx-auto w-full max-w-7xl flex-1 px-4 py-8 pb-28 sm:px-6">{children}</main>
      {trip.cover_image_credit ? (
        <p className="mx-auto w-full max-w-7xl px-4 pb-6 text-[11px] text-muted sm:px-6">{trip.cover_image_credit}</p>
      ) : null}
    </AssistantProvider>
  );
}

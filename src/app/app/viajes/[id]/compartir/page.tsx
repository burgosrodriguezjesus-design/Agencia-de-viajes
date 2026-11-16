import type { Metadata } from "next";
import { SharePanel } from "@/components/share-panel";
import { SITE_URL } from "@/lib/brand";
import type { TripInvite } from "@/lib/domain/types";
import { loadTrip } from "@/lib/trip-context";

export const metadata: Metadata = { title: "Compartir" };

export default async function SharePage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, role, trip } = await loadTrip(id);
  const [invites, members] = await Promise.all([
    role === "owner"
      ? supabase.from("trip_invites").select("*").eq("trip_id", id).order("created_at", { ascending: false })
      : Promise.resolve({ data: [] }),
    supabase.from("trip_members").select("user_id, role").eq("trip_id", id),
  ]);
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="font-display text-2xl font-medium">Compartir</h2>
        <p className="mt-0.5 text-sm text-muted">Enseña el plan o planifícalo a varias manos.</p>
      </div>
      <SharePanel
        tripId={id}
        siteUrl={SITE_URL}
        invites={(invites.data ?? []) as TripInvite[]}
        members={(members.data ?? []) as { user_id: string; role: "viewer" | "editor" }[]}
        isOwner={role === "owner"}
        tripTitle={trip.title}
      />
    </div>
  );
}

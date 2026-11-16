import type { Metadata } from "next";
import { DocumentsPanel } from "@/components/documents-panel";
import type { TripDocument } from "@/lib/domain/types";
import { loadTrip } from "@/lib/trip-context";

export const metadata: Metadata = { title: "Documentos" };

export default async function DocumentsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const { supabase, canEdit } = await loadTrip(id);
  const { data } = await supabase.from("documents").select("*").eq("trip_id", id).order("created_at", { ascending: false });
  return (
    <div className="max-w-3xl space-y-6">
      <div>
        <h2 className="font-display text-2xl font-medium">Documentos</h2>
        <p className="mt-0.5 text-sm text-muted">Billetes, confirmaciones y seguros del viaje, siempre a mano.</p>
      </div>
      <DocumentsPanel tripId={id} documents={(data ?? []) as TripDocument[]} canEdit={canEdit} />
    </div>
  );
}

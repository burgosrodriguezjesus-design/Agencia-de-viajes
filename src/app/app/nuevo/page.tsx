import type { Metadata } from "next";
import Link from "next/link";
import { TripSearchForm, type TripFormDefaults } from "@/components/trip-search-form";
import { Notice } from "@/components/ui";
import { PLANS } from "@/lib/billing/plans";
import { loadSession } from "@/lib/trip-context";

export const metadata: Metadata = { title: "Nuevo viaje" };

export default async function NewTripPage({ searchParams }: { searchParams: Promise<TripFormDefaults> }) {
  const { supabase, user, plan } = await loadSession();
  const defaults = await searchParams;
  const { count } = await supabase.from("trips").select("id", { count: "exact", head: true }).eq("owner_id", user.id);
  const limit = PLANS[plan].maxTrips;
  const atLimit = limit !== null && (count ?? 0) >= limit;

  return (
    <main className="mx-auto w-full max-w-5xl flex-1 px-4 py-10 sm:px-6">
      <h1 className="font-display text-4xl font-medium tracking-tight">¿A dónde vamos?</h1>
      <p className="mt-1.5 max-w-2xl text-muted">
        Cuanto más nos cuentes, mejor encajará el plan. Podrás cambiarlo todo después hablando con tu asistente.
      </p>
      {atLimit ? (
        <Notice tone="warn" className="mt-6">
          Ya tienes {count} viaje y el plan gratuito incluye {limit}. Puedes eliminar el actual desde su pestaña «Compartir» o{" "}
          <Link href="/app/cuenta" className="font-medium underline underline-offset-4">pasar a Premium</Link> para tener viajes ilimitados.
        </Notice>
      ) : null}
      <div className="mt-8 rounded-[1.75rem] border border-line bg-surface p-4 shadow-card sm:p-6">
        <TripSearchForm mode="create" defaults={defaults} submitLabel="Crear viaje y generar plan" />
      </div>
      <p className="mt-4 text-sm leading-relaxed text-muted">
        Al crear el viaje, los agentes buscarán lugares reales y organizarán los días. No se reserva ni se paga nada.
      </p>
    </main>
  );
}

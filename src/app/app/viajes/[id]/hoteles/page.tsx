import type { Metadata } from "next";
import { AskAssistantButton } from "@/components/assistant-panel";
import { OptionsBoard } from "@/components/options-board";
import { Notice } from "@/components/ui";
import { canUseAgent } from "@/lib/billing/plans";
import { tripNights } from "@/lib/domain/dates";
import { optionLinkMap, toLinkViews } from "@/lib/link-views";
import { isHotelSearchConfigured } from "@/lib/providers/hotels";
import { hotelLinks } from "@/lib/providers/links";
import { loadBundle, loadTrip } from "@/lib/trip-context";

export const metadata: Metadata = { title: "Hoteles" };

export default async function HotelsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ trip, plan, canEdit }, bundle] = await Promise.all([loadTrip(id), loadBundle(id)]);
  const options = bundle.options.filter((o) => o.category === "hotel");
  const nights = tripNights(trip.start_date, trip.end_date);
  const premium = canUseAgent(plan, "hoteles");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-medium">Alojamiento</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Precio total de la estancia, zona, valoración y distancia a lo que vas a visitar. Un hotel barato lejos de
            todo sale caro en tiempo.
          </p>
        </div>
        {premium ? (
          <AskAssistantButton message="Busca las mejores opciones de alojamiento para este viaje teniendo en cuenta el itinerario: compara zonas, calidad-precio y distancia a los puntos de interés. Deja guardadas las alternativas.">
            Buscar con el experto en hoteles
          </AskAssistantButton>
        ) : null}
      </div>

      {!isHotelSearchConfigured() ? (
        <Notice tone="warn">
          <strong>Precios de hoteles en vivo: integración pendiente.</strong> El proveedor (LiteAPI) aún no está
          conectado. Lo que guarde la IA aparecerá como «Estimación»; usa los enlaces para ver disponibilidad y precio
          reales, y anota el que encuentres.
        </Notice>
      ) : null}
      {!premium ? (
        <Notice>
          El experto en hoteles forma parte del plan Premium. En el plan gratuito tienes los enlaces de comparación y
          puedes guardar los precios que encuentres.
        </Notice>
      ) : null}

      <OptionsBoard
        tripId={id}
        category="hotel"
        options={options}
        optionLinks={optionLinkMap(options, id)}
        links={toLinkViews(hotelLinks(trip), id)}
        canEdit={canEdit}
        currency={trip.currency}
        priceScope={`total de la estancia: ${nights} ${nights === 1 ? "noche" : "noches"}, ${trip.rooms} ${trip.rooms === 1 ? "habitación" : "habitaciones"}`}
        emptyHint="Abre los enlaces de comparación, o pide al asistente que prepare alternativas por zona."
      />
    </div>
  );
}

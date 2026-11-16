import type { Metadata } from "next";
import { AskAssistantButton } from "@/components/assistant-panel";
import { IataEditor } from "@/components/iata-editor";
import { OptionsBoard } from "@/components/options-board";
import { Card, Notice } from "@/components/ui";
import { canUseAgent } from "@/lib/billing/plans";
import { optionLinkMap, toLinkViews } from "@/lib/link-views";
import { isFlightSearchConfigured } from "@/lib/providers/flights";
import { flightLinks } from "@/lib/providers/links";
import { loadBundle, loadTrip } from "@/lib/trip-context";

export const metadata: Metadata = { title: "Vuelos" };

export default async function FlightsPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ trip, plan, canEdit }, bundle] = await Promise.all([loadTrip(id), loadBundle(id)]);
  const options = bundle.options.filter((o) => o.category === "flight");
  const verified = isFlightSearchConfigured();
  const premium = canUseAgent(plan, "vuelos");

  return (
    <div className="space-y-8">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-medium">Vuelos</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Compara la opción más económica, la de mejor equilibrio y la más cómoda, con equipaje y escalas a la vista.
          </p>
        </div>
        {premium ? (
          <AskAssistantButton message="Busca las mejores opciones de vuelo para este viaje: compara aeropuertos, directos frente a escalas y el coste real con equipaje. Deja guardadas las alternativas.">
            Buscar con el experto en vuelos
          </AskAssistantButton>
        ) : null}
      </div>

      {!verified ? (
        <Notice tone="warn">
          <strong>Precios de vuelos en vivo: integración pendiente.</strong> El proveedor (Duffel) aún no está conectado,
          así que aquí no verás precios verificados. Lo que guarde la IA aparecerá como «Estimación» y los enlaces de
          abajo te llevan a la búsqueda real. También puedes anotar el precio que encuentres.
        </Notice>
      ) : null}
      {!premium ? (
        <Notice>
          El experto en vuelos forma parte del plan Premium. En el plan gratuito tienes los enlaces de comparación y
          puedes guardar los precios que encuentres para tu presupuesto.
        </Notice>
      ) : null}

      {canEdit ? (
        <Card className="p-5">
          <h3 className="font-medium">Datos para buscar</h3>
          <p className="mt-0.5 mb-4 text-sm text-muted">
            Con los códigos IATA (3 letras del aeropuerto o la ciudad) se activan las búsquedas en Skyscanner y Kayak.
          </p>
          <IataEditor tripId={id} origin={trip.origin} originIata={trip.origin_iata} destIata={trip.dest_iata} />
        </Card>
      ) : null}

      <OptionsBoard
        tripId={id}
        category="flight"
        options={options}
        optionLinks={optionLinkMap(options, id)}
        links={toLinkViews(flightLinks(trip), id)}
        canEdit={canEdit}
        currency={trip.currency}
        priceScope={`total para ${trip.travelers} ${trip.travelers === 1 ? "viajero" : "viajeros"}, ida y vuelta`}
        emptyHint={
          trip.origin
            ? "Abre los enlaces de comparación, o pide al asistente que prepare las alternativas."
            : "Indica primero tu ciudad de salida para preparar las búsquedas."
        }
      />
    </div>
  );
}

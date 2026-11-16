import type { Metadata } from "next";
import { AskAssistantButton } from "@/components/assistant-panel";
import { Planner, type DayWeather } from "@/components/planner";
import { tripDates } from "@/lib/domain/dates";
import { getForecast } from "@/lib/providers/weather";
import { loadBundle, loadTrip } from "@/lib/trip-context";

export const metadata: Metadata = { title: "Itinerario" };

export default async function ItineraryPage({ params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const [{ trip, canEdit }, bundle] = await Promise.all([loadTrip(id), loadBundle(id)]);
  const weather: Record<string, DayWeather> = {};
  if (trip.dest_lat !== null && trip.dest_lng !== null) {
    const forecast = await getForecast({ lat: trip.dest_lat, lng: trip.dest_lng }, trip.start_date, trip.end_date).catch(() => []);
    forecast.forEach((f) => {
      weather[f.date] = { summary: f.summary, tempMax: f.tempMax, tempMin: f.tempMin, rainy: f.rainy, rainProbability: f.rainProbability };
    });
  }
  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h2 className="font-display text-2xl font-medium">Planificador</h2>
          <p className="mt-0.5 max-w-2xl text-sm text-muted">
            Arrastra las actividades para cambiarlas de orden o de día: los horarios y los trayectos se recalculan solos.
            {Object.keys(weather).length === 0 ? " La previsión del tiempo aparecerá 16 días antes del viaje." : ""}
          </p>
        </div>
        <AskAssistantButton message="Revisa el itinerario completo: equilibra los días, reduce desplazamientos innecesarios y asegúrate de que cada día tiene plan para lluvia.">
          Mejorar con IA
        </AskAssistantButton>
      </div>
      <Planner
        trip={{ id: trip.id, pace: trip.pace, travelers: trip.travelers, currency: trip.currency, dest_lat: trip.dest_lat, dest_lng: trip.dest_lng }}
        dates={tripDates(trip.start_date, trip.end_date)}
        days={bundle.days}
        items={bundle.items}
        weather={weather}
        canEdit={canEdit}
      />
    </div>
  );
}

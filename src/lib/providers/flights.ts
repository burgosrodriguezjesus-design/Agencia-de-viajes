import "server-only";
import { fetchJson, ProviderError } from "./http";

// Proveedor de vuelos con precios verificados: Duffel (https://duffel.com).
// Se activa con DUFFEL_ACCESS_TOKEN. Sin token, `isFlightSearchConfigured()`
// devuelve false y la plataforma solo ofrece enlaces de búsqueda y
// estimaciones claramente etiquetadas.
//
// ESTADO: adaptador implementado contra la documentación pública de Duffel
// (API v2); pendiente de validar con credenciales reales antes de producción.
//
// Nota: Amadeus Self-Service (la opción clásica) cerró en julio de 2026.

export interface FlightSearch {
  originIata: string;
  destinationIata: string;
  departureDate: string;
  returnDate?: string;
  adults: number;
  cabin?: "economy" | "premium_economy" | "business" | "first";
  maxConnections?: number;
}

export interface FlightOffer {
  id: string;
  airline: string;
  totalAmount: number;
  currency: string;
  /** Escalas del trayecto con más escalas. */
  stops: number;
  /** Duración total (ida + vuelta) en minutos. */
  durationMin: number;
  outbound: FlightSlice;
  inbound: FlightSlice | null;
  baggage: string;
  fetchedAt: string;
}

export interface FlightSlice {
  origin: string;
  destination: string;
  departure: string;
  arrival: string;
  stops: number;
  durationMin: number;
}

export function isFlightSearchConfigured(): boolean {
  return Boolean(process.env.DUFFEL_ACCESS_TOKEN);
}

const DUFFEL_API = "https://api.duffel.com";

function duffelHeaders(): Record<string, string> {
  return {
    Authorization: `Bearer ${process.env.DUFFEL_ACCESS_TOKEN}`,
    "Duffel-Version": "v2",
    "Content-Type": "application/json",
    Accept: "application/json",
  };
}

interface DuffelSegment {
  departing_at: string;
  arriving_at: string;
  origin: { iata_code: string };
  destination: { iata_code: string };
  passengers?: { baggages?: { type: string; quantity: number }[] }[];
}

interface DuffelSlice {
  duration: string | null;
  segments: DuffelSegment[];
}

interface DuffelOffer {
  id: string;
  total_amount: string;
  total_currency: string;
  owner: { name: string };
  slices: DuffelSlice[];
}

function isoDurationToMinutes(iso: string | null): number {
  if (!iso) return 0;
  const m = /P(?:(\d+)D)?T?(?:(\d+)H)?(?:(\d+)M)?/.exec(iso);
  if (!m) return 0;
  return Number(m[1] ?? 0) * 1440 + Number(m[2] ?? 0) * 60 + Number(m[3] ?? 0);
}

function mapSlice(slice: DuffelSlice): FlightSlice {
  const first = slice.segments[0];
  const last = slice.segments[slice.segments.length - 1];
  const fallback = Math.round((Date.parse(last.arriving_at) - Date.parse(first.departing_at)) / 60_000);
  return {
    origin: first.origin.iata_code,
    destination: last.destination.iata_code,
    departure: first.departing_at,
    arrival: last.arriving_at,
    stops: slice.segments.length - 1,
    durationMin: isoDurationToMinutes(slice.duration) || fallback,
  };
}

function describeBaggage(offer: DuffelOffer): string {
  const bags = offer.slices[0]?.segments[0]?.passengers?.[0]?.baggages ?? [];
  const checked = bags.filter((b) => b.type === "checked").reduce((s, b) => s + b.quantity, 0);
  const carry = bags.filter((b) => b.type === "carry_on").reduce((s, b) => s + b.quantity, 0);
  const parts = [];
  parts.push(carry > 0 ? `${carry} equipaje de mano` : "equipaje de mano no indicado");
  parts.push(checked > 0 ? `${checked} maleta facturada` : "sin maleta facturada");
  return parts.join(" · ");
}

/** Busca vuelos con precio real. Lanza ProviderError si no está configurado. */
export async function searchFlights(search: FlightSearch): Promise<FlightOffer[]> {
  if (!isFlightSearchConfigured()) {
    throw new ProviderError("duffel", "no configurado (falta DUFFEL_ACCESS_TOKEN)");
  }
  const slices = [
    { origin: search.originIata, destination: search.destinationIata, departure_date: search.departureDate },
  ];
  if (search.returnDate) {
    slices.push({ origin: search.destinationIata, destination: search.originIata, departure_date: search.returnDate });
  }
  const body = {
    data: {
      slices,
      passengers: Array.from({ length: search.adults }, () => ({ type: "adult" })),
      cabin_class: search.cabin ?? "economy",
      ...(search.maxConnections !== undefined ? { max_connections: search.maxConnections } : {}),
    },
  };
  const res = await fetchJson<{ data: { offers?: DuffelOffer[] } }>(
    "duffel",
    `${DUFFEL_API}/air/offer_requests?return_offers=true&supplier_timeout=15000`,
    { method: "POST", headers: duffelHeaders(), body: JSON.stringify(body), timeoutMs: 30_000, cache: "no-store" },
  );
  const fetchedAt = new Date().toISOString();
  return (res.data.offers ?? [])
    .map((offer): FlightOffer => {
      const outbound = mapSlice(offer.slices[0]);
      const inbound = offer.slices[1] ? mapSlice(offer.slices[1]) : null;
      return {
        id: offer.id,
        airline: offer.owner.name,
        totalAmount: Number(offer.total_amount),
        currency: offer.total_currency,
        stops: Math.max(outbound.stops, inbound?.stops ?? 0),
        durationMin: outbound.durationMin + (inbound?.durationMin ?? 0),
        outbound,
        inbound,
        baggage: describeBaggage(offer),
        fetchedAt,
      };
    })
    .filter((o) => Number.isFinite(o.totalAmount))
    .sort((a, b) => a.totalAmount - b.totalAmount);
}

/** Aeropuertos/ciudades por texto (para resolver códigos IATA). */
export async function suggestAirports(query: string): Promise<{ iata: string; name: string; type: string }[]> {
  if (!isFlightSearchConfigured()) return [];
  const res = await fetchJson<{ data: { iata_code: string | null; name: string; type: string }[] }>(
    "duffel",
    `${DUFFEL_API}/places/suggestions?query=${encodeURIComponent(query)}`,
    { headers: duffelHeaders(), cache: "no-store" },
  );
  return res.data
    .filter((p) => p.iata_code)
    .map((p) => ({ iata: p.iata_code!, name: p.name, type: p.type }));
}

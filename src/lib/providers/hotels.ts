import "server-only";
import { haversineKm, type LatLng } from "../domain/geo";
import { fetchJson, ProviderError } from "./http";

// Proveedor de hoteles con precios verificados: LiteAPI / Nuitée
// (https://liteapi.travel). Se activa con LITEAPI_KEY. Sin clave solo hay
// enlaces de búsqueda y estimaciones etiquetadas.
//
// ESTADO: adaptador implementado contra la documentación pública (v3.0);
// pendiente de validar con credenciales reales antes de producción.

export interface HotelSearch {
  city: string;
  countryCode: string;
  checkin: string;
  checkout: string;
  adults: number;
  rooms: number;
  currency: string;
  limit?: number;
  /** Centro de referencia para calcular la distancia de cada hotel. */
  center?: LatLng;
}

export interface HotelOffer {
  id: string;
  name: string;
  /** Precio total de la estancia para todas las habitaciones. */
  totalAmount: number;
  currency: string;
  stars: number | null;
  /** Valoración de huéspedes 0-10. */
  rating: number | null;
  address: string | null;
  lat: number | null;
  lng: number | null;
  distanceCenterKm: number | null;
  imageUrl: string | null;
  board: string | null;
  refundable: boolean | null;
  taxesNote: string;
  fetchedAt: string;
}

export function isHotelSearchConfigured(): boolean {
  return Boolean(process.env.LITEAPI_KEY);
}

interface LiteRate {
  boardName?: string;
  retailRate?: {
    total?: { amount: number; currency: string }[];
    taxesAndFees?: { included: boolean; description?: string; amount: number; currency: string }[] | null;
  };
  cancellationPolicies?: { refundableTag?: string };
}

interface LiteRatesResponse {
  data?: { hotelId: string; roomTypes?: { rates?: LiteRate[] }[] }[];
  hotels?: {
    id: string;
    name: string;
    main_photo?: string;
    address?: string;
    rating?: number;
    stars?: number;
    latitude?: number;
    longitude?: number;
  }[];
}

/** Reparte los adultos entre habitaciones (LiteAPI pide una ocupación por habitación). */
export function splitOccupancy(adults: number, rooms: number): { adults: number; children: number[] }[] {
  const n = Math.max(1, Math.min(rooms, adults));
  const base = Math.floor(adults / n);
  const extra = adults % n;
  return Array.from({ length: n }, (_, i) => ({ adults: base + (i < extra ? 1 : 0), children: [] }));
}

export async function searchHotels(search: HotelSearch): Promise<HotelOffer[]> {
  if (!isHotelSearchConfigured()) {
    throw new ProviderError("liteapi", "no configurado (falta LITEAPI_KEY)");
  }
  const body = {
    cityName: search.city,
    countryCode: search.countryCode.toUpperCase(),
    checkin: search.checkin,
    checkout: search.checkout,
    currency: search.currency,
    guestNationality: "ES",
    occupancies: splitOccupancy(search.adults, search.rooms),
    limit: search.limit ?? 30,
    maxRatesPerHotel: 1,
    includeHotelData: true,
    timeout: 12,
  };
  const res = await fetchJson<LiteRatesResponse>("liteapi", "https://api.liteapi.travel/v3.0/hotels/rates", {
    method: "POST",
    headers: {
      "X-API-Key": process.env.LITEAPI_KEY!,
      "Content-Type": "application/json",
      Accept: "application/json",
    },
    body: JSON.stringify(body),
    timeoutMs: 30_000,
    cache: "no-store",
  });
  const meta = new Map((res.hotels ?? []).map((h) => [h.id, h]));
  const fetchedAt = new Date().toISOString();
  const offers: HotelOffer[] = [];
  for (const entry of res.data ?? []) {
    const roomTypes = entry.roomTypes ?? [];
    if (roomTypes.length === 0) continue;
    // Con varias habitaciones, cada roomType del primer bloque cubre el grupo.
    const rate = roomTypes[0].rates?.[0];
    const total = rate?.retailRate?.total?.[0];
    if (!rate || !total || !Number.isFinite(total.amount)) continue;
    const excluded = (rate.retailRate?.taxesAndFees ?? []).filter((t) => !t.included);
    const hotel = meta.get(entry.hotelId);
    offers.push({
      id: entry.hotelId,
      name: hotel?.name ?? `Hotel ${entry.hotelId}`,
      totalAmount: total.amount,
      currency: total.currency,
      stars: hotel?.stars ?? null,
      rating: hotel?.rating ?? null,
      address: hotel?.address ?? null,
      lat: hotel?.latitude ?? null,
      lng: hotel?.longitude ?? null,
      distanceCenterKm:
        search.center && typeof hotel?.latitude === "number" && typeof hotel?.longitude === "number"
          ? Math.round(haversineKm(search.center, { lat: hotel.latitude, lng: hotel.longitude }) * 10) / 10
          : null,
      imageUrl: hotel?.main_photo ?? null,
      board: rate.boardName ?? null,
      refundable: rate.cancellationPolicies?.refundableTag
        ? rate.cancellationPolicies.refundableTag === "RFN"
        : null,
      taxesNote:
        excluded.length === 0
          ? "Impuestos y tasas incluidos"
          : `No incluye: ${excluded
              .map((t) => `${t.description ?? "tasa"} (${t.amount} ${t.currency})`)
              .join(", ")} — se pagan en el alojamiento`,
      fetchedAt,
    });
  }
  return offers.sort((a, b) => a.totalAmount - b.totalAmount);
}

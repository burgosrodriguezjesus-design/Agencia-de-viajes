import "server-only";
import { fetchJson } from "./http";

// Geocodificación con Open-Meteo (datos de GeoNames). Gratuita y sin clave
// para uso no comercial; para producción comercial requiere su plan de pago
// o sustituir este adaptador (misma interfaz) por Mapbox/Google.

export interface GeoPlace {
  name: string;
  country: string | null;
  countryCode: string | null;
  admin: string | null;
  lat: number;
  lng: number;
  timezone: string | null;
  population: number | null;
}

interface OpenMeteoGeoResponse {
  results?: {
    name: string;
    country?: string;
    country_code?: string;
    admin1?: string;
    latitude: number;
    longitude: number;
    timezone?: string;
    population?: number;
  }[];
}

export async function searchPlaces(query: string, count = 6): Promise<GeoPlace[]> {
  const q = query.trim();
  if (q.length < 2) return [];
  const url = `https://geocoding-api.open-meteo.com/v1/search?name=${encodeURIComponent(q)}&count=${count}&language=es&format=json`;
  const data = await fetchJson<OpenMeteoGeoResponse>("open-meteo-geocoding", url, {
    next: { revalidate: 86_400 },
  });
  return (data.results ?? []).map((r) => ({
    name: r.name,
    country: r.country ?? null,
    countryCode: r.country_code ?? null,
    admin: r.admin1 ?? null,
    lat: r.latitude,
    lng: r.longitude,
    timezone: r.timezone ?? null,
    population: r.population ?? null,
  }));
}

/** Mejor coincidencia para un texto libre ("Kioto", "Roma, Italia"). */
export async function geocode(query: string): Promise<GeoPlace | null> {
  const [city] = query.split(",");
  const results = await searchPlaces(city, 5);
  if (results.length === 0) return null;
  const hint = query.split(",")[1]?.trim().toLowerCase();
  if (hint) {
    const match = results.find(
      (r) => r.country?.toLowerCase().includes(hint) || r.admin?.toLowerCase().includes(hint),
    );
    if (match) return match;
  }
  return results[0];
}

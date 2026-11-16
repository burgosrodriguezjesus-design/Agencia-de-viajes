import "server-only";
import { haversineKm, type LatLng } from "../domain/geo";
import { fetchJson, OPEN_DATA_UA, ProviderError, wikimediaHeaders } from "./http";

// Lugares de interés reales a partir de Wikipedia (búsqueda geográfica) y
// restaurantes a partir de OpenStreetMap (Overpass). Sin clave. Son datos
// abiertos: se muestran con enlace a la fuente y sin precios.

export interface Poi {
  ref: string; // p. ej. "wikipedia:es:12345"
  title: string;
  description: string | null;
  lat: number;
  lng: number;
  imageUrl: string | null;
  sourceUrl: string;
  /** Visitas a la página en los últimos 30 días: indicador de popularidad. */
  popularity: number;
  distanceKm: number;
}

interface WikiGeoResponse {
  query?: {
    pages?: Record<
      string,
      {
        pageid: number;
        title: string;
        description?: string;
        coordinates?: { lat: number; lon: number }[];
        thumbnail?: { source: string };
        pageviews?: Record<string, number | null>;
        fullurl?: string;
      }
    >;
  };
}

// Páginas que tienen coordenadas pero no son planes para un viajero.
const EXCLUDED = [
  /\b(estaci[oó]n|station|l[ií]nea|metro|aeropuerto|airport|autopista|carretera|highway)\b/i,
  /\b(distrito|barrio administrativo|municipio|prefectura|provincia|ward|district|county|subdivisi[oó]n)\b/i,
  /\b(escuela|colegio|instituto|universidad|school|university|college|hospital|cl[ií]nica)\b/i,
  /\b(empresa|compa[ñn][ií]a|company|corporation|sede|headquarters|f[aá]brica|factory)\b/i,
  /\b(batalla|asedio|incidente|atentado|accidente|terremoto|battle|siege|incident|earthquake|elecci[oó]n)\b/i,
  /\b(consulado|embajada|ministerio|c[aá]rcel|prisi[oó]n|cementerio municipal)\b/i,
  /\b(circunscripci[oó]n|diócesis|archidi[oó]cesis|equipo de|club de f[uú]tbol)\b/i,
];

function isTouristic(title: string, description: string | null): boolean {
  const text = `${title} ${description ?? ""}`;
  return !EXCLUDED.some((re) => re.test(text));
}

async function geosearch(lang: "es" | "en", center: LatLng, radiusM: number, limit: number): Promise<Poi[]> {
  const params = new URLSearchParams({
    action: "query",
    format: "json",
    generator: "geosearch",
    ggscoord: `${center.lat}|${center.lng}`,
    ggsradius: String(Math.min(10_000, radiusM)),
    ggslimit: String(limit),
    prop: "coordinates|pageimages|description|pageviews|info",
    inprop: "url",
    pithumbsize: "640",
    pilimit: "max",
    colimit: "max",
    pvipdays: "30",
  });
  const data = await fetchJson<WikiGeoResponse>(
    `wikipedia-${lang}`,
    `https://${lang}.wikipedia.org/w/api.php?${params}`,
    { headers: wikimediaHeaders(), next: { revalidate: 86_400 }, retries: 1, maxRetryAfterMs: 20_000 },
  );
  const pages = Object.values(data.query?.pages ?? {});
  return pages
    .filter((p) => p.coordinates?.[0])
    .map((p) => {
      const coord = p.coordinates![0];
      const views = Object.values(p.pageviews ?? {}).reduce<number>((s, v) => s + (v ?? 0), 0);
      return {
        ref: `wikipedia:${lang}:${p.pageid}`,
        title: p.title,
        description: p.description ?? null,
        lat: coord.lat,
        lng: coord.lon,
        imageUrl: p.thumbnail?.source ?? null,
        sourceUrl: p.fullurl ?? `https://${lang}.wikipedia.org/?curid=${p.pageid}`,
        popularity: views,
        distanceKm: haversineKm(center, { lat: coord.lat, lng: coord.lon }),
      };
    });
}

/**
 * Lugares de interés alrededor de un punto, ordenados por popularidad.
 * Prueba primero Wikipedia en español y, si falla o hay pocos, en inglés.
 */
export async function findPois(center: LatLng, opts: { radiusKm?: number; limit?: number } = {}): Promise<Poi[]> {
  const radiusM = (opts.radiusKm ?? 8) * 1000;
  const limit = opts.limit ?? 30;
  let pois: Poi[] = [];
  let lastError: unknown = null;
  for (const lang of ["es", "en"] as const) {
    try {
      pois = await geosearch(lang, center, radiusM, 200);
      if (pois.length >= 8) break;
    } catch (err) {
      lastError = err;
    }
  }
  if (pois.length === 0) {
    // Segunda fuente: atracciones de OpenStreetMap (sin popularidad ni fotos).
    try {
      pois = await findPoisOsm(center, radiusM);
    } catch {
      // se informa del error de la fuente principal
    }
  }
  if (pois.length === 0 && lastError) {
    throw lastError instanceof ProviderError ? lastError : new ProviderError("wikipedia", "sin resultados");
  }
  return pois
    .filter((p) => isTouristic(p.title, p.description))
    .filter((p) => p.distanceKm > 0.02) // descarta la propia página de la ciudad
    .sort((a, b) => b.popularity - a.popularity)
    .slice(0, limit);
}

/**
 * Atracciones turísticas de OpenStreetMap como fuente alternativa. Solo
 * elementos con nombre y con ficha en Wikipedia/Wikidata (señal de relevancia).
 */
async function findPoisOsm(center: LatLng, radiusM: number): Promise<Poi[]> {
  const around = `(around:${Math.min(10_000, radiusM)},${center.lat},${center.lng})`;
  const query = `[out:json][timeout:20];(nwr${around}["tourism"~"^(attraction|museum|viewpoint|gallery|zoo|theme_park|aquarium)$"]["name"]["wikidata"];nwr${around}["historic"~"^(castle|monument|ruins|archaeological_site|palace|temple)$"]["name"]["wikidata"];);out center 120;`;
  const data = await fetchJson<{
    elements?: { type: string; id: number; lat?: number; lon?: number; center?: { lat: number; lon: number }; tags?: Record<string, string> }[];
  }>("overpass", "https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": OPEN_DATA_UA },
    body: `data=${encodeURIComponent(query)}`,
    timeoutMs: 25_000,
    retries: 0,
  });
  return (data.elements ?? [])
    .map((e): Poi | null => {
      const lat = e.lat ?? e.center?.lat;
      const lng = e.lon ?? e.center?.lon;
      const tags = e.tags ?? {};
      if (typeof lat !== "number" || typeof lng !== "number" || !tags.name) return null;
      const kind = tags.tourism ?? tags.historic ?? null;
      return {
        ref: `osm:${e.type}/${e.id}`,
        title: tags["name:es"] ?? tags.name,
        description: kind ? kind.replace(/_/g, " ") : null,
        lat,
        lng,
        imageUrl: null,
        sourceUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
        // Sin datos de visitas: se prioriza lo que tiene artículo en Wikipedia.
        popularity: tags.wikipedia ? 2 : 1,
        distanceKm: haversineKm(center, { lat, lng }),
      };
    })
    .filter((p): p is Poi => p !== null);
}

/** Imagen y resumen de un destino (página de Wikipedia de la ciudad). */
export async function getDestinationMedia(
  name: string,
): Promise<{ imageUrl: string; credit: string; extract: string | null } | null> {
  for (const lang of ["es", "en"] as const) {
    try {
      const params = new URLSearchParams({
        action: "query",
        format: "json",
        titles: name,
        redirects: "1",
        prop: "pageimages|extracts|info",
        inprop: "url",
        pithumbsize: "1600",
        exintro: "1",
        explaintext: "1",
        exsentences: "2",
      });
      const data = await fetchJson<{
        query?: { pages?: Record<string, { thumbnail?: { source: string }; extract?: string; fullurl?: string }> };
      }>(`wikipedia-${lang}`, `https://${lang}.wikipedia.org/w/api.php?${params}`, {
        headers: wikimediaHeaders(),
        next: { revalidate: 604_800 },
        retries: 0,
      });
      const page = Object.values(data.query?.pages ?? {})[0];
      if (page?.thumbnail?.source) {
        return {
          imageUrl: page.thumbnail.source,
          credit: `Imagen: Wikimedia Commons, vía Wikipedia (${page.fullurl ?? "wikipedia.org"})`,
          extract: page.extract ?? null,
        };
      }
    } catch {
      // probamos el siguiente idioma
    }
  }
  return null;
}

// ── Restaurantes (OpenStreetMap / Overpass) ─────────────────────────────

export interface Restaurant {
  ref: string;
  name: string;
  cuisine: string | null;
  lat: number;
  lng: number;
  address: string | null;
  website: string | null;
  sourceUrl: string;
  distanceKm: number;
}

interface OverpassResponse {
  elements?: { type: string; id: number; lat?: number; lon?: number; tags?: Record<string, string> }[];
}

export async function findRestaurants(
  center: LatLng,
  opts: { radiusM?: number; cuisine?: string; limit?: number } = {},
): Promise<Restaurant[]> {
  const radius = Math.min(3000, opts.radiusM ?? 900);
  const cuisineFilter = opts.cuisine ? `["cuisine"~"${opts.cuisine.replace(/[^a-zA-Z_ ]/g, "")}",i]` : "";
  const query = `[out:json][timeout:15];node(around:${radius},${center.lat},${center.lng})["amenity"="restaurant"]["name"]${cuisineFilter};out 60;`;
  const data = await fetchJson<OverpassResponse>("overpass", "https://overpass-api.de/api/interpreter", {
    method: "POST",
    headers: { "Content-Type": "application/x-www-form-urlencoded", "User-Agent": OPEN_DATA_UA },
    body: `data=${encodeURIComponent(query)}`,
    timeoutMs: 20_000,
  });
  return (data.elements ?? [])
    .filter((e) => typeof e.lat === "number" && typeof e.lon === "number" && e.tags?.name)
    .map((e) => {
      const tags = e.tags!;
      const street = [tags["addr:street"], tags["addr:housenumber"]].filter(Boolean).join(" ");
      return {
        ref: `osm:${e.type}/${e.id}`,
        name: tags.name,
        cuisine: tags.cuisine?.replace(/[_;]/g, " ") ?? null,
        lat: e.lat!,
        lng: e.lon!,
        address: street || null,
        website: tags.website ?? tags["contact:website"] ?? null,
        sourceUrl: `https://www.openstreetmap.org/${e.type}/${e.id}`,
        distanceKm: haversineKm(center, { lat: e.lat!, lng: e.lon! }),
      };
    })
    .sort((a, b) => a.distanceKm - b.distanceKm)
    .slice(0, opts.limit ?? 12);
}

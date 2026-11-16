import { searchPlaces } from "@/lib/providers/geocoding";

/** Autocompletado de ciudades para los buscadores (datos reales de Open-Meteo). */
export async function GET(request: Request) {
  const q = new URL(request.url).searchParams.get("q")?.trim() ?? "";
  if (q.length < 2 || q.length > 80) return Response.json({ places: [] });
  try {
    const places = await searchPlaces(q, 6);
    return Response.json(
      {
        places: places.map((p) => ({
          name: p.name,
          region: [p.admin, p.country].filter(Boolean).join(", "),
          label: [p.name, p.country].filter(Boolean).join(", "),
        })),
      },
      { headers: { "Cache-Control": "public, max-age=3600" } },
    );
  } catch {
    return Response.json({ places: [] });
  }
}

import "server-only";
import type { LatLng } from "../domain/geo";
import { fetchJson } from "./http";

// Previsión real de Open-Meteo. Solo existe para los próximos ~16 días: para
// fechas más lejanas no se devuelve nada (no inventamos el tiempo).

export interface DayForecast {
  date: string;
  tempMax: number;
  tempMin: number;
  rainProbability: number | null;
  /** Código meteorológico WMO. */
  code: number;
  summary: string;
  rainy: boolean;
}

interface ForecastResponse {
  daily?: {
    time: string[];
    weather_code: number[];
    temperature_2m_max: number[];
    temperature_2m_min: number[];
    precipitation_probability_max: (number | null)[];
  };
}

export function describeWeatherCode(code: number): string {
  if (code === 0) return "Despejado";
  if (code <= 2) return "Poco nuboso";
  if (code === 3) return "Nublado";
  if (code <= 48) return "Niebla";
  if (code <= 57) return "Llovizna";
  if (code <= 67) return "Lluvia";
  if (code <= 77) return "Nieve";
  if (code <= 82) return "Chubascos";
  if (code <= 86) return "Chubascos de nieve";
  return "Tormenta";
}

export async function getForecast(center: LatLng, startDate: string, endDate: string): Promise<DayForecast[]> {
  const today = new Date();
  const horizon = new Date(today.getTime() + 15 * 86_400_000).toISOString().slice(0, 10);
  const todayIso = today.toISOString().slice(0, 10);
  const from = startDate < todayIso ? todayIso : startDate;
  const to = endDate > horizon ? horizon : endDate;
  if (from > to) return [];

  const params = new URLSearchParams({
    latitude: String(center.lat),
    longitude: String(center.lng),
    daily: "weather_code,temperature_2m_max,temperature_2m_min,precipitation_probability_max",
    timezone: "auto",
    start_date: from,
    end_date: to,
  });
  const data = await fetchJson<ForecastResponse>("open-meteo", `https://api.open-meteo.com/v1/forecast?${params}`, {
    next: { revalidate: 3 * 3600 },
  });
  const d = data.daily;
  if (!d) return [];
  return d.time.map((date, i) => {
    const code = d.weather_code[i];
    const prob = d.precipitation_probability_max[i];
    return {
      date,
      tempMax: Math.round(d.temperature_2m_max[i]),
      tempMin: Math.round(d.temperature_2m_min[i]),
      rainProbability: prob,
      code,
      summary: describeWeatherCode(code),
      rainy: (prob ?? 0) >= 60 || (code >= 51 && code <= 67) || (code >= 80 && code <= 82) || code >= 95,
    };
  });
}

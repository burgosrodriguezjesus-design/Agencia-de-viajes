import { minutesToTime, timeToMinutes } from "./dates";
import { estimateLeg, hasCoords, optimizeOrder, type Leg } from "./geo";
import type { ItineraryItem, Pace } from "./types";

export const PACE_CONFIG: Record<Pace, { perDay: number; dayStart: string; buffer: number }> = {
  relajado: { perDay: 3, dayStart: "10:00", buffer: 20 },
  equilibrado: { perDay: 4, dayStart: "09:30", buffer: 15 },
  intenso: { perDay: 6, dayStart: "09:00", buffer: 10 },
};

type Schedulable = Pick<ItineraryItem, "id" | "start_time" | "duration_min" | "lat" | "lng">;

export interface ScheduledEntry<T> {
  item: T;
  /** Trayecto desde el elemento anterior con coordenadas (aproximado). */
  legFromPrev: Leg | null;
  start_time: string;
  end_time: string;
}

/** Trayectos entre elementos consecutivos; null si falta alguna coordenada. */
export function computeLegs<T extends Pick<ItineraryItem, "lat" | "lng">>(items: T[]): (Leg | null)[] {
  return items.map((item, i) => {
    if (i === 0) return null;
    const prev = items[i - 1];
    return hasCoords(prev) && hasCoords(item) ? estimateLeg(prev, item) : null;
  });
}

/**
 * Recalcula los horarios de un día a partir del orden actual: cada elemento
 * empieza cuando termina el anterior más el trayecto y un margen. Se usa
 * tras arrastrar una actividad o al optimizar la ruta.
 */
export function scheduleDay<T extends Schedulable>(
  items: T[],
  opts: { dayStart?: string; buffer?: number } = {},
): ScheduledEntry<T>[] {
  const buffer = opts.buffer ?? 15;
  let cursor = timeToMinutes(opts.dayStart ?? "09:30") ?? 570;
  const legs = computeLegs(items);
  return items.map((item, i) => {
    const leg = legs[i];
    if (i > 0) cursor += (leg?.minutes ?? 0) + buffer;
    const start = Math.min(cursor, 23 * 60 + 59);
    const end = Math.min(start + item.duration_min, 23 * 60 + 59);
    cursor = end;
    return { item, legFromPrev: leg, start_time: minutesToTime(start), end_time: minutesToTime(end) };
  });
}

/** Totales de desplazamiento del día (aprox.). */
export function dayTravelTotals(legs: (Leg | null)[]): { minutes: number; km: number } {
  return legs.reduce(
    (acc, leg) => (leg ? { minutes: acc.minutes + leg.minutes, km: acc.km + leg.km } : acc),
    { minutes: 0, km: 0 },
  );
}

/**
 * Reordena las actividades de un día para reducir desplazamientos. Los
 * elementos sin coordenadas conservan su posición relativa al final.
 */
export function optimizeDayOrder<T extends Schedulable>(items: T[]): T[] {
  const located = items.filter(hasCoords);
  const rest = items.filter((i) => !hasCoords(i));
  if (located.length < 3) return items;
  const order = optimizeOrder(located.map((i) => ({ lat: i.lat, lng: i.lng })));
  return order.map((idx) => located[idx] as T).concat(rest);
}

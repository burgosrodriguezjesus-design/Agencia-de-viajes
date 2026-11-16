// Geometría y optimización de rutas. Todo es determinista y sin red: los
// tiempos de trayecto son APROXIMACIONES (distancia en línea recta corregida)
// y así se muestran en la interfaz.

export interface LatLng {
  lat: number;
  lng: number;
}

export type TravelMode = "walk" | "transit";

export interface Leg {
  km: number;
  minutes: number;
  mode: TravelMode;
}

const EARTH_RADIUS_KM = 6371;
/** Las calles no van en línea recta: factor medio de rodeo urbano. */
const DETOUR_FACTOR = 1.3;
const WALK_KMH = 4.6;
const TRANSIT_KMH = 18;
const TRANSIT_OVERHEAD_MIN = 8; // esperas y accesos
const WALK_MAX_KM = 1.6;

export function hasCoords<T extends { lat: number | null; lng: number | null }>(
  p: T,
): p is T & LatLng {
  return typeof p.lat === "number" && typeof p.lng === "number";
}

export function haversineKm(a: LatLng, b: LatLng): number {
  const toRad = (deg: number) => (deg * Math.PI) / 180;
  const dLat = toRad(b.lat - a.lat);
  const dLng = toRad(b.lng - a.lng);
  const h =
    Math.sin(dLat / 2) ** 2 + Math.cos(toRad(a.lat)) * Math.cos(toRad(b.lat)) * Math.sin(dLng / 2) ** 2;
  return 2 * EARTH_RADIUS_KM * Math.asin(Math.min(1, Math.sqrt(h)));
}

/** Trayecto aproximado entre dos puntos: a pie si está cerca, transporte si no. */
export function estimateLeg(a: LatLng, b: LatLng): Leg {
  const km = haversineKm(a, b) * DETOUR_FACTOR;
  if (km <= WALK_MAX_KM) {
    return { km, minutes: Math.max(1, Math.round((km / WALK_KMH) * 60)), mode: "walk" };
  }
  return {
    km,
    minutes: Math.round((km / TRANSIT_KMH) * 60 + TRANSIT_OVERHEAD_MIN),
    mode: "transit",
  };
}

export function routeLengthKm(points: LatLng[]): number {
  let total = 0;
  for (let i = 1; i < points.length; i++) total += haversineKm(points[i - 1], points[i]);
  return total;
}

/**
 * Ordena puntos para minimizar el recorrido (ruta abierta): vecino más cercano
 * seguido de mejora 2-opt. Devuelve los índices originales en el nuevo orden.
 * `fixedStart` mantiene el primer punto en su sitio (p. ej. el hotel).
 */
export function optimizeOrder(points: LatLng[], fixedStart = false): number[] {
  const n = points.length;
  if (n <= 2) return points.map((_, i) => i);

  const candidates = fixedStart ? [0] : points.map((_, i) => i);
  let best: number[] = [];
  let bestLen = Infinity;

  for (const start of candidates) {
    const order = [start];
    const left = new Set(points.map((_, i) => i));
    left.delete(start);
    while (left.size > 0) {
      const last = points[order[order.length - 1]];
      let next = -1;
      let nextDist = Infinity;
      for (const i of left) {
        const d = haversineKm(last, points[i]);
        if (d < nextDist) {
          nextDist = d;
          next = i;
        }
      }
      order.push(next);
      left.delete(next);
    }
    const improved = twoOpt(order, points, fixedStart);
    const len = routeLengthKm(improved.map((i) => points[i]));
    if (len < bestLen - 1e-9) {
      bestLen = len;
      best = improved;
    }
  }
  return best;
}

function twoOpt(order: number[], points: LatLng[], fixedStart: boolean): number[] {
  let route = order.slice();
  let improved = true;
  const from = fixedStart ? 1 : 0;
  let guard = 0;
  while (improved && guard++ < 50) {
    improved = false;
    for (let i = from; i < route.length - 1; i++) {
      for (let j = i + 1; j < route.length; j++) {
        const candidate = route
          .slice(0, i)
          .concat(route.slice(i, j + 1).reverse(), route.slice(j + 1));
        if (
          routeLengthKm(candidate.map((k) => points[k])) + 1e-9 <
          routeLengthKm(route.map((k) => points[k]))
        ) {
          route = candidate;
          improved = true;
        }
      }
    }
  }
  return route;
}

/**
 * Agrupa puntos en `k` días por proximidad (k-means con inicialización
 * determinista por punto más lejano) y equilibra el tamaño de los grupos para
 * que ningún día quede sobrecargado. Devuelve, para cada punto, su grupo.
 */
export function clusterIntoDays(points: LatLng[], k: number, maxPerDay: number): number[] {
  const n = points.length;
  if (n === 0) return [];
  const groups = Math.max(1, Math.min(k, n));
  if (groups === 1) return points.map(() => 0);

  // Inicialización: el más cercano al centroide global y luego los más lejanos.
  const centroidAll = meanPoint(points);
  const centers: LatLng[] = [];
  let first = 0;
  let firstDist = Infinity;
  points.forEach((p, i) => {
    const d = haversineKm(p, centroidAll);
    if (d < firstDist) {
      firstDist = d;
      first = i;
    }
  });
  centers.push(points[first]);
  while (centers.length < groups) {
    let far = 0;
    let farDist = -1;
    points.forEach((p, i) => {
      const d = Math.min(...centers.map((c) => haversineKm(p, c)));
      if (d > farDist) {
        farDist = d;
        far = i;
      }
    });
    centers.push(points[far]);
  }

  let assignment = new Array<number>(n).fill(0);
  for (let iter = 0; iter < 20; iter++) {
    const next = points.map((p) => nearestIndex(p, centers));
    for (let g = 0; g < groups; g++) {
      const members = points.filter((_, i) => next[i] === g);
      if (members.length > 0) centers[g] = meanPoint(members);
    }
    const changed = next.some((g, i) => g !== assignment[i]);
    assignment = next;
    if (!changed) break;
  }

  // Equilibrado: mueve el punto más periférico de los grupos saturados al
  // grupo con hueco cuyo centro quede más cerca.
  const capacity = Math.max(maxPerDay, Math.ceil(n / groups));
  for (let guard = 0; guard < n * groups; guard++) {
    const sizes = countSizes(assignment, groups);
    const over = sizes.findIndex((s) => s > capacity);
    if (over === -1) break;
    let moveIdx = -1;
    let moveTo = -1;
    let bestCost = Infinity;
    assignment.forEach((g, i) => {
      if (g !== over) return;
      for (let target = 0; target < groups; target++) {
        if (target === over || sizes[target] >= capacity) continue;
        const cost = haversineKm(points[i], centers[target]) - haversineKm(points[i], centers[over]);
        if (cost < bestCost) {
          bestCost = cost;
          moveIdx = i;
          moveTo = target;
        }
      }
    });
    if (moveIdx === -1) break;
    assignment[moveIdx] = moveTo;
  }
  return assignment;
}

function countSizes(assignment: number[], groups: number): number[] {
  const sizes = new Array<number>(groups).fill(0);
  assignment.forEach((g) => sizes[g]++);
  return sizes;
}

function nearestIndex(p: LatLng, centers: LatLng[]): number {
  let best = 0;
  let bestDist = Infinity;
  centers.forEach((c, i) => {
    const d = haversineKm(p, c);
    if (d < bestDist) {
      bestDist = d;
      best = i;
    }
  });
  return best;
}

export function meanPoint(points: LatLng[]): LatLng {
  const sum = points.reduce((acc, p) => ({ lat: acc.lat + p.lat, lng: acc.lng + p.lng }), { lat: 0, lng: 0 });
  return { lat: sum.lat / points.length, lng: sum.lng / points.length };
}

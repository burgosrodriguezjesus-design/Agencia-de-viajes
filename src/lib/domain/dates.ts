// Utilidades de fechas sin dependencia de la zona horaria ni del locale del
// servidor: las fechas de viaje son "fechas de calendario" (YYYY-MM-DD) y los
// textos se generan a mano para que servidor y navegador rendericen lo mismo.

const WEEKDAYS = ["domingo", "lunes", "martes", "miércoles", "jueves", "viernes", "sábado"];
const WEEKDAYS_SHORT = ["dom", "lun", "mar", "mié", "jue", "vie", "sáb"];
const MONTHS = [
  "enero", "febrero", "marzo", "abril", "mayo", "junio",
  "julio", "agosto", "septiembre", "octubre", "noviembre", "diciembre",
];
const MONTHS_SHORT = ["ene", "feb", "mar", "abr", "may", "jun", "jul", "ago", "sep", "oct", "nov", "dic"];

export function isIsoDate(value: unknown): value is string {
  if (typeof value !== "string" || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = parseIsoDate(value);
  return !Number.isNaN(d.getTime()) && toIsoDate(d) === value;
}

/** Interpreta YYYY-MM-DD como medianoche UTC. */
export function parseIsoDate(iso: string): Date {
  const [y, m, d] = iso.split("-").map(Number);
  return new Date(Date.UTC(y, m - 1, d));
}

export function toIsoDate(date: Date): string {
  return date.toISOString().slice(0, 10);
}

export function addDays(iso: string, days: number): string {
  const d = parseIsoDate(iso);
  d.setUTCDate(d.getUTCDate() + days);
  return toIsoDate(d);
}

export function diffDays(startIso: string, endIso: string): number {
  return Math.round((parseIsoDate(endIso).getTime() - parseIsoDate(startIso).getTime()) / 86_400_000);
}

/** Días naturales del viaje, ambos extremos incluidos. */
export function tripDates(startIso: string, endIso: string): string[] {
  const n = diffDays(startIso, endIso);
  if (n < 0) return [];
  return Array.from({ length: n + 1 }, (_, i) => addDays(startIso, i));
}

export function tripNights(startIso: string, endIso: string): number {
  return Math.max(0, diffDays(startIso, endIso));
}

/** "lunes, 3 de marzo" */
export function formatDayLong(iso: string): string {
  const d = parseIsoDate(iso);
  return `${WEEKDAYS[d.getUTCDay()]}, ${d.getUTCDate()} de ${MONTHS[d.getUTCMonth()]}`;
}

/** "lun 3 mar" */
export function formatDayShort(iso: string): string {
  const d = parseIsoDate(iso);
  return `${WEEKDAYS_SHORT[d.getUTCDay()]} ${d.getUTCDate()} ${MONTHS_SHORT[d.getUTCMonth()]}`;
}

/** "3 – 10 mar 2027" / "28 feb – 4 mar 2027" */
export function formatDateRange(startIso: string, endIso: string): string {
  const a = parseIsoDate(startIso);
  const b = parseIsoDate(endIso);
  const sameMonth = a.getUTCMonth() === b.getUTCMonth() && a.getUTCFullYear() === b.getUTCFullYear();
  const left = sameMonth ? `${a.getUTCDate()}` : `${a.getUTCDate()} ${MONTHS_SHORT[a.getUTCMonth()]}`;
  return `${left} – ${b.getUTCDate()} ${MONTHS_SHORT[b.getUTCMonth()]} ${b.getUTCFullYear()}`;
}

/** "HH:MM" (acepta "HH:MM:SS" de Postgres) → minutos desde medianoche. */
export function timeToMinutes(time: string | null | undefined): number | null {
  if (!time) return null;
  const m = /^(\d{1,2}):(\d{2})/.exec(time);
  if (!m) return null;
  return Number(m[1]) * 60 + Number(m[2]);
}

export function minutesToTime(total: number): string {
  const clamped = Math.max(0, Math.min(23 * 60 + 59, Math.round(total)));
  const h = Math.floor(clamped / 60);
  const m = clamped % 60;
  return `${String(h).padStart(2, "0")}:${String(m).padStart(2, "0")}`;
}

export function formatDuration(minutes: number): string {
  if (minutes < 60) return `${Math.round(minutes)} min`;
  const h = Math.floor(minutes / 60);
  const m = Math.round(minutes % 60);
  return m === 0 ? `${h} h` : `${h} h ${m} min`;
}

import type { ItineraryItem, OptionCategory, PriceStatus, Tier, Trip, TripOption } from "./types";

// ─────────────────────────────────────────────────────────────────────────
// Política de precios: un importe solo cuenta como "confirmado" si procede de
// un proveedor (verified), del usuario (user) o es gratuito (free). Todo lo
// demás es estimación y se etiqueta como tal. Un "ahorro" solo se llama
// verificado cuando LOS DOS precios comparados están confirmados.
// ─────────────────────────────────────────────────────────────────────────

export function isConfirmed(status: PriceStatus): boolean {
  return status === "verified" || status === "user" || status === "free";
}

export const PRICE_STATUS_LABEL: Record<PriceStatus, string> = {
  verified: "Precio verificado",
  user: "Confirmado por ti",
  free: "Gratis",
  estimate: "Estimación",
  unknown: "Sin precio",
};

export function formatMoney(amount: number | null | undefined, currency = "EUR"): string {
  if (amount === null || amount === undefined || Number.isNaN(amount)) return "—";
  const rounded = Math.abs(amount) >= 100 ? Math.round(amount) : Math.round(amount * 100) / 100;
  const hasDecimals = !Number.isInteger(rounded);
  const [intPart, decPart] = Math.abs(rounded).toFixed(hasDecimals ? 2 : 0).split(".");
  const grouped = intPart.replace(/\B(?=(\d{3})+(?!\d))/g, ".");
  const symbol = CURRENCY_SYMBOL[currency] ?? currency;
  const sign = rounded < 0 ? "−" : "";
  return `${sign}${grouped}${decPart ? `,${decPart}` : ""} ${symbol}`;
}

const CURRENCY_SYMBOL: Record<string, string> = { EUR: "€", USD: "$", GBP: "£", MXN: "MXN", JPY: "¥" };

export interface PricePoint {
  amount: number | null;
  currency: string;
  status: PriceStatus;
}

export interface Saving {
  amount: number;
  percent: number;
  /** "verified" solo si ambos precios están confirmados. */
  basis: "verified" | "estimate";
}

/**
 * Diferencia entre un precio actual y una alternativa. Devuelve null cuando
 * no hay comparación real posible (falta un importe, divisas distintas o la
 * alternativa no es más barata): en ese caso NO se muestra ningún ahorro.
 */
export function compareSavings(current: PricePoint, proposed: PricePoint): Saving | null {
  if (current.amount === null || proposed.amount === null) return null;
  if (current.currency !== proposed.currency) return null;
  if (current.status === "unknown" || proposed.status === "unknown") return null;
  const amount = current.amount - proposed.amount;
  if (amount <= 0) return null;
  return {
    amount,
    percent: current.amount > 0 ? Math.round((amount / current.amount) * 100) : 0,
    basis: isConfirmed(current.status) && isConfirmed(proposed.status) ? "verified" : "estimate",
  };
}

// ─────────────────────────────────────────────────────────────────────────
// Selección de las tres alternativas: económica, calidad-precio y premium.
// La afiliación NO interviene: la función ni siquiera recibe ese dato.
// ─────────────────────────────────────────────────────────────────────────

export interface Rankable {
  id: string;
  price: number | null;
  /** Calidad 0-10 (valoración del hotel, comodidad del vuelo...). */
  quality: number | null;
  confirmed: boolean;
}

export function toRankable(option: TripOption): Rankable {
  return {
    id: option.id,
    price: option.price_amount,
    quality: optionQuality(option),
    confirmed: isConfirmed(option.price_status),
  };
}

/** Calidad 0-10 derivada de los datos objetivos de la opción. */
export function optionQuality(option: Pick<TripOption, "category" | "details">): number | null {
  const d = option.details ?? {};
  if (typeof d.quality === "number") return clamp(d.quality, 0, 10);
  if (option.category === "hotel") {
    if (typeof d.rating === "number") {
      const distancePenalty = typeof d.distance_center_km === "number" ? Math.min(2, d.distance_center_km * 0.25) : 0;
      return clamp(d.rating - distancePenalty, 0, 10);
    }
    if (typeof d.stars === "number") return clamp(d.stars * 2, 0, 10);
    return null;
  }
  if (option.category === "flight") {
    if (typeof d.stops !== "number" && typeof d.duration_min !== "number") return null;
    const stops = d.stops ?? 0;
    const hours = (d.duration_min ?? 0) / 60;
    return clamp(10 - stops * 2 - Math.max(0, hours - 2) * 0.25, 0, 10);
  }
  return null;
}

export function pickTiers(options: Rankable[]): Partial<Record<Tier, string>> {
  const priced = options.filter((o): o is Rankable & { price: number } => o.price !== null && o.price > 0);
  if (priced.length === 0) return {};
  // A igualdad de precio, primero el confirmado.
  const byPrice = priced
    .slice()
    .sort((a, b) => a.price - b.price || Number(b.confirmed) - Number(a.confirmed) || a.id.localeCompare(b.id));
  const result: Partial<Record<Tier, string>> = { cheapest: byPrice[0].id };

  const withQuality = priced.filter((o): o is Rankable & { price: number; quality: number } => o.quality !== null);
  if (withQuality.length > 0) {
    const premium = withQuality
      .slice()
      .sort((a, b) => b.quality - a.quality || b.price - a.price || a.id.localeCompare(b.id))[0];
    const minPrice = byPrice[0].price;
    // Calidad por euro relativo al más barato: evita que gane siempre el más barato.
    const value = (o: { price: number; quality: number }) => o.quality / Math.sqrt(o.price / minPrice);
    const bestValue = withQuality
      .slice()
      .sort((a, b) => value(b) - value(a) || a.price - b.price || a.id.localeCompare(b.id))[0];
    result.best_value = bestValue.id;
    if (premium.id !== byPrice[0].id) result.premium = premium.id;
  }
  return result;
}

// ─────────────────────────────────────────────────────────────────────────
// Presupuesto del viaje
// ─────────────────────────────────────────────────────────────────────────

export type BudgetCategory = "flight" | "hotel" | "transport" | "activity" | "food";

export const BUDGET_CATEGORY_LABEL: Record<BudgetCategory, string> = {
  flight: "Vuelos",
  hotel: "Alojamiento",
  transport: "Transporte",
  activity: "Actividades",
  food: "Comidas",
};

export interface BudgetLine {
  category: BudgetCategory;
  label: string;
  amount: number;
  status: PriceStatus;
  source: string | null;
  ref: { type: "option" | "item"; id: string };
}

export interface BudgetSummary {
  lines: BudgetLine[];
  byCategory: Record<BudgetCategory, { confirmed: number; estimated: number; missing: number }>;
  confirmedTotal: number;
  estimatedTotal: number;
  /** confirmado + estimado */
  total: number;
  /** Conceptos sin precio alguno (no entran en el total). */
  missingCount: number;
  /** true si el total incluye alguna estimación o falta algún precio. */
  isEstimate: boolean;
  budget: number | null;
  remaining: number | null;
  currency: string;
}

const OPTION_TO_BUDGET: Record<OptionCategory, BudgetCategory> = {
  flight: "flight",
  hotel: "hotel",
  transport: "transport",
  activity: "activity",
  restaurant: "food",
};

/** Importe total de un elemento del itinerario para todo el grupo. */
export function itemTotal(item: Pick<ItineraryItem, "price_amount" | "price_per" | "price_status">, travelers: number): number | null {
  if (item.price_status === "free") return 0;
  if (item.price_amount === null) return null;
  return item.price_per === "person" ? item.price_amount * travelers : item.price_amount;
}

/**
 * Construye el presupuesto con lo seleccionado/planificado:
 *  - opciones marcadas como elegidas (su precio es el total del grupo), y
 *  - actividades y comidas programadas en el itinerario.
 * Las divisas distintas a la del viaje se excluyen y se cuentan como "sin precio".
 */
export function buildBudget(
  trip: Pick<Trip, "travelers" | "budget_total" | "currency">,
  items: ItineraryItem[],
  options: TripOption[],
): BudgetSummary {
  const categories: BudgetCategory[] = ["flight", "hotel", "transport", "activity", "food"];
  const byCategory = Object.fromEntries(
    categories.map((c) => [c, { confirmed: 0, estimated: 0, missing: 0 }]),
  ) as BudgetSummary["byCategory"];
  const lines: BudgetLine[] = [];
  let missingCount = 0;

  const add = (category: BudgetCategory, label: string, amount: number | null, currency: string, status: PriceStatus, source: string | null, ref: BudgetLine["ref"]) => {
    if (amount === null || status === "unknown" || currency !== trip.currency) {
      byCategory[category].missing++;
      missingCount++;
      return;
    }
    lines.push({ category, label, amount, status, source, ref });
    if (isConfirmed(status)) byCategory[category].confirmed += amount;
    else byCategory[category].estimated += amount;
  };

  for (const option of options) {
    if (!option.selected) continue;
    add(
      OPTION_TO_BUDGET[option.category], option.title,
      option.price_status === "free" ? 0 : option.price_amount,
      option.price_currency, option.price_status, option.price_source,
      { type: "option", id: option.id },
    );
  }

  for (const item of items) {
    if (item.day_date === null) continue;
    if (item.kind !== "activity" && item.kind !== "meal" && item.kind !== "transport") continue;
    // Sin precio y sin ser comida/actividad de pago conocida: cuenta como pendiente.
    const category: BudgetCategory = item.kind === "meal" ? "food" : item.kind === "transport" ? "transport" : "activity";
    add(category, item.title, itemTotal(item, trip.travelers), item.price_currency, item.price_status, item.price_source, { type: "item", id: item.id });
  }

  const confirmedTotal = round2(categories.reduce((s, c) => s + byCategory[c].confirmed, 0));
  const estimatedTotal = round2(categories.reduce((s, c) => s + byCategory[c].estimated, 0));
  const total = round2(confirmedTotal + estimatedTotal);
  const budget = trip.budget_total;
  return {
    lines,
    byCategory,
    confirmedTotal,
    estimatedTotal,
    total,
    missingCount,
    isEstimate: estimatedTotal > 0 || missingCount > 0,
    budget,
    remaining: budget === null ? null : round2(budget - total),
    currency: trip.currency,
  };
}

function round2(n: number): number {
  return Math.round(n * 100) / 100;
}

function clamp(n: number, min: number, max: number): number {
  return Math.max(min, Math.min(max, n));
}

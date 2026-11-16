import { describe, expect, it } from "vitest";
import { addDays, formatDateRange, formatDayLong, isIsoDate, tripDates, tripNights } from "../src/lib/domain/dates";
import { clusterIntoDays, estimateLeg, haversineKm, optimizeOrder, routeLengthKm } from "../src/lib/domain/geo";
import { buildBudget, compareSavings, formatMoney, pickTiers } from "../src/lib/domain/money";
import { optimizeDayOrder, scheduleDay } from "../src/lib/domain/schedule";
import type { ItineraryItem, TripOption } from "../src/lib/domain/types";

const item = (over: Partial<ItineraryItem>): ItineraryItem => ({
  id: "i", trip_id: "t", day_date: "2027-03-01", position: 0, kind: "activity", category: null, title: "x",
  description: null, start_time: null, duration_min: 60, lat: null, lng: null, address: null, place_ref: null,
  source_url: null, image_url: null, indoor: null, price_amount: null, price_currency: "EUR", price_per: "person",
  price_status: "unknown", price_source: null, price_checked_at: null, booking_url: null, is_affiliate: false,
  notes: null, created_by: "user", ...over,
});

const option = (over: Partial<TripOption>): TripOption => ({
  id: "o", trip_id: "t", category: "hotel", tier: null, title: "x", subtitle: null, provider: null, details: {},
  price_amount: null, price_currency: "EUR", price_status: "unknown", price_source: null, price_checked_at: null,
  booking_url: null, is_affiliate: false, selected: false, created_by: "user", created_at: "", ...over,
});

describe("fechas", () => {
  it("valida y recorre fechas de calendario sin depender de la zona horaria", () => {
    expect(isIsoDate("2027-02-29")).toBe(false);
    expect(isIsoDate("2028-02-29")).toBe(true);
    expect(addDays("2027-12-31", 1)).toBe("2028-01-01");
    expect(tripDates("2027-03-01", "2027-03-04")).toHaveLength(4);
    expect(tripNights("2027-03-01", "2027-03-04")).toBe(3);
    expect(formatDayLong("2027-03-01")).toBe("lunes, 1 de marzo");
    expect(formatDateRange("2027-02-27", "2027-03-04")).toBe("27 feb – 4 mar 2027");
  });
});

describe("ahorro: solo con comparación real", () => {
  const p = (amount: number | null, status: TripOption["price_status"], currency = "EUR") => ({ amount, status, currency });

  it("no muestra ahorro si falta un precio, la divisa difiere o la alternativa no es más barata", () => {
    expect(compareSavings(p(null, "unknown"), p(100, "verified"))).toBeNull();
    expect(compareSavings(p(200, "verified"), p(100, "verified", "USD"))).toBeNull();
    expect(compareSavings(p(100, "verified"), p(100, "verified"))).toBeNull();
    expect(compareSavings(p(100, "verified"), p(120, "verified"))).toBeNull();
  });

  it("solo es verificado cuando AMBOS precios están confirmados", () => {
    expect(compareSavings(p(200, "verified"), p(150, "verified"))).toEqual({ amount: 50, percent: 25, basis: "verified" });
    expect(compareSavings(p(200, "user"), p(150, "verified"))?.basis).toBe("verified");
    expect(compareSavings(p(200, "verified"), p(150, "estimate"))?.basis).toBe("estimate");
    expect(compareSavings(p(200, "estimate"), p(150, "estimate"))?.basis).toBe("estimate");
  });
});

describe("tres alternativas", () => {
  const opts = [
    { id: "barato", price: 300, quality: 6, confirmed: true },
    { id: "equilibrado", price: 420, quality: 8.6, confirmed: true },
    { id: "lujo", price: 1200, quality: 9.6, confirmed: true },
  ];

  it("elige económico, calidad-precio y premium", () => {
    expect(pickTiers(opts)).toEqual({ cheapest: "barato", best_value: "equilibrado", premium: "lujo" });
  });

  it("la afiliación no puede influir: la función no recibe ese dato y el orden de entrada no importa", () => {
    expect(pickTiers(opts.slice().reverse())).toEqual(pickTiers(opts));
    expect(Object.keys(opts[0])).not.toContain("is_affiliate");
  });

  it("sin precios no etiqueta nada", () => {
    expect(pickTiers([{ id: "a", price: null, quality: 9, confirmed: false }])).toEqual({});
  });
});

describe("presupuesto", () => {
  const trip = { travelers: 2, budget_total: 2000, currency: "EUR" };

  it("separa confirmado de estimado y no suma lo que no tiene precio", () => {
    const summary = buildBudget(
      trip,
      [
        item({ id: "a", price_amount: 15, price_status: "estimate" }), // 30 para dos
        item({ id: "b", price_status: "free" }),
        item({ id: "c", price_status: "unknown" }),
        item({ id: "d", day_date: null, price_amount: 500, price_status: "estimate" }), // sin programar: no cuenta
        item({ id: "e", price_amount: 40, price_per: "group", price_status: "user", kind: "meal" }),
      ],
      [
        option({ id: "v", category: "flight", selected: true, price_amount: 800, price_status: "verified" }),
        option({ id: "h", category: "hotel", selected: true, price_amount: 600, price_status: "estimate" }),
        option({ id: "h2", category: "hotel", selected: false, price_amount: 5000, price_status: "verified" }),
      ],
    );
    expect(summary.confirmedTotal).toBe(840);
    expect(summary.estimatedTotal).toBe(630);
    expect(summary.total).toBe(1470);
    expect(summary.missingCount).toBe(1);
    expect(summary.isEstimate).toBe(true);
    expect(summary.remaining).toBe(530);
    expect(summary.byCategory.food.confirmed).toBe(40);
  });

  it("formatea importes en formato español", () => {
    expect(formatMoney(1234.5)).toBe("1.235 €");
    expect(formatMoney(12.5)).toBe("12,50 €");
    expect(formatMoney(null)).toBe("—");
  });
});

describe("rutas", () => {
  const madrid = { lat: 40.4168, lng: -3.7038 };
  const barcelona = { lat: 41.3874, lng: 2.1686 };

  it("calcula distancias reales", () => {
    expect(haversineKm(madrid, barcelona)).toBeGreaterThan(495);
    expect(haversineKm(madrid, barcelona)).toBeLessThan(510);
  });

  it("a pie si está cerca, transporte si no", () => {
    expect(estimateLeg(madrid, { lat: 40.42, lng: -3.70 }).mode).toBe("walk");
    expect(estimateLeg(madrid, { lat: 40.48, lng: -3.60 }).mode).toBe("transit");
  });

  it("optimiza el orden y nunca empeora la ruta", () => {
    const pts = [
      { lat: 0, lng: 0 }, { lat: 0, lng: 0.5 }, { lat: 0, lng: 0.1 }, { lat: 0, lng: 0.4 },
      { lat: 0, lng: 0.2 }, { lat: 0, lng: 0.3 },
    ];
    const order = optimizeOrder(pts);
    expect(order.slice().sort()).toEqual([0, 1, 2, 3, 4, 5]);
    const optimized = routeLengthKm(order.map((i) => pts[i]));
    expect(optimized).toBeLessThan(routeLengthKm(pts));
    expect(optimized).toBeCloseTo(haversineKm(pts[0], pts[1]), 5);
  });

  it("agrupa por cercanía respetando el máximo por día", () => {
    const west = Array.from({ length: 5 }, (_, i) => ({ lat: 35 + i * 0.001, lng: 135.70 }));
    const east = Array.from({ length: 3 }, (_, i) => ({ lat: 35 + i * 0.001, lng: 135.80 }));
    const groups = clusterIntoDays([...west, ...east], 2, 4);
    const sizes = [0, 1].map((g) => groups.filter((x) => x === g).length);
    expect(Math.max(...sizes)).toBeLessThanOrEqual(4);
    expect(new Set(groups.slice(5)).size).toBe(1); // los del este siguen juntos
  });
});

describe("horarios", () => {
  it("encadena actividades con trayecto y margen al reordenar", () => {
    const day = [
      item({ id: "a", lat: 35.0, lng: 135.76, duration_min: 60 }),
      item({ id: "b", lat: 35.0, lng: 135.77, duration_min: 90 }),
    ];
    const s = scheduleDay(day, { dayStart: "09:00", buffer: 10 });
    expect(s[0].start_time).toBe("09:00");
    expect(s[0].end_time).toBe("10:00");
    expect(s[1].legFromPrev?.mode).toBe("walk");
    const leg = s[1].legFromPrev!.minutes;
    expect(s[1].start_time).toBe(`10:${String(10 + leg).padStart(2, "0")}`);
  });

  it("optimizar un día conserva todas las actividades", () => {
    const day = [
      item({ id: "a", lat: 0, lng: 0 }), item({ id: "b", lat: 0, lng: 0.3 }),
      item({ id: "c", lat: 0, lng: 0.1 }), item({ id: "d" }),
    ];
    const out = optimizeDayOrder(day);
    expect(out.map((i) => i.id).sort()).toEqual(["a", "b", "c", "d"]);
    expect(out[out.length - 1].id).toBe("d");
  });
});

import type { Plan } from "../domain/types";

export type AgentId = "asistente" | "vuelos" | "hoteles" | "itinerario" | "experiencias" | "presupuesto";

export interface PlanDefinition {
  id: Plan;
  name: string;
  /** Viajes simultáneos (null = ilimitados). Lo impone también la base de datos. */
  maxTrips: number | null;
  /** Ejecuciones de agentes de IA por mes natural. */
  monthlyAgentRuns: number;
  agents: AgentId[];
  features: string[];
}

export const PLANS: Record<Plan, PlanDefinition> = {
  free: {
    id: "free",
    name: "Gratis",
    maxTrips: 1,
    monthlyAgentRuns: 25,
    agents: ["asistente", "itinerario", "experiencias"],
    features: [
      "1 viaje",
      "Itinerario básico día a día",
      "Recomendaciones de lugares y actividades",
      "Asistente con 25 consultas de IA al mes",
      "Enlaces para comparar vuelos y hoteles",
      "Planificador visual, mapa y documentos",
    ],
  },
  premium: {
    id: "premium",
    name: "Premium",
    maxTrips: null,
    monthlyAgentRuns: 600,
    agents: ["asistente", "vuelos", "hoteles", "itinerario", "experiencias", "presupuesto"],
    features: [
      "Viajes e itinerarios ilimitados",
      "Los 6 agentes de IA",
      "Optimización avanzada del presupuesto",
      "Modificaciones ilimitadas (uso razonable: 600 consultas/mes)",
      "Comparador de vuelos y hoteles con IA",
      "Asistente personal durante el viaje",
      "Seguimiento de precios y multidestino: próximamente",
    ],
  },
};

/** Precios de venta mostrados en la web. Deben coincidir con los de Stripe. */
export const PREMIUM_PRICING = {
  currency: "EUR",
  monthly: 9.99,
  yearly: 79,
} as const;

export function yearlySavingPercent(): number {
  const fullYear = PREMIUM_PRICING.monthly * 12;
  return Math.round(((fullYear - PREMIUM_PRICING.yearly) / fullYear) * 100);
}

export function canUseAgent(plan: Plan, agent: AgentId): boolean {
  return PLANS[plan].agents.includes(agent);
}

export function startOfMonthIso(now = new Date()): string {
  return new Date(Date.UTC(now.getUTCFullYear(), now.getUTCMonth(), 1)).toISOString();
}

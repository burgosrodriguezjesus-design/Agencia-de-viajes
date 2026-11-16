// Nombre comercial provisional: cámbialo aquí y se actualiza en toda la web.
export const BRAND = {
  name: "Travesía",
  tagline: "Tu próximo viaje, al mejor precio. Organizado por IA",
  description:
    "Agencia de viajes inteligente: un equipo de agentes de IA compara vuelos y hoteles, diseña tu itinerario y optimiza tu presupuesto en un único lugar.",
  legalName: "[RAZÓN SOCIAL PENDIENTE]",
  contactEmail: "[EMAIL DE CONTACTO PENDIENTE]",
} as const;

export const SITE_URL = (process.env.NEXT_PUBLIC_SITE_URL ?? "http://localhost:3000").replace(/\/$/, "");

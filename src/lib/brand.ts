// Nombre comercial y subtítulo: se cambian aquí y se actualizan en toda la web.
export const BRAND = {
  name: "Agencia",
  // Subtítulo de la marca; las letras "IA" se resaltan en el logotipo.
  subtitle: "agencIA de viajes",
  tagline: "Tu próximo viaje, al mejor precio. Organizado por IA",
  description:
    "Agencia de viajes inteligente: un equipo de agentes de IA compara vuelos y hoteles, diseña tu itinerario y optimiza tu presupuesto en un único lugar.",
  legalName: "[RAZÓN SOCIAL PENDIENTE]",
  contactEmail: "[EMAIL DE CONTACTO PENDIENTE]",
} as const;

// URL pública: la configurada o, en Vercel, el dominio de producción del proyecto.
export const SITE_URL = (
  process.env.NEXT_PUBLIC_SITE_URL ||
  (process.env.VERCEL_PROJECT_PRODUCTION_URL ? `https://${process.env.VERCEL_PROJECT_PRODUCTION_URL}` : "http://localhost:3000")
).replace(/\/$/, "");

import "server-only";

// Estado real de cada integración según la configuración del servidor. Se
// muestra tal cual en la página "Integraciones": nada se simula.

export type IntegrationState = "active" | "pending" | "optional";

export interface IntegrationStatus {
  id: string;
  name: string;
  purpose: string;
  state: IntegrationState;
  detail: string;
  envVars: string[];
}

const has = (key: string) => Boolean(process.env[key]?.trim());

export function isAiConfigured(): boolean {
  return has("ANTHROPIC_API_KEY");
}

/** Clave secreta de Supabase (con cualquiera de sus dos nombres). */
export function hasSupabaseSecret(): boolean {
  return has("SUPABASE_SECRET_KEY") || has("SUPABASE_SERVICE_ROLE_KEY");
}

/** Pagos listos: clave de Stripe + clave secreta de Supabase para activar el plan. */
export function isStripeConfigured(): boolean {
  return has("STRIPE_SECRET_KEY") && hasSupabaseSecret();
}

export function getIntegrationStatus(): IntegrationStatus[] {
  const affiliates = [
    "AFFILIATE_BOOKING_AID",
    "AFFILIATE_GETYOURGUIDE_PARTNER_ID",
    "AFFILIATE_VIATOR_PID",
    "AFFILIATE_SKYSCANNER_ASSOCIATE_ID",
  ];
  const activeAffiliates = affiliates.filter(has).length;
  return [
    {
      id: "supabase",
      name: "Supabase",
      purpose: "Base de datos PostgreSQL, cuentas de usuario y documentos",
      state: "active",
      detail: "Conectado. Seguridad a nivel de fila en todas las tablas.",
      envVars: ["NEXT_PUBLIC_SUPABASE_URL", "NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY"],
    },
    {
      id: "claude",
      name: "Claude (Anthropic)",
      purpose: "Los seis agentes de IA",
      state: isAiConfigured() ? "active" : "pending",
      detail: isAiConfigured()
        ? "Agentes activos."
        : "Sin clave: la plataforma funciona en modo básico (itinerario algorítmico con datos abiertos).",
      envVars: ["ANTHROPIC_API_KEY"],
    },
    {
      id: "open-data",
      name: "Open-Meteo · Wikipedia · OpenStreetMap",
      purpose: "Geocodificación, lugares de interés, restaurantes, previsión del tiempo y mapas",
      state: "active",
      detail: "Datos abiertos sin clave. Revisa sus condiciones de uso antes de escalar tráfico comercial.",
      envVars: ["OPEN_DATA_USER_AGENT"],
    },
    {
      id: "duffel",
      name: "Duffel",
      purpose: "Precios de vuelos verificados",
      state: has("DUFFEL_ACCESS_TOKEN") ? "active" : "pending",
      detail: has("DUFFEL_ACCESS_TOKEN")
        ? "Token configurado. Adaptador pendiente de validación con tráfico real."
        : "Pendiente: sin token solo se ofrecen enlaces de búsqueda y estimaciones etiquetadas.",
      envVars: ["DUFFEL_ACCESS_TOKEN"],
    },
    {
      id: "liteapi",
      name: "LiteAPI (Nuitée)",
      purpose: "Precios de hoteles verificados",
      state: has("LITEAPI_KEY") ? "active" : "pending",
      detail: has("LITEAPI_KEY")
        ? "Clave configurada. Adaptador pendiente de validación con tráfico real."
        : "Pendiente: sin clave solo se ofrecen enlaces de búsqueda y estimaciones etiquetadas.",
      envVars: ["LITEAPI_KEY"],
    },
    {
      id: "stripe",
      name: "Stripe",
      purpose: "Suscripciones Premium mensuales y anuales",
      state: isStripeConfigured() ? "active" : "pending",
      detail: isStripeConfigured()
        ? has("STRIPE_WEBHOOK_SECRET")
          ? "Pagos activos, con webhook."
          : "Pagos activos. Recomendado: configurar el webhook para reflejar al instante cancelaciones y renovaciones."
        : "Pendiente: faltan STRIPE_SECRET_KEY y la clave secreta de Supabase. El botón de Premium avisa de que los pagos aún no están activos.",
      envVars: ["STRIPE_SECRET_KEY", "SUPABASE_SECRET_KEY", "STRIPE_WEBHOOK_SECRET (recomendado)"],
    },
    {
      id: "affiliates",
      name: "Programas de afiliación",
      purpose: "Comisiones por reservas en Booking.com, GetYourGuide, Viator y Skyscanner",
      state: activeAffiliates > 0 ? "active" : "optional",
      detail:
        activeAffiliates > 0
          ? `${activeAffiliates} de ${affiliates.length} programas configurados. Los enlaces se marcan como afiliados.`
          : "Opcional: los enlaces funcionan sin identificador (sin comisión).",
      envVars: affiliates,
    },
    {
      id: "email",
      name: "Correo transaccional",
      purpose: "Confirmación de cuenta y recuperación de contraseña",
      state: "active",
      detail:
        "Lo envía Supabase Auth. Para producción configura un SMTP propio (p. ej. Resend) en el panel de Supabase.",
      envVars: [],
    },
    {
      id: "price-tracking",
      name: "Seguimiento de precios",
      purpose: "Alertas cuando baja un vuelo u hotel guardado",
      state: "pending",
      detail: "No implementado en el MVP: requiere proveedores de precios activos y una tarea programada.",
      envVars: [],
    },
  ];
}

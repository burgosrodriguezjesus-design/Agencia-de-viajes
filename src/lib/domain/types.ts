// Tipos de dominio compartidos entre servidor, agentes e interfaz.
// Reflejan el esquema de supabase/migrations/0001_init.sql.

export type Plan = "free" | "premium";

export type TripType =
  | "economico"
  | "romantico"
  | "familiar"
  | "aventura"
  | "lujo"
  | "cultural"
  | "personalizado";

export type Pace = "relajado" | "equilibrado" | "intenso";

/**
 * Procedencia de un precio. Es el núcleo de la política de transparencia:
 *  - verified: devuelto por la API de un proveedor (con fuente y fecha).
 *  - user:     introducido o confirmado por el propio usuario.
 *  - free:     actividad gratuita.
 *  - estimate: estimación (IA o heurística). Nunca se presenta como real.
 *  - unknown:  sin precio.
 */
export type PriceStatus = "verified" | "estimate" | "user" | "free" | "unknown";

export type ItemKind = "activity" | "meal" | "transport" | "lodging" | "free_time" | "note";

export type OptionCategory = "flight" | "hotel" | "transport" | "activity" | "restaurant";

export type Tier = "cheapest" | "best_value" | "premium";

export type TripRole = "owner" | "editor" | "viewer";

export interface Profile {
  id: string;
  full_name: string | null;
  home_city: string | null;
  currency: string;
  plan: Plan;
  stripe_customer_id: string | null;
  terms_accepted_at: string | null;
  marketing_consent: boolean;
  created_at: string;
}

export interface Trip {
  id: string;
  owner_id: string;
  title: string;
  destination: string;
  destination_country: string | null;
  country_code: string | null;
  dest_lat: number | null;
  dest_lng: number | null;
  dest_iata: string | null;
  origin: string | null;
  origin_iata: string | null;
  start_date: string;
  end_date: string;
  travelers: number;
  rooms: number;
  budget_total: number | null;
  currency: string;
  trip_type: TripType;
  pace: Pace;
  preferences: string | null;
  status: "draft" | "planning" | "ready";
  cover_image_url: string | null;
  cover_image_credit: string | null;
  created_at: string;
  updated_at: string;
}

export interface TripDay {
  trip_id: string;
  day_date: string;
  title: string | null;
  notes: string | null;
  rain_plan: string | null;
}

export interface ItineraryItem {
  id: string;
  trip_id: string;
  day_date: string | null;
  position: number;
  kind: ItemKind;
  category: string | null;
  title: string;
  description: string | null;
  start_time: string | null;
  duration_min: number;
  lat: number | null;
  lng: number | null;
  address: string | null;
  place_ref: string | null;
  source_url: string | null;
  image_url: string | null;
  indoor: boolean | null;
  price_amount: number | null;
  price_currency: string;
  price_per: "person" | "group";
  price_status: PriceStatus;
  price_source: string | null;
  price_checked_at: string | null;
  booking_url: string | null;
  is_affiliate: boolean;
  notes: string | null;
  created_by: string;
}

/** Detalles libres de una opción; cada categoría usa un subconjunto. */
export interface OptionDetails {
  // Vuelos
  airline?: string;
  stops?: number;
  duration_min?: number;
  departure?: string;
  arrival?: string;
  origin_airport?: string;
  destination_airport?: string;
  baggage?: string;
  fees_note?: string;
  // Hoteles
  rating?: number; // 0-10
  stars?: number;
  area?: string;
  distance_center_km?: number;
  taxes_note?: string;
  conditions?: string;
  board?: string;
  image_url?: string;
  // Común
  quality?: number; // 0-10, usado para la relación calidad-precio
  notes?: string;
}

export interface TripOption {
  id: string;
  trip_id: string;
  category: OptionCategory;
  tier: Tier | null;
  title: string;
  subtitle: string | null;
  provider: string | null;
  details: OptionDetails;
  price_amount: number | null;
  price_currency: string;
  price_status: PriceStatus;
  price_source: string | null;
  price_checked_at: string | null;
  booking_url: string | null;
  is_affiliate: boolean;
  selected: boolean;
  created_by: string;
  created_at: string;
}

export interface BudgetSuggestion {
  id: string;
  trip_id: string;
  category: string;
  title: string;
  detail: string | null;
  current_amount: number | null;
  proposed_amount: number | null;
  currency: string;
  basis: "verified" | "estimate";
  status: "proposed" | "applied" | "dismissed";
  created_at: string;
}

export interface TripDocument {
  id: string;
  trip_id: string;
  user_id: string;
  name: string;
  category: "billete" | "reserva" | "seguro" | "identidad" | "otro";
  storage_path: string;
  mime_type: string | null;
  size_bytes: number | null;
  created_at: string;
}

export interface ChatMessage {
  id: string;
  trip_id: string;
  role: "user" | "assistant";
  content: string;
  created_at: string;
}

export interface TripInvite {
  id: string;
  trip_id: string;
  token: string;
  kind: "public_link" | "member_invite";
  role: "viewer" | "editor";
  revoked_at: string | null;
  expires_at: string | null;
  created_at: string;
}

export const TRIP_TYPES: { value: TripType; label: string; hint: string }[] = [
  { value: "economico", label: "Económico", hint: "Máximo ahorro" },
  { value: "romantico", label: "Romántico", hint: "Para dos" },
  { value: "familiar", label: "Familiar", hint: "Con niños" },
  { value: "aventura", label: "Aventura", hint: "Naturaleza y acción" },
  { value: "lujo", label: "Lujo", hint: "Sin renuncias" },
  { value: "cultural", label: "Cultural", hint: "Arte e historia" },
  { value: "personalizado", label: "Personalizado", hint: "A tu manera" },
];

export const PACES: { value: Pace; label: string; hint: string }[] = [
  { value: "relajado", label: "Relajado", hint: "2-3 planes al día" },
  { value: "equilibrado", label: "Equilibrado", hint: "4 planes al día" },
  { value: "intenso", label: "Intenso", hint: "5-6 planes al día" },
];

export const OPTION_CATEGORY_LABEL: Record<OptionCategory, string> = {
  flight: "Vuelos",
  hotel: "Alojamiento",
  transport: "Transporte",
  activity: "Actividades",
  restaurant: "Restaurantes",
};

export const TIER_LABEL: Record<Tier, string> = {
  cheapest: "Más económico",
  best_value: "Mejor calidad-precio",
  premium: "Premium",
};

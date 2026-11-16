// Enlaces de búsqueda en proveedores externos ("deep links"). No son
// integraciones de precios: llevan al usuario a la búsqueda ya rellenada para
// que vea el precio en vivo y reserve allí. La plataforma nunca reserva.
//
// Afiliación: si hay un identificador configurado se añade al enlace y este
// se marca como `isAffiliate` para mostrarlo en la interfaz. El orden de la
// lista es FIJO y no depende de si el enlace es de afiliado.

import type { Trip } from "../domain/types";

export interface BookingLink {
  provider: string;
  label: string;
  url: string;
  isAffiliate: boolean;
}

type TripForLinks = Pick<
  Trip,
  "destination" | "origin" | "origin_iata" | "dest_iata" | "start_date" | "end_date" | "travelers" | "rooms"
>;

const env = (key: string): string | undefined => {
  const value = process.env[key];
  return value && value.trim() ? value.trim() : undefined;
};

/** Hosts a los que /api/go puede redirigir (evita redirecciones abiertas). */
export const ALLOWED_LINK_HOSTS = [
  "www.google.com",
  "www.skyscanner.es",
  "www.kayak.es",
  "www.booking.com",
  "www.airbnb.es",
  "www.getyourguide.es",
  "www.viator.com",
  "www.rome2rio.com",
  "www.openstreetmap.org",
];

export function flightLinks(trip: TripForLinks): BookingLink[] {
  const links: BookingLink[] = [];
  const from = trip.origin_iata ?? trip.origin;
  const to = trip.dest_iata ?? trip.destination;
  if (!from) return links;

  const q = `Vuelos de ${from} a ${to} el ${trip.start_date} vuelta ${trip.end_date}`;
  links.push({
    provider: "Google Flights",
    label: "Ver precios en Google Flights",
    url: `https://www.google.com/travel/flights?q=${encodeURIComponent(q)}&hl=es`,
    isAffiliate: false,
  });

  if (trip.origin_iata && trip.dest_iata) {
    const compact = (iso: string) => iso.slice(2).replace(/-/g, "");
    const associate = env("AFFILIATE_SKYSCANNER_ASSOCIATE_ID");
    const sky = new URL(
      `https://www.skyscanner.es/transporte/vuelos/${trip.origin_iata.toLowerCase()}/${trip.dest_iata.toLowerCase()}/${compact(trip.start_date)}/${compact(trip.end_date)}/`,
    );
    sky.searchParams.set("adultsv2", String(trip.travelers));
    if (associate) sky.searchParams.set("associateid", associate);
    links.push({
      provider: "Skyscanner",
      label: "Comparar en Skyscanner",
      url: sky.toString(),
      isAffiliate: Boolean(associate),
    });
    links.push({
      provider: "Kayak",
      label: "Comparar en Kayak",
      url: `https://www.kayak.es/flights/${trip.origin_iata}-${trip.dest_iata}/${trip.start_date}/${trip.end_date}/${trip.travelers}adults`,
      isAffiliate: false,
    });
  }
  return links;
}

export function hotelLinks(trip: TripForLinks, query?: string): BookingLink[] {
  const place = query ?? trip.destination;
  const aid = env("AFFILIATE_BOOKING_AID");
  const booking = new URL("https://www.booking.com/searchresults.html");
  booking.searchParams.set("ss", place);
  booking.searchParams.set("checkin", trip.start_date);
  booking.searchParams.set("checkout", trip.end_date);
  booking.searchParams.set("group_adults", String(trip.travelers));
  booking.searchParams.set("no_rooms", String(trip.rooms));
  if (aid) booking.searchParams.set("aid", aid);

  const google = new URL("https://www.google.com/travel/hotels");
  google.searchParams.set("q", `hoteles en ${place}`);
  google.searchParams.set("hl", "es");

  const airbnb = new URL(`https://www.airbnb.es/s/${encodeURIComponent(place)}/homes`);
  airbnb.searchParams.set("checkin", trip.start_date);
  airbnb.searchParams.set("checkout", trip.end_date);
  airbnb.searchParams.set("adults", String(trip.travelers));

  return [
    { provider: "Booking.com", label: "Ver disponibilidad en Booking.com", url: booking.toString(), isAffiliate: Boolean(aid) },
    { provider: "Google Hotels", label: "Comparar en Google Hotels", url: google.toString(), isAffiliate: false },
    { provider: "Airbnb", label: "Ver apartamentos en Airbnb", url: airbnb.toString(), isAffiliate: false },
  ];
}

export function activityLinks(destination: string, query?: string): BookingLink[] {
  const q = query ? `${query} ${destination}` : destination;
  const gygPartner = env("AFFILIATE_GETYOURGUIDE_PARTNER_ID");
  const gyg = new URL("https://www.getyourguide.es/s/");
  gyg.searchParams.set("q", q);
  if (gygPartner) gyg.searchParams.set("partner_id", gygPartner);

  const viatorPid = env("AFFILIATE_VIATOR_PID");
  const viator = new URL("https://www.viator.com/searchResults/all");
  viator.searchParams.set("text", q);
  if (viatorPid) viator.searchParams.set("pid", viatorPid);

  return [
    { provider: "GetYourGuide", label: "Buscar en GetYourGuide", url: gyg.toString(), isAffiliate: Boolean(gygPartner) },
    { provider: "Viator", label: "Buscar en Viator", url: viator.toString(), isAffiliate: Boolean(viatorPid) },
  ];
}

export function transportLinks(trip: TripForLinks): BookingLink[] {
  if (!trip.origin) return [];
  return [
    {
      provider: "Rome2Rio",
      label: "Cómo llegar (tren, bus, coche)",
      url: `https://www.rome2rio.com/es/map/${encodeURIComponent(trip.origin)}/${encodeURIComponent(trip.destination)}`,
      isAffiliate: false,
    },
  ];
}

/** Pasa un enlace externo por /api/go para registrar el clic (sin datos personales). */
export function trackedUrl(link: Pick<BookingLink, "url" | "provider" | "isAffiliate">, tripId?: string): string {
  const params = new URLSearchParams({ u: link.url, p: link.provider });
  if (link.isAffiliate) params.set("a", "1");
  if (tripId) params.set("t", tripId);
  return `/api/go?${params}`;
}

export function isAllowedLink(url: string): boolean {
  try {
    const parsed = new URL(url);
    return parsed.protocol === "https:" && ALLOWED_LINK_HOSTS.includes(parsed.hostname);
  } catch {
    return false;
  }
}

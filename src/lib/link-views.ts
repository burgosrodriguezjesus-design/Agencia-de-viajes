import "server-only";
import type { LinkView } from "@/components/options-board";
import type { TripOption } from "./domain/types";
import { isAllowedLink, trackedUrl, type BookingLink } from "./providers/links";

/** Enlaces de proveedor listos para la interfaz (pasan por /api/go). */
export function toLinkViews(links: BookingLink[], tripId: string): LinkView[] {
  return links.map((l) => ({ provider: l.provider, label: l.label, href: trackedUrl(l, tripId), isAffiliate: l.isAffiliate }));
}

/**
 * Enlace de cada opción. Los de proveedores conocidos pasan por /api/go; los
 * que pegó el usuario se abren directamente (solo https).
 */
export function optionLinkMap(options: TripOption[], tripId: string): Record<string, { href: string; isAffiliate: boolean }> {
  const map: Record<string, { href: string; isAffiliate: boolean }> = {};
  for (const o of options) {
    if (!o.booking_url || !o.booking_url.startsWith("https://")) continue;
    map[o.id] = isAllowedLink(o.booking_url)
      ? { href: trackedUrl({ url: o.booking_url, provider: o.provider ?? "proveedor", isAffiliate: o.is_affiliate }, tripId), isAffiliate: o.is_affiliate }
      : { href: o.booking_url, isAffiliate: false };
  }
  return map;
}

import { afterEach, describe, expect, it, vi } from "vitest";
import { activityLinks, flightLinks, hotelLinks, isAllowedLink, trackedUrl } from "../src/lib/providers/links";

const trip = {
  destination: "Kioto",
  origin: "Madrid",
  origin_iata: "MAD",
  dest_iata: "KIX",
  start_date: "2027-03-01",
  end_date: "2027-03-08",
  travelers: 2,
  rooms: 1,
};

afterEach(() => vi.unstubAllEnvs());

describe("enlaces de reserva", () => {
  it("rellena la búsqueda con los datos del viaje", () => {
    const booking = new URL(hotelLinks(trip)[0].url);
    expect(booking.hostname).toBe("www.booking.com");
    expect(booking.searchParams.get("checkin")).toBe("2027-03-01");
    expect(booking.searchParams.get("group_adults")).toBe("2");
    const sky = flightLinks(trip).find((l) => l.provider === "Skyscanner")!;
    expect(sky.url).toContain("/mad/kix/270301/270308/");
  });

  it("sin códigos IATA solo ofrece la búsqueda por nombre, y sin origen ninguna", () => {
    expect(flightLinks({ ...trip, origin_iata: null, dest_iata: null }).map((l) => l.provider)).toEqual(["Google Flights"]);
    expect(flightLinks({ ...trip, origin: null, origin_iata: null })).toEqual([]);
  });

  it("marca el enlace como afiliado solo cuando hay identificador, y no cambia el orden", () => {
    const before = hotelLinks(trip);
    expect(before.every((l) => !l.isAffiliate)).toBe(true);
    vi.stubEnv("AFFILIATE_BOOKING_AID", "123456");
    vi.stubEnv("AFFILIATE_GETYOURGUIDE_PARTNER_ID", "ABC");
    const after = hotelLinks(trip);
    expect(after[0].isAffiliate).toBe(true);
    expect(new URL(after[0].url).searchParams.get("aid")).toBe("123456");
    expect(after.map((l) => l.provider)).toEqual(before.map((l) => l.provider));
    expect(activityLinks("Kioto")[0].isAffiliate).toBe(true);
  });

  it("solo permite redirigir a proveedores conocidos por https", () => {
    expect(isAllowedLink("https://www.booking.com/searchresults.html?ss=Kioto")).toBe(true);
    expect(isAllowedLink("http://www.booking.com/")).toBe(false);
    expect(isAllowedLink("https://www.booking.com.evil.example/")).toBe(false);
    expect(isAllowedLink("https://evil.example/?u=https://www.booking.com")).toBe(false);
    expect(isAllowedLink("javascript:alert(1)")).toBe(false);
    expect(trackedUrl({ url: "https://www.viator.com/x", provider: "Viator", isAffiliate: true }, "t1")).toMatch(/^\/api\/go\?/);
  });
});

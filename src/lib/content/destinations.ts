// Fotografías de Wikimedia Commons guardadas en /public/images.
// Autoría y licencias en /legal/creditos (src/lib/content/credits.ts).

export const HERO_IMAGE = {
  src: "/images/hero.jpg",
  alt: "Paisaje de un destino de viaje al atardecer",
  credit: "Wikimedia Commons",
  position: "center",
};

export interface Destination {
  slug: string;
  name: string;
  query: string;
  tagline: string;
  src: string;
  alt: string;
  position: string;
}

export const DESTINATIONS: Destination[] = [];

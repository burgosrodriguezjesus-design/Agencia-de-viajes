"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { cn } from "./ui";

const TABS = [
  { slug: "", label: "Resumen" },
  { slug: "/itinerario", label: "Itinerario" },
  { slug: "/vuelos", label: "Vuelos" },
  { slug: "/hoteles", label: "Hoteles" },
  { slug: "/experiencias", label: "Experiencias" },
  { slug: "/ahorro", label: "Ahorro" },
  { slug: "/documentos", label: "Documentos" },
  { slug: "/compartir", label: "Compartir" },
];

export function TripTabs({ tripId }: { tripId: string }) {
  const pathname = usePathname();
  const base = `/app/viajes/${tripId}`;
  return (
    <nav aria-label="Secciones del viaje" className="scroll-quiet -mb-px flex gap-1 overflow-x-auto">
      {TABS.map((tab) => {
        const href = `${base}${tab.slug}`;
        const active = tab.slug === "" ? pathname === base : pathname.startsWith(href);
        return (
          <Link
            key={tab.slug}
            href={href}
            aria-current={active ? "page" : undefined}
            className={cn(
              "shrink-0 border-b-2 px-3 py-3 text-sm font-medium whitespace-nowrap transition",
              active ? "border-ink text-ink" : "border-transparent text-muted hover:text-ink",
            )}
          >
            {tab.label}
          </Link>
        );
      })}
    </nav>
  );
}

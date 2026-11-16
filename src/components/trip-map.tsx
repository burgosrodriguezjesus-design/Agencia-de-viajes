"use client";

import "leaflet/dist/leaflet.css";
import type { Map as LeafletMap, LayerGroup } from "leaflet";
import { useEffect, useRef } from "react";
import { cn } from "./ui";

export interface MapPoint {
  id: string;
  lat: number;
  lng: number;
  label: string;
  /** Texto del marcador (número de parada). */
  badge?: string;
}

/**
 * Mapa con OpenStreetMap (Leaflet). Dibuja las paradas numeradas y la línea
 * que las une en orden. La línea es orientativa: une los puntos en recta.
 */
export function TripMap({
  points,
  fallbackCenter,
  showRoute = true,
  className,
}: {
  points: MapPoint[];
  fallbackCenter?: { lat: number; lng: number } | null;
  showRoute?: boolean;
  className?: string;
}) {
  const containerRef = useRef<HTMLDivElement>(null);
  const mapRef = useRef<LeafletMap | null>(null);
  const layerRef = useRef<LayerGroup | null>(null);
  const leafletRef = useRef<typeof import("leaflet") | null>(null);

  // Inicialización (solo en el navegador).
  useEffect(() => {
    let cancelled = false;
    void import("leaflet").then((L) => {
      if (cancelled || !containerRef.current || mapRef.current) return;
      leafletRef.current = L;
      const map = L.map(containerRef.current, { scrollWheelZoom: false, zoomControl: true, attributionControl: true });
      L.tileLayer("https://tile.openstreetmap.org/{z}/{x}/{y}.png", {
        maxZoom: 19,
        attribution: '&copy; <a href="https://www.openstreetmap.org/copyright" target="_blank" rel="noopener">OpenStreetMap</a>',
      }).addTo(map);
      layerRef.current = L.layerGroup().addTo(map);
      mapRef.current = map;
      map.setView([fallbackCenter?.lat ?? 40.4, fallbackCenter?.lng ?? -3.7], fallbackCenter ? 12 : 4);
      draw();
    });
    return () => {
      cancelled = true;
      mapRef.current?.remove();
      mapRef.current = null;
      layerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const draw = () => {
    const L = leafletRef.current;
    const map = mapRef.current;
    const layer = layerRef.current;
    if (!L || !map || !layer) return;
    layer.clearLayers();
    if (points.length === 0) {
      if (fallbackCenter) map.setView([fallbackCenter.lat, fallbackCenter.lng], 12);
      return;
    }
    const latLngs = points.map((p) => L.latLng(p.lat, p.lng));
    if (showRoute && latLngs.length > 1) {
      const accent = getComputedStyle(document.documentElement).getPropertyValue("--accent").trim() || "#0c5a67";
      L.polyline(latLngs, { color: accent, weight: 3, opacity: 0.75, dashArray: "2 8", lineCap: "round" }).addTo(layer);
    }
    points.forEach((p, i) => {
      const icon = L.divIcon({
        className: "",
        html: `<div class="map-pin">${escapeHtml(p.badge ?? String(i + 1))}</div>`,
        iconSize: [28, 28],
        iconAnchor: [14, 14],
      });
      L.marker([p.lat, p.lng], { icon, title: p.label, keyboard: false })
        .bindPopup(`<strong>${escapeHtml(p.label)}</strong>`)
        .addTo(layer);
    });
    map.fitBounds(L.latLngBounds(latLngs), { padding: [36, 36], maxZoom: 15 });
  };

  // Redibuja cuando cambian las paradas.
  const signature = points.map((p) => `${p.id}:${p.lat},${p.lng}:${p.badge ?? ""}`).join("|");
  useEffect(() => {
    draw();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [signature, showRoute]);

  return (
    <div
      ref={containerRef}
      role="application"
      aria-label="Mapa del itinerario"
      className={cn("isolate z-0 h-full min-h-56 w-full overflow-hidden rounded-2xl border border-line", className)}
    />
  );
}

function escapeHtml(value: string): string {
  return value.replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" })[c]!);
}

"use client";

import { useState, useTransition } from "react";
import { updateTrip } from "@/app/actions/trips";
import { Button, inputClass, Notice } from "./ui";

/** Origen y códigos IATA del viaje: activan los enlaces de comparación precisos. */
export function IataEditor({
  tripId,
  origin,
  originIata,
  destIata,
}: {
  tripId: string;
  origin: string | null;
  originIata: string | null;
  destIata: string | null;
}) {
  const [error, setError] = useState<string | null>(null);
  const [saved, setSaved] = useState(false);
  const [pending, startTransition] = useTransition();
  return (
    <form
      className="flex flex-wrap items-end gap-3"
      action={(formData) =>
        startTransition(async () => {
          setError(null);
          setSaved(false);
          const from = String(formData.get("origin_iata") ?? "").trim();
          const to = String(formData.get("dest_iata") ?? "").trim();
          const r = await updateTrip(tripId, {
            origin: String(formData.get("origin") ?? "").trim() || null,
            origin_iata: from || null,
            dest_iata: to || null,
          });
          if (r.ok) setSaved(true);
          else setError(r.error ?? "No se pudo guardar.");
        })
      }
    >
      <label className="min-w-40 flex-1 text-sm">
        <span className="mb-1.5 block font-medium">Ciudad de salida</span>
        <input name="origin" defaultValue={origin ?? ""} maxLength={120} placeholder="Madrid" className={inputClass} />
      </label>
      <label className="w-28 text-sm">
        <span className="mb-1.5 block font-medium">IATA salida</span>
        <input name="origin_iata" defaultValue={originIata ?? ""} maxLength={3} placeholder="MAD" className={`${inputClass} uppercase`} />
      </label>
      <label className="w-28 text-sm">
        <span className="mb-1.5 block font-medium">IATA destino</span>
        <input name="dest_iata" defaultValue={destIata ?? ""} maxLength={3} placeholder="KIX" className={`${inputClass} uppercase`} />
      </label>
      <Button type="submit" variant="secondary" disabled={pending} className="h-11">
        {pending ? "Guardando…" : saved ? "Guardado" : "Guardar"}
      </Button>
      {error ? <Notice tone="danger" className="w-full">{error}</Notice> : null}
    </form>
  );
}

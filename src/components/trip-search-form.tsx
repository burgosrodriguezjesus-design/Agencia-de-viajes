"use client";

import { ArrowRight, CalendarDays, ChevronDown, MapPin, PlaneTakeoff, Users, Wallet } from "lucide-react";
import { useActionState, useEffect, useId, useRef, useState } from "react";
import { createTrip } from "@/app/actions/trips";
import { PACES, TRIP_TYPES, type Pace, type TripType } from "@/lib/domain/types";
import { Button, cn, Notice } from "./ui";

export interface TripFormDefaults {
  destination?: string;
  origin?: string;
  start_date?: string;
  end_date?: string;
  travelers?: string;
  rooms?: string;
  budget_total?: string;
  trip_type?: string;
  pace?: string;
  preferences?: string;
}

/** Ciudades reales para autocompletar (geocodificación de Open-Meteo). */
function usePlaceSuggestions(query: string): string[] {
  const [options, setOptions] = useState<string[]>([]);
  useEffect(() => {
    const q = query.trim();
    if (q.length < 2) return;
    const controller = new AbortController();
    const timer = setTimeout(async () => {
      try {
        const res = await fetch(`/api/places/suggest?q=${encodeURIComponent(q)}`, { signal: controller.signal });
        if (!res.ok) return;
        const data = (await res.json()) as { places: { label: string }[] };
        setOptions([...new Set(data.places.map((p) => p.label))]);
      } catch {
        // sin sugerencias: el campo sigue siendo de texto libre
      }
    }, 220);
    return () => {
      clearTimeout(timer);
      controller.abort();
    };
  }, [query]);
  return options;
}

function PlaceInput({
  name,
  label,
  placeholder,
  icon,
  defaultValue,
  required,
}: {
  name: string;
  label: string;
  placeholder: string;
  icon: React.ReactNode;
  defaultValue?: string;
  required?: boolean;
}) {
  const [value, setValue] = useState(defaultValue ?? "");
  const options = usePlaceSuggestions(value);
  const listId = useId();
  return (
    <Cell label={label} icon={icon}>
      <input
        name={name}
        value={value}
        onChange={(e) => setValue(e.target.value)}
        placeholder={placeholder}
        required={required}
        autoComplete="off"
        list={listId}
        maxLength={120}
        className="w-full bg-transparent text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-muted/70 focus:outline-none"
      />
      <datalist id={listId}>
        {options.map((o) => (
          <option key={o} value={o} />
        ))}
      </datalist>
    </Cell>
  );
}

function Cell({
  label,
  icon,
  children,
  className,
}: {
  label: string;
  icon: React.ReactNode;
  children: React.ReactNode;
  className?: string;
}) {
  return (
    <label
      className={cn(
        "group flex min-w-0 cursor-text flex-col gap-1 rounded-2xl border border-line bg-surface px-4 py-3 transition",
        "focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20",
        className,
      )}
    >
      <span className="flex items-center gap-1.5 text-[11px] font-semibold tracking-wider text-muted uppercase">
        {icon}
        {label}
      </span>
      {children}
    </label>
  );
}

const bare =
  "w-full bg-transparent text-[15px] font-medium text-ink placeholder:font-normal placeholder:text-muted/70 focus:outline-none";

export function TripSearchForm({
  mode,
  defaults = {},
  submitLabel,
}: {
  /** landing: lleva los datos a /app/nuevo · create: crea el viaje. */
  mode: "landing" | "create";
  defaults?: TripFormDefaults;
  submitLabel?: string;
}) {
  const [state, formAction, pending] = useActionState(createTrip, {});
  const [tripType, setTripType] = useState<TripType>((defaults.trip_type as TripType) || "personalizado");
  const [pace, setPace] = useState<Pace>((defaults.pace as Pace) || "equilibrado");
  const [open, setOpen] = useState(mode === "create");
  const [start, setStart] = useState(defaults.start_date ?? "");
  const endRef = useRef<HTMLInputElement>(null);

  // "Hoy" se calcula en el navegador al usar el campo, para no fijar la
  // fecha en el HTML prerenderizado.
  const setMinToday = (input: HTMLInputElement, floor?: string) => {
    const today = new Date().toISOString().slice(0, 10);
    input.min = floor && floor > today ? floor : today;
  };

  const formProps = mode === "landing" ? { action: "/app/nuevo", method: "get" as const } : { action: formAction };

  return (
    <form {...formProps} className="space-y-3">
      <div className="grid gap-2.5 sm:grid-cols-2 lg:grid-cols-[1.25fr_1fr_0.9fr_0.9fr_0.7fr]">
        <PlaceInput
          name="destination"
          label="Destino"
          placeholder="¿A dónde quieres ir?"
          icon={<MapPin className="size-3.5" aria-hidden />}
          defaultValue={defaults.destination}
          required
        />
        <PlaceInput
          name="origin"
          label="Salida"
          placeholder="Ciudad de salida"
          icon={<PlaneTakeoff className="size-3.5" aria-hidden />}
          defaultValue={defaults.origin}
        />
        <Cell label="Ida" icon={<CalendarDays className="size-3.5" aria-hidden />}>
          <input
            type="date"
            name="start_date"
            required
            onFocus={(e) => setMinToday(e.currentTarget)}
            value={start}
            onChange={(e) => {
              setStart(e.target.value);
              if (endRef.current && endRef.current.value && endRef.current.value < e.target.value) {
                endRef.current.value = e.target.value;
              }
            }}
            className={bare}
          />
        </Cell>
        <Cell label="Vuelta" icon={<CalendarDays className="size-3.5" aria-hidden />}>
          <input
            ref={endRef}
            type="date"
            name="end_date"
            required
            min={start || undefined}
            onFocus={(e) => setMinToday(e.currentTarget, start)}
            defaultValue={defaults.end_date}
            className={bare}
          />
        </Cell>
        <Cell label="Viajeros" icon={<Users className="size-3.5" aria-hidden />} className="sm:col-span-2 lg:col-span-1">
          <input
            type="number"
            name="travelers"
            min={1}
            max={20}
            defaultValue={defaults.travelers ?? "2"}
            required
            inputMode="numeric"
            className={bare}
          />
        </Cell>
      </div>

      <div className={cn("grid gap-2.5 sm:grid-cols-2 lg:grid-cols-4", !open && "hidden")}>
        <Cell label="Habitaciones" icon={<Users className="size-3.5" aria-hidden />}>
          <input type="number" name="rooms" min={1} max={10} defaultValue={defaults.rooms ?? "1"} inputMode="numeric" className={bare} />
        </Cell>
        <Cell label="Presupuesto total (€)" icon={<Wallet className="size-3.5" aria-hidden />}>
          <input
            type="number"
            name="budget_total"
            min={0}
            step={50}
            placeholder="Opcional"
            defaultValue={defaults.budget_total}
            inputMode="numeric"
            className={bare}
          />
        </Cell>
        <Cell label="Ritmo" icon={<ChevronDown className="size-3.5" aria-hidden />} className="sm:col-span-2">
          <div className="flex flex-wrap gap-1.5 pt-0.5">
            {PACES.map((p) => (
              <button
                key={p.value}
                type="button"
                onClick={() => setPace(p.value)}
                aria-pressed={pace === p.value}
                title={p.hint}
                className={cn(
                  "rounded-full px-3 py-1 text-sm transition",
                  pace === p.value ? "bg-ink text-bg" : "bg-surface-2 text-muted hover:text-ink",
                )}
              >
                {p.label}
              </button>
            ))}
          </div>
        </Cell>
        <div className="sm:col-span-2 lg:col-span-4">
          <Cell label="Preferencias personales" icon={<span aria-hidden>✦</span>}>
            <textarea
              name="preferences"
              rows={2}
              maxLength={1000}
              defaultValue={defaults.preferences}
              placeholder="Lo que te importa: gastronomía, pocos madrugones, viajamos con un bebé, nada de museos, quiero ver lugares de Harry Potter…"
              className={cn(bare, "resize-none font-normal leading-relaxed")}
            />
          </Cell>
        </div>
      </div>
      <input type="hidden" name="pace" value={pace} />
      <input type="hidden" name="trip_type" value={tripType} />
      {!open ? <input type="hidden" name="rooms" value={defaults.rooms ?? "1"} /> : null}

      <div className="flex flex-col gap-3 lg:flex-row lg:items-center lg:justify-between">
        <div className="scroll-quiet -mx-1 flex gap-1.5 overflow-x-auto px-1 pb-1" role="group" aria-label="Tipo de viaje">
          {TRIP_TYPES.map((t) => (
            <button
              key={t.value}
              type="button"
              onClick={() => setTripType(t.value)}
              aria-pressed={tripType === t.value}
              title={t.hint}
              className={cn(
                "shrink-0 rounded-full border px-3.5 py-1.5 text-sm transition",
                tripType === t.value
                  ? "border-ink bg-ink text-bg"
                  : "border-line bg-surface text-muted hover:border-ink/40 hover:text-ink",
              )}
            >
              {t.label}
            </button>
          ))}
        </div>
        <div className="flex shrink-0 items-center gap-2">
          {mode === "landing" ? (
            <button
              type="button"
              onClick={() => setOpen((v) => !v)}
              aria-expanded={open}
              className="inline-flex h-12 items-center gap-1 rounded-full px-3 text-sm font-medium text-muted transition hover:text-ink"
            >
              {open ? "Menos opciones" : "Presupuesto y preferencias"}
              <ChevronDown className={cn("size-4 transition", open && "rotate-180")} aria-hidden />
            </button>
          ) : null}
          <Button type="submit" variant="accent" size="lg" disabled={pending} className="flex-1 lg:flex-none">
            {pending ? "Creando tu viaje…" : (submitLabel ?? "Planificar mi viaje")}
            <ArrowRight className="size-4" aria-hidden />
          </Button>
        </div>
      </div>

      {mode === "create" && state.error ? <Notice tone="danger">{state.error}</Notice> : null}
    </form>
  );
}

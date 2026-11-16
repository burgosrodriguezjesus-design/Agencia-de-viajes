"use client";

import {
  closestCorners,
  DndContext,
  DragOverlay,
  KeyboardSensor,
  PointerSensor,
  TouchSensor,
  useDroppable,
  useSensor,
  useSensors,
  type DragEndEvent,
  type DragOverEvent,
  type DragStartEvent,
} from "@dnd-kit/core";
import { arrayMove, SortableContext, sortableKeyboardCoordinates, useSortable, verticalListSortingStrategy } from "@dnd-kit/sortable";
import { CSS } from "@dnd-kit/utilities";
import {
  Bookmark,
  CloudRain,
  ExternalLink,
  Footprints,
  GripVertical,
  MapPin,
  Plus,
  Route,
  Sun,
  TrainFront,
  Trash2,
  Umbrella,
} from "lucide-react";
import { useEffect, useMemo, useRef, useState, useTransition } from "react";
import { addItem, deleteItem, optimizeDay, saveLayout, updateDay, updateItem } from "@/app/actions/trips";
import { formatDayLong, formatDuration } from "@/lib/domain/dates";
import { hasCoords } from "@/lib/domain/geo";
import { formatMoney } from "@/lib/domain/money";
import { dayTravelTotals, PACE_CONFIG, scheduleDay } from "@/lib/domain/schedule";
import type { ItineraryItem, Pace, TripDay } from "@/lib/domain/types";
import { Modal } from "./modal";
import { SafeImg } from "./safe-img";
import { TripMap, type MapPoint } from "./trip-map";
import { Badge, Button, cn, Field, inputClass, Notice, PriceBadge } from "./ui";

const SAVED = "saved";

export interface DayWeather {
  summary: string;
  tempMax: number;
  tempMin: number;
  rainy: boolean;
  rainProbability: number | null;
}

interface PlannerProps {
  trip: { id: string; pace: Pace; travelers: number; currency: string; dest_lat: number | null; dest_lng: number | null };
  dates: string[];
  days: TripDay[];
  items: ItineraryItem[];
  weather: Record<string, DayWeather>;
  canEdit: boolean;
}

type Columns = Record<string, string[]>;

function buildColumns(dates: string[], items: ItineraryItem[]): Columns {
  const columns: Columns = { [SAVED]: [] };
  dates.forEach((d) => (columns[d] = []));
  items
    .slice()
    .sort((a, b) => a.position - b.position)
    .forEach((item) => {
      const key = item.day_date && columns[item.day_date] ? item.day_date : SAVED;
      columns[key].push(item.id);
    });
  return columns;
}

const KIND_LABEL: Record<string, string> = {
  activity: "Actividad",
  meal: "Comida",
  transport: "Transporte",
  free_time: "Tiempo libre",
  note: "Nota",
  lodging: "Alojamiento",
};

export function Planner({ trip, dates, days, items, weather, canEdit }: PlannerProps) {
  const byId = useMemo(() => new Map(items.map((i) => [i.id, i])), [items]);
  const [columns, setColumns] = useState<Columns>(() => buildColumns(dates, items));
  const columnsRef = useRef(columns);
  useEffect(() => {
    columnsRef.current = columns;
  }, [columns]);
  const snapshot = useRef<Columns | null>(null);
  const [activeId, setActiveId] = useState<string | null>(null);
  const [mapDay, setMapDay] = useState<string>(() => dates.find((d) => items.some((i) => i.day_date === d)) ?? dates[0] ?? SAVED);
  const [editing, setEditing] = useState<ItineraryItem | null>(null);
  const [addingTo, setAddingTo] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  // Los datos del servidor mandan (p. ej. tras un cambio del asistente),
  // salvo mientras se arrastra o se está guardando.
  const serverSignature = items.map((i) => `${i.id}:${i.day_date ?? ""}:${i.position}`).join("|") + dates.join(",");
  const [syncedSignature, setSyncedSignature] = useState(serverSignature);
  if (serverSignature !== syncedSignature && !activeId && !pending) {
    setSyncedSignature(serverSignature);
    setColumns(buildColumns(dates, items));
  }

  const sensors = useSensors(
    useSensor(PointerSensor, { activationConstraint: { distance: 6 } }),
    useSensor(TouchSensor, { activationConstraint: { delay: 180, tolerance: 8 } }),
    useSensor(KeyboardSensor, { coordinateGetter: sortableKeyboardCoordinates }),
  );

  const containerOf = (id: string, cols: Columns): string | null =>
    id in cols ? id : (Object.keys(cols).find((key) => cols[key].includes(id)) ?? null);

  const onDragStart = (event: DragStartEvent) => {
    snapshot.current = columnsRef.current;
    setActiveId(String(event.active.id));
    setError(null);
  };

  const onDragOver = (event: DragOverEvent) => {
    const { active, over } = event;
    if (!over) return;
    const cols = columnsRef.current;
    const from = containerOf(String(active.id), cols);
    const to = containerOf(String(over.id), cols);
    if (!from || !to || from === to) return;
    setColumns((prev) => {
      const source = prev[from].filter((id) => id !== active.id);
      const target = prev[to].slice();
      const overIndex = target.indexOf(String(over.id));
      target.splice(overIndex === -1 ? target.length : overIndex, 0, String(active.id));
      const next = { ...prev, [from]: source, [to]: target };
      columnsRef.current = next;
      return next;
    });
  };

  const onDragEnd = (event: DragEndEvent) => {
    const { active, over } = event;
    setActiveId(null);
    let next = columnsRef.current;
    if (over) {
      const container = containerOf(String(active.id), next);
      const overContainer = containerOf(String(over.id), next);
      if (container && container === overContainer) {
        const oldIndex = next[container].indexOf(String(active.id));
        const newIndex = next[container].indexOf(String(over.id));
        if (oldIndex !== -1 && newIndex !== -1 && oldIndex !== newIndex) {
          next = { ...next, [container]: arrayMove(next[container], oldIndex, newIndex) };
          setColumns(next);
          columnsRef.current = next;
        }
      }
    }
    const before = snapshot.current;
    snapshot.current = null;
    if (!before) return;
    const changed = Object.keys(next).filter((key) => (before[key] ?? []).join() !== next[key].join());
    if (changed.length === 0) return;
    const target = containerOf(String(active.id), next);
    if (target && target !== SAVED) setMapDay(target);
    startTransition(async () => {
      const result = await saveLayout(
        trip.id,
        changed.map((key) => ({ day: key === SAVED ? null : key, ids: next[key] })),
      );
      if (!result.ok) {
        setColumns(before);
        setError(result.error ?? "No se pudo guardar el nuevo orden.");
      }
    });
  };

  const pace = PACE_CONFIG[trip.pace];
  const dayInfo = useMemo(() => new Map(days.map((d) => [d.day_date, d])), [days]);

  const itemsOf = (key: string) => (columns[key] ?? []).map((id) => byId.get(id)).filter((i): i is ItineraryItem => Boolean(i));

  const mapPoints: MapPoint[] = itemsOf(mapDay)
    .filter(hasCoords)
    .map((item, i) => ({ id: item.id, lat: item.lat, lng: item.lng, label: item.title, badge: String(i + 1) }));

  const activeItem = activeId ? byId.get(activeId) : null;

  return (
    <div className="grid gap-6 lg:grid-cols-[minmax(0,1fr)_minmax(0,24rem)] xl:grid-cols-[minmax(0,1fr)_minmax(0,28rem)]">
      <div className="order-2 min-w-0 space-y-5 lg:order-1">
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <DndContext
          id="planner"
          sensors={sensors}
          collisionDetection={closestCorners}
          onDragStart={onDragStart}
          onDragOver={onDragOver}
          onDragEnd={onDragEnd}
          onDragCancel={() => {
            if (snapshot.current) setColumns(snapshot.current);
            snapshot.current = null;
            setActiveId(null);
          }}
        >
          {dates.map((date, index) => {
            const dayItems = itemsOf(date);
            const scheduled = scheduleDay(dayItems, { dayStart: pace.dayStart, buffer: pace.buffer });
            const totals = dayTravelTotals(scheduled.map((s) => s.legFromPrev));
            const info = dayInfo.get(date);
            const forecast = weather[date];
            return (
              <DayColumn
                key={date}
                id={date}
                selected={mapDay === date}
                onSelect={() => setMapDay(date)}
                header={
                  <div className="flex flex-wrap items-start justify-between gap-x-4 gap-y-2">
                    <div className="min-w-0">
                      <p className="text-xs font-semibold tracking-wider text-accent uppercase">Día {index + 1}</p>
                      <h3 className="font-display text-xl leading-tight font-medium first-letter:uppercase">{formatDayLong(date)}</h3>
                      {info?.title ? <p className="mt-0.5 text-sm text-muted">{info.title}</p> : null}
                    </div>
                    <div className="flex flex-wrap items-center gap-1.5">
                      {forecast ? (
                        <Badge tone={forecast.rainy ? "warn" : "neutral"} title="Previsión de Open-Meteo">
                          {forecast.rainy ? <CloudRain className="size-3" aria-hidden /> : <Sun className="size-3" aria-hidden />}
                          {forecast.summary} · {forecast.tempMin}–{forecast.tempMax} °C
                        </Badge>
                      ) : null}
                      {totals.minutes > 0 ? (
                        <Badge title="Suma aproximada de los trayectos del día, calculada por distancia">
                          ≈ {formatDuration(totals.minutes)} de trayectos
                        </Badge>
                      ) : null}
                    </div>
                  </div>
                }
                footer={
                  <>
                    {info?.rain_plan ? (
                      <p className={cn("flex gap-2 rounded-xl px-3 py-2.5 text-sm leading-relaxed", forecast?.rainy ? "bg-warn-soft" : "bg-surface-2 text-muted")}>
                        <Umbrella className="mt-0.5 size-4 shrink-0" aria-hidden />
                        <span>
                          <strong className="font-medium text-ink">Si llueve: </strong>
                          {info.rain_plan}
                        </span>
                      </p>
                    ) : null}
                    <DayNotes tripId={trip.id} date={date} initial={info?.notes ?? ""} canEdit={canEdit} />
                    {canEdit ? (
                      <div className="flex flex-wrap gap-2">
                        <Button variant="secondary" size="sm" onClick={() => setAddingTo(date)}>
                          <Plus className="size-4" aria-hidden /> Añadir
                        </Button>
                        {dayItems.filter(hasCoords).length >= 3 ? (
                          <Button
                            variant="ghost"
                            size="sm"
                            disabled={pending}
                            title="Reordena las paradas para minimizar desplazamientos y recalcula los horarios"
                            onClick={() =>
                              startTransition(async () => {
                                setMapDay(date);
                                const r = await optimizeDay(trip.id, date);
                                if (!r.ok) setError(r.error ?? "No se pudo optimizar.");
                              })
                            }
                          >
                            <Route className="size-4" aria-hidden /> Optimizar ruta
                          </Button>
                        ) : null}
                      </div>
                    ) : null}
                  </>
                }
              >
                <SortableContext items={columns[date] ?? []} strategy={verticalListSortingStrategy}>
                  {scheduled.length === 0 ? (
                    <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
                      Día libre. Arrastra aquí una idea guardada o añade un plan.
                    </p>
                  ) : (
                    scheduled.map((entry, i) => (
                      <div key={entry.item.id}>
                        {i > 0 && entry.legFromPrev ? (
                          <p className="flex items-center gap-1.5 py-1 pl-[3.4rem] text-xs text-muted" title="Trayecto aproximado, calculado por distancia">
                            {entry.legFromPrev.mode === "walk" ? <Footprints className="size-3.5" aria-hidden /> : <TrainFront className="size-3.5" aria-hidden />}
                            ≈ {entry.legFromPrev.minutes} min {entry.legFromPrev.mode === "walk" ? "a pie" : "en transporte"}
                            <span className="opacity-60">· {entry.legFromPrev.km.toFixed(1)} km</span>
                          </p>
                        ) : i > 0 ? (
                          <div className="h-2" />
                        ) : null}
                        <SortableItem
                          item={entry.item}
                          time={entry.start_time}
                          index={dayItems.filter(hasCoords).findIndex((x) => x.id === entry.item.id)}
                          travelers={trip.travelers}
                          canEdit={canEdit}
                          onOpen={() => setEditing(entry.item)}
                        />
                      </div>
                    ))
                  )}
                </SortableContext>
              </DayColumn>
            );
          })}

          <DayColumn
            id={SAVED}
            selected={mapDay === SAVED}
            onSelect={() => setMapDay(SAVED)}
            header={
              <div className="flex items-center justify-between gap-3">
                <div>
                  <p className="flex items-center gap-1.5 text-xs font-semibold tracking-wider text-accent uppercase">
                    <Bookmark className="size-3.5" aria-hidden /> Sin programar
                  </p>
                  <h3 className="font-display text-xl leading-tight font-medium">Ideas guardadas</h3>
                </div>
                {canEdit ? (
                  <Button variant="secondary" size="sm" onClick={() => setAddingTo(SAVED)}>
                    <Plus className="size-4" aria-hidden /> Añadir
                  </Button>
                ) : null}
              </div>
            }
          >
            <SortableContext items={columns[SAVED] ?? []} strategy={verticalListSortingStrategy}>
              {itemsOf(SAVED).length === 0 ? (
                <p className="rounded-xl border border-dashed border-line px-4 py-6 text-center text-sm text-muted">
                  Aquí se guardan restaurantes, actividades e ideas hasta que decidas qué día encajan.
                </p>
              ) : (
                <div className="space-y-2">
                  {itemsOf(SAVED).map((item) => (
                    <SortableItem key={item.id} item={item} time={null} index={-1} travelers={trip.travelers} canEdit={canEdit} onOpen={() => setEditing(item)} />
                  ))}
                </div>
              )}
            </SortableContext>
          </DayColumn>

          <DragOverlay dropAnimation={{ duration: 180 }}>
            {activeItem ? <ItemCard item={activeItem} time={null} index={-1} travelers={trip.travelers} dragging /> : null}
          </DragOverlay>
        </DndContext>
      </div>

      <div className="order-1 lg:order-2">
        <div className="lg:sticky lg:top-24">
          <div className="h-64 lg:h-[calc(100dvh-9rem)] lg:max-h-[46rem]">
            <TripMap
              points={mapPoints}
              showRoute={mapDay !== SAVED}
              fallbackCenter={trip.dest_lat !== null && trip.dest_lng !== null ? { lat: trip.dest_lat, lng: trip.dest_lng } : null}
            />
          </div>
          <p className="mt-2 flex items-center gap-1.5 text-xs text-muted">
            <MapPin className="size-3.5" aria-hidden />
            {mapDay === SAVED ? "Ideas guardadas" : `Ruta del ${formatDayLong(mapDay)}`}. La línea une las paradas en recta; los tiempos son aproximados.
          </p>
        </div>
      </div>

      <AddItemModal tripId={trip.id} dates={dates} target={addingTo} onClose={() => setAddingTo(null)} />
      <EditItemModal tripId={trip.id} item={editing} canEdit={canEdit} currency={trip.currency} onClose={() => setEditing(null)} />
    </div>
  );
}

function DayColumn({
  id,
  header,
  footer,
  children,
  selected,
  onSelect,
}: {
  id: string;
  header: React.ReactNode;
  footer?: React.ReactNode;
  children: React.ReactNode;
  selected: boolean;
  onSelect: () => void;
}) {
  const { setNodeRef, isOver } = useDroppable({ id });
  return (
    <section
      ref={setNodeRef}
      onPointerDownCapture={onSelect}
      className={cn(
        "rounded-2xl border bg-surface p-4 transition sm:p-5",
        selected ? "border-accent/60 shadow-card" : "border-line",
        isOver && "border-accent ring-2 ring-accent/20",
      )}
    >
      {header}
      <div className="mt-4">{children}</div>
      {footer ? <div className="mt-4 space-y-3">{footer}</div> : null}
    </section>
  );
}

interface ItemProps {
  item: ItineraryItem;
  time: string | null;
  /** Número de parada en el mapa (-1 si no tiene coordenadas). */
  index: number;
  travelers: number;
  canEdit?: boolean;
  onOpen?: () => void;
}

function SortableItem(props: ItemProps) {
  const { attributes, listeners, setNodeRef, transform, transition, isDragging } = useSortable({
    id: props.item.id,
    disabled: !props.canEdit,
  });
  return (
    <div ref={setNodeRef} style={{ transform: CSS.Translate.toString(transform), transition }} className={cn(isDragging && "opacity-40")}>
      <ItemCard {...props} handle={props.canEdit ? { ...attributes, ...listeners } : undefined} />
    </div>
  );
}

function ItemCard({
  item,
  time,
  index,
  travelers,
  onOpen,
  handle,
  dragging,
}: ItemProps & { handle?: Record<string, unknown>; dragging?: boolean }) {
  const perPerson = item.price_per === "person" && travelers > 1;
  return (
    <div
      className={cn(
        "flex items-stretch gap-2 rounded-xl border border-line bg-bg transition",
        dragging ? "rotate-1 shadow-float" : "hover:border-ink/30",
      )}
    >
      {handle ? (
        <button
          type="button"
          {...handle}
          aria-label={`Mover ${item.title}`}
          className="flex w-7 shrink-0 cursor-grab touch-none items-center justify-center rounded-l-xl text-muted/60 transition hover:bg-surface-2 hover:text-ink active:cursor-grabbing"
        >
          <GripVertical className="size-4" aria-hidden />
        </button>
      ) : (
        <span className="w-2" />
      )}
      <button type="button" onClick={onOpen} className="flex min-w-0 flex-1 items-center gap-3 py-2.5 pr-3 text-left">
        <span className="w-11 shrink-0 text-center">
          <span className="block text-sm font-semibold tabular-nums">{time ?? "—"}</span>
          <span className="block text-[11px] text-muted">{formatDuration(item.duration_min)}</span>
        </span>
        {item.image_url ? (
          <SafeImg src={item.image_url} loading="lazy" className="hidden size-12 shrink-0 rounded-lg bg-surface-2 object-cover sm:block" />
        ) : null}
        <span className="min-w-0 flex-1">
          <span className="flex items-center gap-1.5">
            {index >= 0 ? (
              <span className="grid size-[18px] shrink-0 place-items-center rounded-full bg-accent text-[10px] font-semibold text-accent-ink">{index + 1}</span>
            ) : null}
            <span className="truncate font-medium">{item.title}</span>
          </span>
          <span className="mt-0.5 flex flex-wrap items-center gap-x-2 gap-y-1 text-xs text-muted">
            <span className="first-letter:uppercase">{item.category ?? KIND_LABEL[item.kind]}</span>
            {item.indoor ? <span title="A cubierto: apto para días de lluvia">· a cubierto</span> : null}
            {item.price_status !== "unknown" ? (
              <>
                <span className="font-medium text-ink tabular-nums">
                  {item.price_status === "free" ? "" : `${formatMoney(item.price_amount, item.price_currency)}${perPerson ? " /pers." : ""}`}
                </span>
                <PriceBadge status={item.price_status} source={item.price_source} />
              </>
            ) : null}
          </span>
        </span>
      </button>
    </div>
  );
}

function DayNotes({ tripId, date, initial, canEdit }: { tripId: string; date: string; initial: string; canEdit: boolean }) {
  const [value, setValue] = useState(initial);
  const [saved, setSaved] = useState(initial);
  const [, startTransition] = useTransition();
  if (!canEdit && !initial) return null;
  return (
    <textarea
      value={value}
      readOnly={!canEdit}
      onChange={(e) => setValue(e.target.value)}
      onBlur={() => {
        if (value === saved) return;
        startTransition(async () => {
          const r = await updateDay(tripId, date, { notes: value });
          if (r.ok) setSaved(value);
        });
      }}
      rows={value ? Math.min(4, value.split("\n").length + 1) : 1}
      maxLength={2000}
      placeholder="Notas personales del día…"
      aria-label="Notas personales del día"
      className="w-full resize-none rounded-xl bg-transparent px-1 text-sm leading-relaxed text-ink placeholder:text-muted/60 focus:bg-surface-2 focus:px-3 focus:py-2 focus:outline-none"
    />
  );
}

function AddItemModal({
  tripId,
  dates,
  target,
  onClose,
}: {
  tripId: string;
  dates: string[];
  target: string | null;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <Modal open={target !== null} onClose={onClose} title="Añadir al viaje">
      <form
        action={(formData) =>
          startTransition(async () => {
            setError(null);
            const r = await addItem(tripId, formData);
            if (r.ok) onClose();
            else setError(r.error ?? "No se pudo añadir.");
          })
        }
        className="space-y-4"
      >
        <Field label="Nombre">
          <input name="title" required maxLength={140} autoFocus placeholder="Cena en Pontocho, entradas al museo…" className={inputClass} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="Tipo">
            <select name="kind" defaultValue="activity" className={inputClass}>
              <option value="activity">Actividad</option>
              <option value="meal">Comida / restaurante</option>
              <option value="transport">Transporte</option>
              <option value="free_time">Tiempo libre</option>
              <option value="note">Nota</option>
            </select>
          </Field>
          <Field label="Día">
            <select name="day_date" defaultValue={target === SAVED || target === null ? "" : target} className={inputClass}>
              <option value="">Sin programar</option>
              {dates.map((d, i) => (
                <option key={d} value={d}>
                  Día {i + 1} · {formatDayLong(d)}
                </option>
              ))}
            </select>
          </Field>
          <Field label="Duración (min)">
            <input name="duration_min" type="number" min={0} max={720} step={5} defaultValue={60} className={inputClass} />
          </Field>
          <Field label="Precio" hint="Opcional">
            <input name="price_amount" type="number" min={0} step="0.01" placeholder="0,00" className={inputClass} />
          </Field>
        </div>
        <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
          <label className="flex items-center gap-2">
            <input type="radio" name="price_per" value="person" defaultChecked className="accent-(--accent)" /> Por persona
          </label>
          <label className="flex items-center gap-2">
            <input type="radio" name="price_per" value="group" className="accent-(--accent)" /> Total del grupo
          </label>
          <label className="flex items-center gap-2">
            <input type="checkbox" name="is_free" className="accent-(--accent)" /> Es gratis
          </label>
        </div>
        <Field label="Notas" hint="Opcional">
          <textarea name="notes" rows={2} maxLength={1000} className={cn(inputClass, "h-auto py-2.5")} />
        </Field>
        {error ? <Notice tone="danger">{error}</Notice> : null}
        <div className="flex justify-end gap-2">
          <Button type="button" variant="ghost" onClick={onClose}>
            Cancelar
          </Button>
          <Button type="submit" disabled={pending}>
            {pending ? "Añadiendo…" : "Añadir"}
          </Button>
        </div>
      </form>
    </Modal>
  );
}

function EditItemModal({
  tripId,
  item,
  canEdit,
  currency,
  onClose,
}: {
  tripId: string;
  item: ItineraryItem | null;
  canEdit: boolean;
  currency: string;
  onClose: () => void;
}) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  if (!item) return <Modal open={false} onClose={onClose} title="" >{null}</Modal>;
  const aiSuggestion = item.created_by.startsWith("agente:") && !item.place_ref;

  return (
    <Modal open onClose={onClose} title={item.title}>
      <div className="space-y-4">
        {item.image_url ? (
          <SafeImg src={item.image_url} className="h-40 w-full rounded-2xl bg-surface-2 object-cover" />
        ) : null}
        {item.description ? <p className="text-[15px] leading-relaxed text-muted">{item.description}</p> : null}
        <div className="flex flex-wrap items-center gap-2 text-sm">
          <PriceBadge status={item.price_status} source={item.price_source} />
          {item.source_url ? (
            <a href={item.source_url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 text-accent underline-offset-4 hover:underline">
              Ver fuente <ExternalLink className="size-3.5" aria-hidden />
            </a>
          ) : null}
        </div>
        {aiSuggestion ? (
          <Notice tone="warn">Sugerencia de la IA sin fuente enlazada: confirma que existe, su ubicación y sus horarios antes de ir.</Notice>
        ) : item.price_status === "estimate" ? (
          <Notice tone="warn">El precio es una estimación orientativa. Si conoces el real, escríbelo abajo y quedará como confirmado por ti.</Notice>
        ) : null}

        {canEdit ? (
          <form
            action={(formData) =>
              startTransition(async () => {
                setError(null);
                const price = String(formData.get("price_amount") ?? "");
                const original = item.price_amount === null ? "" : String(item.price_amount);
                const r = await updateItem(tripId, item.id, {
                  title: String(formData.get("title") ?? item.title),
                  notes: String(formData.get("notes") ?? "") || null,
                  duration_min: Number(formData.get("duration_min") ?? item.duration_min),
                  price_per: formData.get("price_per") === "group" ? "group" : "person",
                  is_free: formData.get("is_free") === "on",
                  // Solo se toca el precio si el usuario lo ha cambiado.
                  ...(price !== original ? { price_amount: price === "" ? null : Number(price) } : {}),
                });
                if (r.ok) onClose();
                else setError(r.error ?? "No se pudo guardar.");
              })
            }
            className="space-y-4 border-t border-line pt-4"
          >
            <Field label="Nombre">
              <input name="title" defaultValue={item.title} required maxLength={140} className={inputClass} />
            </Field>
            <div className="grid grid-cols-2 gap-3">
              <Field label="Duración (min)">
                <input name="duration_min" type="number" min={0} max={720} step={5} defaultValue={item.duration_min} className={inputClass} />
              </Field>
              <Field label={`Precio (${currency})`}>
                <input name="price_amount" type="number" min={0} step="0.01" defaultValue={item.price_amount ?? ""} className={inputClass} />
              </Field>
            </div>
            <div className="flex flex-wrap items-center gap-x-5 gap-y-2 text-sm">
              <label className="flex items-center gap-2">
                <input type="radio" name="price_per" value="person" defaultChecked={item.price_per === "person"} className="accent-(--accent)" /> Por persona
              </label>
              <label className="flex items-center gap-2">
                <input type="radio" name="price_per" value="group" defaultChecked={item.price_per === "group"} className="accent-(--accent)" /> Total del grupo
              </label>
              <label className="flex items-center gap-2">
                <input type="checkbox" name="is_free" defaultChecked={item.price_status === "free"} className="accent-(--accent)" /> Es gratis
              </label>
            </div>
            <Field label="Notas personales">
              <textarea name="notes" rows={2} maxLength={1000} defaultValue={item.notes ?? ""} className={cn(inputClass, "h-auto py-2.5")} />
            </Field>
            {error ? <Notice tone="danger">{error}</Notice> : null}
            <div className="flex items-center justify-between gap-2">
              <Button
                type="button"
                variant="danger"
                size="sm"
                disabled={pending}
                onClick={() =>
                  startTransition(async () => {
                    const r = await deleteItem(tripId, item.id);
                    if (r.ok) onClose();
                    else setError(r.error ?? "No se pudo eliminar.");
                  })
                }
              >
                <Trash2 className="size-4" aria-hidden /> Eliminar
              </Button>
              <Button type="submit" disabled={pending}>
                {pending ? "Guardando…" : "Guardar"}
              </Button>
            </div>
          </form>
        ) : item.notes ? (
          <p className="border-t border-line pt-4 text-sm leading-relaxed">{item.notes}</p>
        ) : null}
      </div>
    </Modal>
  );
}

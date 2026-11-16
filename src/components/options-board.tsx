"use client";

import { Check, ExternalLink, Plus, Trash2 } from "lucide-react";
import { useState, useTransition } from "react";
import { addManualOption, chooseOption, confirmOptionPrice, deleteOption } from "@/app/actions/trips";
import { formatDuration } from "@/lib/domain/dates";
import { compareSavings, formatMoney } from "@/lib/domain/money";
import { OPTION_CATEGORY_LABEL, type OptionCategory, type Tier, type TripOption } from "@/lib/domain/types";
import { Modal } from "./modal";
import { AffiliateTag, Badge, Button, cn, EmptyState, Field, inputClass, Notice, PriceBadge, TierBadge } from "./ui";

export interface LinkView {
  provider: string;
  label: string;
  href: string;
  isAffiliate: boolean;
}

const TIER_ORDER: Tier[] = ["cheapest", "best_value", "premium"];

function detailChips(option: TripOption): string[] {
  const d = option.details ?? {};
  const chips: string[] = [];
  if (typeof d.stops === "number") chips.push(d.stops === 0 ? "Directo" : `${d.stops} escala${d.stops > 1 ? "s" : ""}`);
  if (typeof d.duration_min === "number") chips.push(formatDuration(d.duration_min));
  if (d.baggage) chips.push(d.baggage);
  if (typeof d.stars === "number") chips.push(`${d.stars}★`);
  if (typeof d.rating === "number") chips.push(`Valoración ${d.rating.toFixed(1)}/10`);
  if (d.area) chips.push(d.area);
  if (typeof d.distance_center_km === "number") chips.push(`${d.distance_center_km.toFixed(1)} km del centro`);
  if (d.board) chips.push(d.board);
  if (d.conditions) chips.push(d.conditions);
  return chips;
}

export function OptionsBoard({
  tripId,
  category,
  options,
  optionLinks,
  links,
  canEdit,
  currency,
  priceScope,
  emptyHint,
}: {
  tripId: string;
  category: OptionCategory;
  options: TripOption[];
  /** URL de salida ya preparada para cada opción con enlace. */
  optionLinks: Record<string, { href: string; isAffiliate: boolean }>;
  links: LinkView[];
  canEdit: boolean;
  currency: string;
  /** Qué incluye el precio, p. ej. "total para 2 viajeros, ida y vuelta". */
  priceScope: string;
  emptyHint: string;
}) {
  const [adding, setAdding] = useState(false);
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();

  const priced = options.filter((o) => o.price_amount !== null);
  const cheapest = priced.slice().sort((a, b) => a.price_amount! - b.price_amount!)[0];
  const tiered = TIER_ORDER.map((tier) => options.find((o) => o.tier === tier)).filter((o): o is TripOption => Boolean(o));
  const sorted = options
    .slice()
    .sort((a, b) => Number(b.selected) - Number(a.selected) || (a.price_amount ?? Infinity) - (b.price_amount ?? Infinity));

  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "No se pudo completar la acción.");
    });

  return (
    <div className="space-y-8">
      {error ? <Notice tone="danger">{error}</Notice> : null}

      {tiered.length >= 2 ? (
        <section aria-label="Las tres alternativas">
          <div className="grid gap-4 md:grid-cols-3">
            {TIER_ORDER.map((tier) => {
              const option = options.find((o) => o.tier === tier);
              if (!option) {
                return (
                  <div key={tier} className="rounded-2xl border border-dashed border-line p-5 text-sm text-muted">
                    <TierBadge tier={tier} />
                    <p className="mt-3">Sin datos suficientes para esta alternativa.</p>
                  </div>
                );
              }
              const diff =
                cheapest && option.id !== cheapest.id && option.price_amount !== null && option.price_currency === cheapest.price_currency
                  ? option.price_amount - cheapest.price_amount!
                  : null;
              return (
                <div
                  key={tier}
                  className={cn(
                    "flex flex-col rounded-2xl border bg-surface p-5",
                    tier === "best_value" ? "border-accent shadow-card" : "border-line",
                  )}
                >
                  <div className="flex items-center justify-between gap-2">
                    <TierBadge tier={tier} />
                    {option.selected ? <Badge tone="save">Elegida</Badge> : null}
                  </div>
                  <p className="mt-3 font-medium">{option.title}</p>
                  {option.subtitle ? <p className="text-sm text-muted">{option.subtitle}</p> : null}
                  <p className="mt-4 font-display text-3xl font-medium tabular-nums">{formatMoney(option.price_amount, option.price_currency)}</p>
                  <div className="mt-1 flex flex-wrap items-center gap-2">
                    <PriceBadge status={option.price_status} source={option.price_source} />
                    {diff !== null && diff > 0 ? (
                      <span className="text-xs text-muted tabular-nums">+{formatMoney(diff, option.price_currency)} sobre la más económica</span>
                    ) : null}
                  </div>
                </div>
              );
            })}
          </div>
          <p className="mt-3 text-xs leading-relaxed text-muted">
            Precio {priceScope}. Las alternativas se ordenan solo por precio y calidad; que un enlace sea de afiliado no influye.
            {tiered.some((o) => o.price_status === "estimate") ? " Las estimaciones no son precios reales: compruébalas en el proveedor." : ""}
          </p>
        </section>
      ) : null}

      <section>
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h3 className="font-display text-xl font-medium">Todas las opciones de {OPTION_CATEGORY_LABEL[category].toLowerCase()}</h3>
          {canEdit ? (
            <Button variant="secondary" size="sm" onClick={() => setAdding(true)}>
              <Plus className="size-4" aria-hidden /> Añadir un precio que he visto
            </Button>
          ) : null}
        </div>

        {sorted.length === 0 ? (
          <div className="mt-4">
            <EmptyState title="Aún no hay opciones guardadas">{emptyHint}</EmptyState>
          </div>
        ) : (
          <ul className="mt-4 space-y-3">
            {sorted.map((option) => {
              const link = optionLinks[option.id];
              const selectedOne = options.find((o) => o.selected && o.id !== option.id);
              const saving = selectedOne
                ? compareSavings(
                    { amount: selectedOne.price_amount, currency: selectedOne.price_currency, status: selectedOne.price_status },
                    { amount: option.price_amount, currency: option.price_currency, status: option.price_status },
                  )
                : null;
              return (
                <li key={option.id} className={cn("rounded-2xl border bg-surface p-4 sm:p-5", option.selected ? "border-save" : "border-line")}>
                  <div className="flex flex-wrap items-start justify-between gap-x-6 gap-y-3">
                    <div className="min-w-0 flex-1">
                      <div className="flex flex-wrap items-center gap-2">
                        <p className="font-medium">{option.title}</p>
                        {option.tier ? <TierBadge tier={option.tier} /> : null}
                        {option.selected ? <Badge tone="save">Elegida</Badge> : null}
                      </div>
                      {option.subtitle ? <p className="mt-0.5 text-sm text-muted">{option.subtitle}</p> : null}
                      {detailChips(option).length > 0 ? (
                        <p className="mt-2 flex flex-wrap gap-1.5">
                          {detailChips(option).map((chip) => (
                            <Badge key={chip}>{chip}</Badge>
                          ))}
                        </p>
                      ) : null}
                      {option.details.taxes_note || option.details.fees_note ? (
                        <p className="mt-2 text-xs leading-relaxed text-muted">{option.details.taxes_note ?? option.details.fees_note}</p>
                      ) : null}
                      {option.details.notes ? (
                        <p className="mt-2 text-xs leading-relaxed text-muted">
                          <span className="font-medium">Base de la estimación:</span> {option.details.notes}
                        </p>
                      ) : null}
                    </div>
                    <div className="text-right">
                      <p className="font-display text-2xl font-medium tabular-nums">{formatMoney(option.price_amount, option.price_currency)}</p>
                      <div className="mt-1 flex justify-end">
                        <PriceBadge status={option.price_status} source={option.price_source} />
                      </div>
                      {saving ? (
                        <p className={cn("mt-1 text-xs tabular-nums", saving.basis === "verified" ? "font-medium text-save" : "text-warn")}>
                          −{formatMoney(saving.amount, option.price_currency)} frente a la elegida
                          {saving.basis === "estimate" ? " (estimado)" : ""}
                        </p>
                      ) : null}
                    </div>
                  </div>

                  <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-line pt-3">
                    {canEdit ? (
                      <Button
                        size="sm"
                        variant={option.selected ? "secondary" : "primary"}
                        disabled={pending}
                        title="Elegir no reserva nada: solo la incluye en tu presupuesto"
                        onClick={() => run(() => chooseOption(tripId, option.id, !option.selected))}
                      >
                        {option.selected ? (
                          <>
                            <Check className="size-4" aria-hidden /> Elegida
                          </>
                        ) : (
                          "Elegir para mi presupuesto"
                        )}
                      </Button>
                    ) : null}
                    {link ? (
                      <span className="inline-flex items-center gap-2">
                        <a
                          href={link.href}
                          target="_blank"
                          rel="noopener noreferrer nofollow sponsored"
                          className="inline-flex h-8 items-center gap-1.5 rounded-full border border-line px-3 text-sm font-medium transition hover:bg-surface-2"
                        >
                          {option.price_status === "estimate" ? "Ver precio real" : "Ver y reservar"} <ExternalLink className="size-3.5" aria-hidden />
                        </a>
                        {link.isAffiliate ? <AffiliateTag /> : null}
                      </span>
                    ) : null}
                    {canEdit && (option.price_status === "estimate" || option.price_status === "unknown") ? (
                      <ConfirmPrice tripId={tripId} optionId={option.id} currency={currency} onError={setError} />
                    ) : null}
                    {canEdit ? (
                      <button
                        type="button"
                        disabled={pending}
                        onClick={() => run(() => deleteOption(tripId, option.id))}
                        aria-label={`Eliminar ${option.title}`}
                        className="ml-auto grid size-8 place-items-center rounded-full text-muted transition hover:bg-danger-soft hover:text-danger"
                      >
                        <Trash2 className="size-4" aria-hidden />
                      </button>
                    ) : null}
                  </div>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      {links.length > 0 ? (
        <section className="rounded-2xl border border-line bg-surface-2/60 p-5">
          <h3 className="font-display text-xl font-medium">Comprueba precios en vivo</h3>
          <p className="mt-1 text-sm leading-relaxed text-muted">
            Búsquedas ya rellenadas con tus fechas y viajeros. Reservas tú en el proveedor; nosotros no compramos nada.
          </p>
          <ul className="mt-4 flex flex-wrap gap-2">
            {links.map((link) => (
              <li key={link.provider} className="inline-flex items-center gap-2">
                <a
                  href={link.href}
                  target="_blank"
                  rel="noopener noreferrer nofollow sponsored"
                  className="inline-flex h-10 items-center gap-2 rounded-full border border-line bg-surface px-4 text-sm font-medium transition hover:border-ink/40"
                >
                  {link.label} <ExternalLink className="size-3.5" aria-hidden />
                </a>
                {link.isAffiliate ? <AffiliateTag /> : null}
              </li>
            ))}
          </ul>
        </section>
      ) : null}

      <Modal open={adding} onClose={() => setAdding(false)} title="Añadir un precio que has visto">
        <form
          action={(formData) =>
            startTransition(async () => {
              setError(null);
              const r = await addManualOption(tripId, formData);
              if (r.ok) setAdding(false);
              else setError(r.error ?? "No se pudo guardar.");
            })
          }
          className="space-y-4"
        >
          <input type="hidden" name="category" value={category} />
          <p className="text-sm leading-relaxed text-muted">
            Guarda aquí lo que encuentres en cualquier web. Quedará como precio confirmado por ti y entrará en la comparación.
          </p>
          <Field label="Opción">
            <input name="title" required maxLength={140} placeholder={category === "flight" ? "Iberia MAD → KIX, directo" : "Hotel o apartamento"} className={inputClass} />
          </Field>
          <Field label="Detalles" hint="Opcional">
            <input name="subtitle" maxLength={200} placeholder={category === "flight" ? "Maleta facturada incluida" : "Zona, régimen, cancelación"} className={inputClass} />
          </Field>
          <Field label={`Precio total (${currency})`} hint={priceScope}>
            <input name="price_amount" type="number" min={0} step="0.01" required className={inputClass} />
          </Field>
          <Field label="Enlace" hint="Opcional">
            <input name="booking_url" type="url" placeholder="https://…" className={inputClass} />
          </Field>
          {error ? <Notice tone="danger">{error}</Notice> : null}
          <div className="flex justify-end gap-2">
            <Button type="button" variant="ghost" onClick={() => setAdding(false)}>
              Cancelar
            </Button>
            <Button type="submit" disabled={pending}>
              {pending ? "Guardando…" : "Guardar"}
            </Button>
          </div>
        </form>
      </Modal>
    </div>
  );
}

function ConfirmPrice({
  tripId,
  optionId,
  currency,
  onError,
}: {
  tripId: string;
  optionId: string;
  currency: string;
  onError: (message: string | null) => void;
}) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [pending, startTransition] = useTransition();
  if (!open) {
    return (
      <button type="button" onClick={() => setOpen(true)} className="h-8 rounded-full px-3 text-sm text-muted underline-offset-4 transition hover:text-ink hover:underline">
        Sé el precio real
      </button>
    );
  }
  return (
    <form
      className="inline-flex items-center gap-1.5"
      onSubmit={(e) => {
        e.preventDefault();
        const amount = Number(value);
        if (!value || !Number.isFinite(amount)) return;
        startTransition(async () => {
          onError(null);
          const r = await confirmOptionPrice(tripId, optionId, amount);
          if (r.ok) setOpen(false);
          else onError(r.error ?? "No se pudo guardar el precio.");
        });
      }}
    >
      <input
        type="number"
        min={0}
        step="0.01"
        value={value}
        onChange={(e) => setValue(e.target.value)}
        autoFocus
        aria-label={`Precio real en ${currency}`}
        placeholder={`Total en ${currency}`}
        className="h-8 w-32 rounded-full border border-line bg-surface px-3 text-sm focus:border-accent focus:outline-none"
      />
      <Button type="submit" size="sm" disabled={pending}>
        Confirmar
      </Button>
    </form>
  );
}

import Link from "next/link";
import type { ComponentProps, ReactNode } from "react";
import { BRAND } from "@/lib/brand";
import { PRICE_STATUS_LABEL } from "@/lib/domain/money";
import type { PriceStatus, Tier } from "@/lib/domain/types";
import { TIER_LABEL } from "@/lib/domain/types";

export function cn(...classes: (string | false | null | undefined)[]): string {
  return classes.filter(Boolean).join(" ");
}

// ── Botones ─────────────────────────────────────────────────────────────

type Variant = "primary" | "accent" | "secondary" | "ghost" | "danger";
type Size = "sm" | "md" | "lg";

const VARIANT: Record<Variant, string> = {
  primary: "bg-ink text-bg hover:opacity-90",
  accent: "bg-accent text-accent-ink hover:opacity-90",
  secondary: "border border-line bg-surface text-ink hover:bg-surface-2",
  ghost: "text-ink hover:bg-surface-2",
  danger: "bg-danger-soft text-danger hover:opacity-90",
};

const SIZE: Record<Size, string> = {
  sm: "h-8 px-3 text-sm gap-1.5",
  md: "h-10 px-4 text-sm gap-2",
  lg: "h-12 px-6 text-base gap-2",
};

export function buttonClass(variant: Variant = "primary", size: Size = "md", extra?: string): string {
  return cn(
    "inline-flex shrink-0 items-center justify-center rounded-full font-medium whitespace-nowrap transition",
    "active:scale-[0.98] disabled:pointer-events-none disabled:opacity-50",
    VARIANT[variant],
    SIZE[size],
    extra,
  );
}

export function Button({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<"button"> & { variant?: Variant; size?: Size }) {
  return <button className={buttonClass(variant, size, className)} {...props} />;
}

export function ButtonLink({
  variant = "primary",
  size = "md",
  className,
  ...props
}: ComponentProps<typeof Link> & { variant?: Variant; size?: Size }) {
  return <Link className={buttonClass(variant, size, className)} {...props} />;
}

// ── Formularios ─────────────────────────────────────────────────────────

export const inputClass =
  "h-11 w-full rounded-xl border border-line bg-surface px-3.5 text-[15px] text-ink placeholder:text-muted/70 transition focus:border-accent focus:outline-none focus:ring-2 focus:ring-accent/20";

export function Field({
  label,
  hint,
  children,
  className,
}: {
  label: string;
  hint?: string;
  children: ReactNode;
  className?: string;
}) {
  return (
    <label className={cn("block", className)}>
      <span className="mb-1.5 flex items-baseline justify-between gap-2 text-sm font-medium text-ink">
        {label}
        {hint ? <span className="text-xs font-normal text-muted">{hint}</span> : null}
      </span>
      {children}
    </label>
  );
}

// ── Superficies ─────────────────────────────────────────────────────────

export function Card({ className, ...props }: ComponentProps<"div">) {
  return <div className={cn("rounded-2xl border border-line bg-surface shadow-card", className)} {...props} />;
}

export function SectionHeading({
  eyebrow,
  title,
  description,
  align = "left",
}: {
  eyebrow?: string;
  title: ReactNode;
  description?: ReactNode;
  align?: "left" | "center";
}) {
  return (
    <div className={cn("max-w-2xl", align === "center" && "mx-auto text-center")}>
      {eyebrow ? (
        <p className="mb-3 text-xs font-semibold tracking-[0.18em] text-accent uppercase">{eyebrow}</p>
      ) : null}
      <h2 className="font-display text-3xl leading-[1.1] font-medium tracking-tight text-ink sm:text-[2.6rem]">
        {title}
      </h2>
      {description ? <p className="mt-4 text-lg leading-relaxed text-muted">{description}</p> : null}
    </div>
  );
}

export function Notice({
  tone = "info",
  children,
  className,
}: {
  tone?: "info" | "warn" | "save" | "danger";
  children: ReactNode;
  className?: string;
}) {
  const tones = {
    info: "bg-accent-soft text-ink",
    warn: "bg-warn-soft text-ink",
    save: "bg-save-soft text-ink",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <div role={tone === "danger" ? "alert" : "status"} className={cn("rounded-xl px-4 py-3 text-sm leading-relaxed", tones[tone], className)}>
      {children}
    </div>
  );
}

export function EmptyState({ title, children, action }: { title: string; children?: ReactNode; action?: ReactNode }) {
  return (
    <div className="rounded-2xl border border-dashed border-line px-6 py-12 text-center">
      <h3 className="font-display text-xl font-medium text-ink">{title}</h3>
      {children ? <p className="mx-auto mt-2 max-w-md text-sm leading-relaxed text-muted">{children}</p> : null}
      {action ? <div className="mt-5 flex justify-center">{action}</div> : null}
    </div>
  );
}

// ── Etiquetas ───────────────────────────────────────────────────────────

export function Badge({
  tone = "neutral",
  className,
  ...props
}: ComponentProps<"span"> & { tone?: "neutral" | "accent" | "save" | "warn" | "danger" }) {
  const tones = {
    neutral: "bg-surface-2 text-muted",
    accent: "bg-accent-soft text-accent",
    save: "bg-save-soft text-save",
    warn: "bg-warn-soft text-warn",
    danger: "bg-danger-soft text-danger",
  };
  return (
    <span
      className={cn(
        "inline-flex items-center gap-1 rounded-full px-2 py-0.5 text-[11px] font-semibold tracking-wide whitespace-nowrap",
        tones[tone],
        className,
      )}
      {...props}
    />
  );
}

/** Procedencia del precio: verde = confirmado, ámbar = estimación. */
export function PriceBadge({ status, source }: { status: PriceStatus; source?: string | null }) {
  const tone = status === "verified" || status === "user" || status === "free" ? "save" : status === "estimate" ? "warn" : "neutral";
  const title =
    status === "estimate"
      ? "Estimación orientativa. No es un precio real ni garantiza disponibilidad: compruébalo en el proveedor."
      : status === "verified"
        ? `Precio obtenido de ${source ?? "el proveedor"}. Puede cambiar hasta el momento de reservar.`
        : undefined;
  return (
    <Badge tone={tone} title={title}>
      {PRICE_STATUS_LABEL[status]}
      {status === "verified" && source ? ` · ${source}` : ""}
    </Badge>
  );
}

export function TierBadge({ tier }: { tier: Tier }) {
  return <Badge tone={tier === "best_value" ? "accent" : "neutral"}>{TIER_LABEL[tier]}</Badge>;
}

export function AffiliateTag() {
  return (
    <span className="text-[11px] text-muted" title="Si reservas a través de este enlace podemos recibir una comisión, sin coste para ti. No influye en el orden de las recomendaciones.">
      Enlace de afiliado
    </span>
  );
}

// ── Marca ───────────────────────────────────────────────────────────────

export function Logo({ href = "/", className }: { href?: string; className?: string }) {
  return (
    <Link href={href} className={cn("inline-flex items-center gap-2 text-ink", className)} aria-label={`${BRAND.name}, inicio`}>
      <svg width="26" height="26" viewBox="0 0 32 32" fill="none" aria-hidden="true">
        <circle cx="16" cy="16" r="15" stroke="currentColor" strokeWidth="1.5" />
        <path d="M21.5 10.5 18 18l-7.5 3.5L14 14l7.5-3.5Z" fill="var(--accent)" />
        <circle cx="16" cy="16" r="1.4" fill="var(--bg)" />
      </svg>
      <span className="font-display text-[1.35rem] leading-none font-medium tracking-tight">{BRAND.name}</span>
    </Link>
  );
}

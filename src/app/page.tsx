import {
  ArrowRight,
  BedDouble,
  Check,
  Compass,
  MessagesSquare,
  Minus,
  PiggyBank,
  Plane,
  Route,
  ShieldCheck,
  Sparkles,
  Ticket,
} from "lucide-react";
import Link from "next/link";
import { Reveal } from "@/components/client-bits";
import { PricingPlans } from "@/components/pricing-plans";
import { MarketingHeader, SiteFooter } from "@/components/site-chrome";
import { TripSearchForm } from "@/components/trip-search-form";
import { Badge, ButtonLink, Card, PriceBadge, SectionHeading } from "@/components/ui";
import { BRAND } from "@/lib/brand";
import { DESTINATIONS, HERO_IMAGE } from "@/lib/content/destinations";
import { formatMoney } from "@/lib/domain/money";

const AGENTS = [
  {
    icon: Plane,
    name: "Experto en vuelos",
    text: "Compara aerolíneas, aeropuertos alternativos, escalas y duración, y calcula el coste real con equipaje y tasas.",
  },
  {
    icon: BedDouble,
    name: "Experto en hoteles",
    text: "Evalúa zonas, valoraciones y distancia a lo que vas a visitar. Precio total de la estancia, impuestos y condiciones.",
  },
  {
    icon: Route,
    name: "Arquitecto de itinerarios",
    text: "Organiza cada día por cercanía y horarios, calcula los trayectos, respeta tu ritmo y prepara un plan B para la lluvia.",
  },
  {
    icon: Ticket,
    name: "Experto en experiencias",
    text: "Museos, excursiones, parques, restaurantes y planes gratuitos elegidos para tu tipo de viaje, no una lista genérica.",
  },
  {
    icon: PiggyBank,
    name: "Optimizador de presupuesto",
    text: "Revisa el viaje entero y busca dónde gastar menos sin estropearlo. Cada ahorro, con su comparación delante.",
    highlight: true,
  },
  {
    icon: MessagesSquare,
    name: "Asistente personal",
    text: "Tu interlocutor. Le pides cambios con tus palabras y coordina al resto del equipo para actualizar el viaje.",
  },
];

const STEPS = [
  {
    n: "01",
    title: "Cuéntanos el viaje",
    text: "Destino, fechas, cuántos sois, presupuesto y lo que os importa. Un minuto.",
  },
  {
    n: "02",
    title: "El equipo se pone a trabajar",
    text: "Seis agentes especializados colaboran sobre el mismo viaje: itinerario, vuelos, alojamiento, experiencias y presupuesto.",
  },
  {
    n: "03",
    title: "Ajusta y reserva donde quieras",
    text: "Arrastra, pregunta, cambia. Cuando te convenza, reservas tú directamente en el proveedor: nosotros nunca compramos por ti.",
  },
];

// Ejemplo ILUSTRATIVO: cifras de muestra para enseñar el comparador.
const EXAMPLE = {
  title: "7 días en Kioto para 2 personas",
  rows: [
    { label: "Vuelos", before: 1480, after: 1210, how: "Salir un martes y volver por Osaka (KIX)" },
    { label: "Alojamiento", before: 980, after: 760, how: "Misma categoría junto a la estación en vez de Gion" },
    { label: "Transporte", before: 220, after: 140, how: "Abono de autobús y metro en lugar de taxis" },
    { label: "Actividades", before: 310, after: 205, how: "Tres templos de pago sustituidos por equivalentes gratuitos" },
    { label: "Comidas", before: 560, after: 560, how: "Sin cambios: era una prioridad del viajero" },
  ],
};

const COMPARISON = [
  ["Diez pestañas abiertas entre buscadores, mapas y blogs", "Todo el viaje en un único espacio de trabajo"],
  ["Itinerarios copiados que no encajan con tus fechas ni tu ritmo", "Días organizados por cercanía, a tu ritmo y con plan B para lluvia"],
  ["El presupuesto real lo descubres al final", "Coste total visible desde el principio, partida a partida"],
  ["«Ofertas» sin saber contra qué se comparan", "Cada ahorro con sus dos precios, y dicho si es verificado o estimado"],
  ["Billetes y reservas repartidos por el correo", "Documentos del viaje guardados junto al itinerario"],
  ["Cambiar un plan obliga a rehacerlo todo", "Pides el cambio al asistente y se recalcula el día"],
];

const FAQ = [
  {
    q: "¿Los precios que veo son reales?",
    a: "Cada precio lleva una etiqueta con su procedencia. «Precio verificado» significa que lo ha devuelto el proveedor en el momento de la consulta. «Estimación» es una cifra orientativa calculada por la IA para que puedas presupuestar: no es un precio real ni garantiza disponibilidad, y siempre va acompañada de un enlace para comprobarlo en vivo. Nunca mezclamos unas con otras sin avisar.",
  },
  {
    q: "¿Reserváis vosotros los vuelos y hoteles?",
    a: "No. La plataforma planifica y compara; la reserva la haces tú en la web del proveedor cuando lo decides. Ningún agente puede comprar ni reservar en tu nombre.",
  },
  {
    q: "¿Cómo ganáis dinero? ¿Influye en lo que me recomendáis?",
    a: "Con la suscripción Premium y, en algunos casos, con una comisión de afiliación si reservas a través de un enlace identificado como tal. La comisión no interviene en el orden de las recomendaciones: las alternativas se ordenan solo por precio y calidad.",
  },
  {
    q: "¿Qué pasa si la IA se equivoca?",
    a: "Puede pasar: horarios que cambian, un sitio cerrado por obras. Por eso los lugares del itinerario enlazan a su fuente, los trayectos se marcan como aproximados y te recomendamos confirmar horarios y entradas antes de ir. Todo es editable por ti en cualquier momento.",
  },
  {
    q: "¿Puedo organizar el viaje con más personas?",
    a: "Sí. Puedes compartir el viaje con un enlace de solo lectura o invitar a colaboradores para que lo editen contigo.",
  },
  {
    q: "¿Qué hacéis con mis datos?",
    a: "Los usamos para prestarte el servicio y nada más. Los datos se alojan en la Unión Europea, no guardamos datos de tu tarjeta (el pago lo gestiona Stripe) y puedes descargar o eliminar tu cuenta y todos tus datos desde tu perfil cuando quieras.",
  },
  {
    q: "¿Puedo cancelar Premium?",
    a: "Cuando quieras, desde tu cuenta. Conservas las ventajas hasta el final del periodo pagado y tus viajes no se borran.",
  },
];

export default function HomePage() {
  const before = EXAMPLE.rows.reduce((s, r) => s + r.before, 0);
  const after = EXAMPLE.rows.reduce((s, r) => s + r.after, 0);

  return (
    <>
      <MarketingHeader overlay />
      <main>
        {/* ── 1-3. Hero, eslogan y buscador ── */}
        <section className="relative isolate">
          <div className="absolute inset-0 -z-10 overflow-hidden bg-[#1c2a30]">
            {/* eslint-disable-next-line @next/next/no-img-element */}
            <img
              src={HERO_IMAGE.src}
              alt={HERO_IMAGE.alt}
              fetchPriority="high"
              className="size-full animate-fade object-cover"
              style={{ objectPosition: HERO_IMAGE.position }}
            />
            <div className="absolute inset-0 bg-linear-to-b from-black/55 via-black/25 to-black/60" />
          </div>
          <div className="mx-auto max-w-6xl px-5 pt-36 pb-56 sm:px-8 sm:pt-44 sm:pb-64 lg:pb-52">
            <p className="animate-rise text-sm font-medium tracking-wide text-white/85">
              <Sparkles className="mr-1.5 inline size-4 align-[-3px]" aria-hidden />
              Seis agentes de IA trabajando en tu viaje
            </p>
            <h1 className="mt-4 max-w-3xl animate-rise font-display text-[2.7rem] leading-[1.02] font-medium tracking-tight text-white [animation-delay:80ms] sm:text-7xl">
              Tu próximo viaje, al mejor precio.
              <span className="block font-light text-white/90 italic">Organizado por IA.</span>
            </h1>
            <p className="mt-6 max-w-xl animate-rise text-lg leading-relaxed text-white/85 [animation-delay:160ms]">
              Vuelos, alojamiento, itinerario y presupuesto en un único lugar. Compara alternativas reales, descubre
              dónde ahorrar y sal de casa con todo organizado.
            </p>
          </div>
          <p className="absolute right-3 bottom-2 text-[10px] text-white/55">
            <Link href="/legal/creditos" className="hover:text-white/90">
              Foto: {HERO_IMAGE.credit}
            </Link>
          </p>
        </section>

        <section aria-label="Buscador de viajes" className="relative z-10 mx-auto -mt-44 max-w-6xl px-3 sm:-mt-48 sm:px-8 lg:-mt-36">
          <div className="animate-rise rounded-[1.75rem] border border-line bg-bg p-3 shadow-float [animation-delay:240ms] sm:p-5">
            <TripSearchForm mode="landing" />
          </div>
          <p className="mt-3 flex flex-wrap items-center justify-center gap-x-5 gap-y-1 text-xs text-muted">
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-accent" aria-hidden /> Sin tarjeta para empezar
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-accent" aria-hidden /> Nunca reservamos sin que tú lo decidas
            </span>
            <span className="inline-flex items-center gap-1.5">
              <ShieldCheck className="size-3.5 text-accent" aria-hidden /> Precios estimados siempre identificados
            </span>
          </p>
        </section>

        {/* ── 4. Cómo funciona ── */}
        <section id="como-funciona" className="mx-auto max-w-6xl scroll-mt-10 px-5 py-24 sm:px-8 sm:py-32">
          <Reveal>
            <SectionHeading
              eyebrow="Cómo funciona"
              title="De una idea a un viaje completo en minutos"
              description="Sin diez pestañas abiertas ni hojas de cálculo. Tú decides; el equipo hace el trabajo pesado."
            />
          </Reveal>
          <ol className="mt-14 grid gap-8 md:grid-cols-3">
            {STEPS.map((step, i) => (
              <Reveal key={step.n} delay={i * 90}>
                <li className="border-t border-ink pt-5">
                  <span className="font-display text-sm text-accent">{step.n}</span>
                  <h3 className="mt-3 font-display text-2xl leading-tight font-medium">{step.title}</h3>
                  <p className="mt-3 leading-relaxed text-muted">{step.text}</p>
                </li>
              </Reveal>
            ))}
          </ol>
        </section>

        {/* ── 5. Agentes ── */}
        <section id="agentes" className="scroll-mt-10 border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
            <Reveal>
              <SectionHeading
                eyebrow="Tu equipo"
                title="Seis especialistas, un solo viaje"
                description="Cada agente domina una parte del viaje y todos trabajan sobre el mismo plan. Lo que uno decide, los demás lo tienen en cuenta."
              />
            </Reveal>
            <div className="mt-14 grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
              {AGENTS.map((agent, i) => (
                <Reveal key={agent.name} delay={(i % 3) * 80}>
                  <article
                    className={
                      agent.highlight
                        ? "h-full rounded-2xl border border-accent bg-accent-soft p-6"
                        : "h-full rounded-2xl border border-line bg-bg p-6 transition hover:border-ink/30"
                    }
                  >
                    <div className="flex items-center justify-between">
                      <span className="grid size-11 place-items-center rounded-xl bg-surface text-accent shadow-card">
                        <agent.icon className="size-5" aria-hidden />
                      </span>
                      {agent.highlight ? <Badge tone="accent">El que más ahorra</Badge> : null}
                    </div>
                    <h3 className="mt-5 font-display text-xl font-medium">{agent.name}</h3>
                    <p className="mt-2 text-[15px] leading-relaxed text-muted">{agent.text}</p>
                  </article>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── 6. Ejemplo de viaje optimizado ── */}
        <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
          <div className="grid items-start gap-12 lg:grid-cols-[0.9fr_1.1fr]">
            <Reveal>
              <SectionHeading
                eyebrow="Ahorro que se puede comprobar"
                title="Cada euro ahorrado, con su comparación delante"
                description="El optimizador no promete descuentos: enseña el precio de partida, la alternativa y qué cambia entre una y otra. Tú decides si compensa."
              />
              <ul className="mt-8 space-y-3 text-[15px] text-ink">
                {[
                  "Presupuesto inicial frente a presupuesto optimizado",
                  "Qué se sacrifica en cada cambio, sin letra pequeña",
                  "Verificado y estimado, siempre diferenciados",
                ].map((t) => (
                  <li key={t} className="flex gap-3">
                    <Check className="mt-0.5 size-5 shrink-0 text-save" aria-hidden />
                    {t}
                  </li>
                ))}
              </ul>
            </Reveal>

            <Reveal delay={120}>
              <Card className="overflow-hidden">
                <div className="flex flex-wrap items-center justify-between gap-2 border-b border-line px-6 py-4">
                  <div>
                    <p className="text-xs font-semibold tracking-wider text-muted uppercase">Ejemplo ilustrativo</p>
                    <h3 className="font-display text-xl font-medium">{EXAMPLE.title}</h3>
                  </div>
                  <PriceBadge status="estimate" />
                </div>
                <div className="divide-y divide-line">
                  {EXAMPLE.rows.map((row) => {
                    const diff = row.before - row.after;
                    return (
                      <div key={row.label} className="grid grid-cols-[1fr_auto] gap-x-4 gap-y-1 px-6 py-3.5">
                        <p className="font-medium">{row.label}</p>
                        <p className="text-right tabular-nums">
                          {diff > 0 ? <span className="mr-2 text-sm text-muted line-through">{formatMoney(row.before)}</span> : null}
                          <span className="font-medium">{formatMoney(row.after)}</span>
                        </p>
                        <p className="text-sm text-muted">{row.how}</p>
                        <p className="text-right text-sm tabular-nums">
                          {diff > 0 ? <span className="font-medium text-save">−{formatMoney(diff)}</span> : <span className="text-muted">—</span>}
                        </p>
                      </div>
                    );
                  })}
                </div>
                <div className="grid grid-cols-3 gap-4 border-t border-line bg-surface-2 px-6 py-5 text-center">
                  <div>
                    <p className="text-xs text-muted">Inicial</p>
                    <p className="font-display text-2xl tabular-nums">{formatMoney(before)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Optimizado</p>
                    <p className="font-display text-2xl tabular-nums">{formatMoney(after)}</p>
                  </div>
                  <div>
                    <p className="text-xs text-muted">Diferencia</p>
                    <p className="font-display text-2xl text-save tabular-nums">−{formatMoney(before - after)}</p>
                  </div>
                </div>
                <p className="border-t border-line px-6 py-3 text-xs leading-relaxed text-muted">
                  Cifras de muestra para enseñar cómo funciona el comparador. No son precios en vivo ni una promesa de
                  ahorro: en tu viaje verás tus propios importes, cada uno con su procedencia.
                </p>
              </Card>
            </Reveal>
          </div>
        </section>

        {/* ── 7. Destinos populares ── */}
        <section className="border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
            <Reveal>
              <div className="flex flex-wrap items-end justify-between gap-6">
                <SectionHeading eyebrow="Inspiración" title="Destinos para empezar a soñar" />
                <p className="max-w-sm text-sm leading-relaxed text-muted">
                  Elige uno y el equipo te prepara un primer plan con lugares reales. Cámbialo después todo lo que quieras.
                </p>
              </div>
            </Reveal>
            <div className="mt-12 grid grid-cols-2 gap-3 sm:gap-4 lg:grid-cols-4">
              {DESTINATIONS.map((d, i) => (
                <Reveal key={d.slug} delay={(i % 4) * 70}>
                  <Link
                    href={`/app/nuevo?destination=${encodeURIComponent(d.query)}`}
                    className="group relative block aspect-[3/4] overflow-hidden rounded-2xl bg-surface-2"
                  >
                    {/* eslint-disable-next-line @next/next/no-img-element */}
                    <img
                      src={d.src}
                      alt={d.alt}
                      loading="lazy"
                      className="size-full object-cover transition duration-700 group-hover:scale-105"
                      style={{ objectPosition: d.position }}
                    />
                    <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/5 to-transparent" />
                    <div className="absolute inset-x-0 bottom-0 p-4 text-white">
                      <p className="font-display text-2xl leading-tight font-medium">{d.name}</p>
                      <p className="mt-0.5 flex items-center gap-1 text-sm text-white/85">
                        {d.tagline}
                        <ArrowRight className="size-3.5 -translate-x-1 opacity-0 transition group-hover:translate-x-0 group-hover:opacity-100" aria-hidden />
                      </p>
                    </div>
                  </Link>
                </Reveal>
              ))}
            </div>
          </div>
        </section>

        {/* ── 8. Comparación ── */}
        <section className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-32">
          <Reveal>
            <SectionHeading
              align="center"
              eyebrow="La diferencia"
              title="Organizar un viaje por tu cuenta, o con un equipo"
            />
          </Reveal>
          <Reveal delay={100}>
            <div className="mx-auto mt-12 max-w-4xl overflow-hidden rounded-3xl border border-line">
              <div className="grid grid-cols-2 bg-surface-2 text-sm font-semibold">
                <p className="px-5 py-4 text-muted sm:px-7">Por tu cuenta</p>
                <p className="flex items-center gap-2 border-l border-line bg-accent-soft px-5 py-4 text-accent sm:px-7">
                  <Compass className="size-4" aria-hidden /> Con {BRAND.name}
                </p>
              </div>
              {COMPARISON.map(([manual, platform]) => (
                <div key={manual} className="grid grid-cols-2 border-t border-line text-[15px] leading-relaxed">
                  <p className="flex gap-2.5 px-5 py-4 text-muted sm:px-7">
                    <Minus className="mt-1 size-4 shrink-0 opacity-60" aria-hidden />
                    {manual}
                  </p>
                  <p className="flex gap-2.5 border-l border-line bg-surface px-5 py-4 sm:px-7">
                    <Check className="mt-1 size-4 shrink-0 text-save" aria-hidden />
                    {platform}
                  </p>
                </div>
              ))}
            </div>
          </Reveal>
        </section>

        {/* ── 9. Planes ── */}
        <section id="planes" className="scroll-mt-10 border-y border-line bg-surface">
          <div className="mx-auto max-w-6xl px-5 py-24 sm:px-8 sm:py-28">
            <Reveal>
              <SectionHeading
                align="center"
                eyebrow="Planes"
                title="Empieza gratis. Pasa a Premium cuando viajes más"
                description="Sin permanencia. Tus viajes siguen siendo tuyos en cualquier plan."
              />
            </Reveal>
            <Reveal delay={100} className="mt-12">
              <PricingPlans />
            </Reveal>
          </div>
        </section>

        {/* ── 10. Preguntas frecuentes ── */}
        <section id="faq" className="mx-auto max-w-3xl scroll-mt-10 px-5 py-24 sm:px-8 sm:py-32">
          <Reveal>
            <SectionHeading align="center" eyebrow="Preguntas frecuentes" title="Lo que conviene saber antes de empezar" />
          </Reveal>
          <div className="mt-12 divide-y divide-line border-y border-line">
            {FAQ.map((item) => (
              <details key={item.q} className="group py-1">
                <summary className="flex cursor-pointer list-none items-center justify-between gap-6 py-4 text-left text-lg font-medium [&::-webkit-details-marker]:hidden">
                  {item.q}
                  <span className="grid size-7 shrink-0 place-items-center rounded-full border border-line text-muted transition group-open:rotate-45 group-open:border-ink group-open:text-ink" aria-hidden>
                    +
                  </span>
                </summary>
                <p className="pr-12 pb-5 leading-relaxed text-muted">{item.a}</p>
              </details>
            ))}
          </div>
        </section>

        {/* ── 11. Llamada a la acción ── */}
        <section className="px-3 pb-6 sm:px-8 sm:pb-12">
          <Reveal>
            <div className="mx-auto max-w-6xl overflow-hidden rounded-[2rem] bg-ink px-6 py-20 text-center text-bg sm:px-12 sm:py-24">
              <h2 className="mx-auto max-w-2xl font-display text-4xl leading-[1.05] font-medium tracking-tight sm:text-6xl">
                Tu próximo viaje empieza con una frase
              </h2>
              <p className="mx-auto mt-5 max-w-xl text-lg leading-relaxed opacity-75">
                Dinos a dónde quieres ir y deja que el equipo te enseñe un primer plan. Gratis y sin tarjeta.
              </p>
              <div className="mt-9 flex justify-center">
                <ButtonLink href="/app/nuevo" size="lg" className="bg-bg! text-ink!">
                  Crear mi primer viaje <ArrowRight className="size-4" aria-hidden />
                </ButtonLink>
              </div>
            </div>
          </Reveal>
        </section>
      </main>
      <SiteFooter />
    </>
  );
}

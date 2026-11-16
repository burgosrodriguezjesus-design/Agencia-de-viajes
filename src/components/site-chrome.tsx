import Link from "next/link";
import { BRAND } from "@/lib/brand";
import { ThemeToggle } from "./client-bits";
import { ButtonLink, cn, Logo } from "./ui";

export function MarketingHeader({ overlay = false }: { overlay?: boolean }) {
  return (
    <header
      className={cn(
        "z-30 w-full",
        overlay ? "absolute inset-x-0 top-0 text-white [--logo-ia:#8fe3ee] [&_a]:text-white" : "border-b border-line bg-bg text-ink",
      )}
    >
      <div className="mx-auto flex h-18 max-w-6xl items-center justify-between gap-4 px-5 py-4 sm:px-8">
        <Logo className={overlay ? "text-white!" : undefined} />
        <nav aria-label="Principal" className="hidden items-center gap-7 text-sm font-medium md:flex">
          <Link href="/#como-funciona" className="opacity-85 transition hover:opacity-100">Cómo funciona</Link>
          <Link href="/#agentes" className="opacity-85 transition hover:opacity-100">Agentes</Link>
          <Link href="/#planes" className="opacity-85 transition hover:opacity-100">Planes</Link>
          <Link href="/#faq" className="opacity-85 transition hover:opacity-100">Preguntas</Link>
        </nav>
        <div className="flex items-center gap-1.5">
          <ThemeToggle />
          <Link href="/login" className="hidden h-10 items-center rounded-full px-3 text-sm font-medium opacity-90 transition hover:opacity-100 sm:inline-flex">
            Entrar
          </Link>
          <ButtonLink
            href="/registro"
            size="sm"
            className={overlay ? "bg-white! text-[#14181a]! [&]:text-[#14181a]!" : undefined}
          >
            Crear cuenta
          </ButtonLink>
        </div>
      </div>
    </header>
  );
}

export function SiteFooter() {
  return (
    <footer className="mt-auto border-t border-line bg-surface">
      <div className="mx-auto grid max-w-6xl gap-10 px-5 py-12 sm:px-8 md:grid-cols-[1.4fr_1fr_1fr_1fr]">
        <div>
          <Logo />
          <p className="mt-3 max-w-xs text-sm leading-relaxed text-muted">
            Viajar mejor, gastar menos y tenerlo todo organizado en un único lugar.
          </p>
        </div>
        <FooterColumn title="Producto">
          <Link href="/#como-funciona">Cómo funciona</Link>
          <Link href="/#agentes">Agentes de IA</Link>
          <Link href="/#planes">Planes y precios</Link>
          <Link href="/#faq">Preguntas frecuentes</Link>
        </FooterColumn>
        <FooterColumn title="Tu cuenta">
          <Link href="/registro">Crear cuenta</Link>
          <Link href="/login">Entrar</Link>
          <Link href="/app">Mis viajes</Link>
        </FooterColumn>
        <FooterColumn title="Legal">
          <Link href="/legal/privacidad">Privacidad</Link>
          <Link href="/legal/terminos">Términos y condiciones</Link>
          <Link href="/legal/afiliacion">Transparencia y afiliación</Link>
          <Link href="/legal/cookies">Cookies</Link>
          <Link href="/legal/creditos">Créditos de imágenes y datos</Link>
        </FooterColumn>
      </div>
      <div className="border-t border-line">
        <p className="mx-auto max-w-6xl px-5 py-5 text-xs leading-relaxed text-muted sm:px-8">
          {BRAND.name} no vende ni reserva viajes: te ayuda a planificarlos y a comparar. Las reservas se hacen siempre
          en la web del proveedor y solo cuando tú lo decides. Algunos enlaces pueden ser de afiliado y están
          identificados; nunca alteran el orden de las recomendaciones. Los precios marcados como «Estimación» son
          orientativos y no garantizan disponibilidad.
        </p>
      </div>
    </footer>
  );
}

function FooterColumn({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <div>
      <h3 className="text-xs font-semibold tracking-[0.16em] text-muted uppercase">{title}</h3>
      <div className="mt-3 flex flex-col gap-2 text-sm text-ink [&_a]:w-fit [&_a]:opacity-85 [&_a]:transition [&_a:hover]:opacity-100">
        {children}
      </div>
    </div>
  );
}

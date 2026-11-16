import { ButtonLink, Logo } from "@/components/ui";

export default function NotFound() {
  return (
    <main className="grid min-h-dvh place-items-center px-5 text-center">
      <div>
        <div className="flex justify-center">
          <Logo />
        </div>
        <p className="mt-10 font-display text-7xl font-medium text-accent">404</p>
        <h1 className="mt-3 font-display text-3xl font-medium">Aquí no hay ningún destino</h1>
        <p className="mx-auto mt-2 max-w-sm text-muted">La página no existe o ya no tienes acceso a ella.</p>
        <div className="mt-7 flex justify-center gap-2">
          <ButtonLink href="/">Volver al inicio</ButtonLink>
          <ButtonLink href="/app" variant="secondary">Mis viajes</ButtonLink>
        </div>
      </div>
    </main>
  );
}

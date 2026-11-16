import Link from "next/link";
import { Suspense } from "react";
import { signOut } from "@/app/actions/auth";
import { ThemeToggle } from "@/components/client-bits";
import { Badge, Logo } from "@/components/ui";
import { PLANS } from "@/lib/billing/plans";
import { loadSession } from "@/lib/trip-context";

// Zona privada: cada página lee la sesión, así que se renderiza por petición.
export const instant = false;

async function AccountChip() {
  const { user, plan } = await loadSession();
  return (
    <>
      <Link href="/app/cuenta" className="hidden items-center gap-2 rounded-full px-2 py-1 text-sm text-muted transition hover:text-ink sm:flex" title={user.email ?? undefined}>
        <span className="max-w-40 truncate">{user.email}</span>
        <Badge tone={plan === "premium" ? "accent" : "neutral"}>{PLANS[plan].name}</Badge>
      </Link>
      <form action={signOut}>
        <button className="h-9 rounded-full px-3 text-sm font-medium text-muted transition hover:bg-surface-2 hover:text-ink">Salir</button>
      </form>
    </>
  );
}

export default function AppLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="flex min-h-dvh flex-col">
      <header className="sticky top-0 z-30 border-b border-line bg-bg/85 backdrop-blur-md">
        <div className="mx-auto flex h-16 max-w-7xl items-center justify-between gap-3 px-4 sm:px-6">
          <div className="flex items-center gap-6">
            <Logo href="/app" />
            <nav aria-label="Aplicación" className="flex items-center gap-1 text-sm font-medium">
              <Link href="/app" className="rounded-full px-3 py-1.5 text-muted transition hover:bg-surface-2 hover:text-ink">Mis viajes</Link>
              <Link href="/app/cuenta" className="rounded-full px-3 py-1.5 text-muted transition hover:bg-surface-2 hover:text-ink">Cuenta</Link>
            </nav>
          </div>
          <div className="flex items-center gap-1">
            <ThemeToggle />
            <Suspense fallback={<span className="h-9 w-16" />}>
              <AccountChip />
            </Suspense>
          </div>
        </div>
      </header>
      <Suspense fallback={<PageSkeleton />}>{children}</Suspense>
    </div>
  );
}

function PageSkeleton() {
  return (
    <div className="mx-auto w-full max-w-7xl animate-pulse-soft space-y-5 px-4 py-10 sm:px-6" aria-busy="true" aria-label="Cargando">
      <div className="h-9 w-64 rounded-xl bg-surface-2" />
      <div className="h-5 w-96 max-w-full rounded-lg bg-surface-2" />
      <div className="grid gap-4 pt-4 sm:grid-cols-2 lg:grid-cols-3">
        {[0, 1, 2].map((i) => (
          <div key={i} className="h-56 rounded-2xl bg-surface-2" />
        ))}
      </div>
    </div>
  );
}

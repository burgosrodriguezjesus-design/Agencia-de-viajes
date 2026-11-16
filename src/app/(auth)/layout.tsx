import { ThemeToggle } from "@/components/client-bits";
import { SafeImg } from "@/components/safe-img";
import { Logo } from "@/components/ui";
import { HERO_IMAGE } from "@/lib/content/destinations";

export default function AuthLayout({ children }: { children: React.ReactNode }) {
  return (
    <div className="grid min-h-dvh lg:grid-cols-[1fr_1.1fr]">
      <div className="flex flex-col px-6 py-6 sm:px-12">
        <div className="flex items-center justify-between">
          <Logo />
          <ThemeToggle />
        </div>
        <main className="mx-auto flex w-full max-w-sm flex-1 flex-col justify-center py-12">{children}</main>
      </div>
      <div className="relative hidden bg-[#1c2a30] lg:block">
        <SafeImg src={HERO_IMAGE.src} className="absolute inset-0 size-full object-cover" style={{ objectPosition: HERO_IMAGE.position }} />
        <div className="absolute inset-0 bg-linear-to-t from-black/70 via-black/10 to-black/20" />
        <blockquote className="absolute inset-x-0 bottom-0 p-12 text-white">
          <p className="max-w-md font-display text-4xl leading-tight font-medium">
            Viajar mejor. Gastar menos. Todo en un único lugar.
          </p>
          <p className="mt-4 max-w-sm text-white/80">
            Un equipo de agentes de IA compara, organiza y optimiza tu viaje mientras tú decides.
          </p>
        </blockquote>
      </div>
    </div>
  );
}

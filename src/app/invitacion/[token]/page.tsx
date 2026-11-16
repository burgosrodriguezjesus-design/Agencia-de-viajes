import type { Metadata } from "next";
import { Suspense } from "react";
import { acceptInvite } from "@/app/actions/sharing";
import { Button, Card, Logo } from "@/components/ui";

export const metadata: Metadata = { title: "Invitación a un viaje", robots: { index: false } };

async function InviteForm({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  return (
    <form action={acceptInvite.bind(null, token)}>
      <Button type="submit" size="lg" variant="accent" className="w-full">
        Unirme al viaje
      </Button>
    </form>
  );
}

export default function InvitePage({ params }: { params: Promise<{ token: string }> }) {
  return (
    <main className="grid min-h-dvh place-items-center px-5">
      <Card className="w-full max-w-md p-8 text-center">
        <div className="flex justify-center">
          <Logo />
        </div>
        <h1 className="mt-6 font-display text-3xl font-medium">Te han invitado a un viaje</h1>
        <p className="mt-2 mb-6 leading-relaxed text-muted">
          Al aceptar podrás ver el itinerario y, si te han dado permiso, editarlo junto al resto del grupo.
        </p>
        <Suspense fallback={<div className="h-12" />}>
          <InviteForm params={params} />
        </Suspense>
      </Card>
    </main>
  );
}

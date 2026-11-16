"use client";

import { Button } from "@/components/ui";

export default function ErrorPage({ reset }: { error: Error & { digest?: string }; reset: () => void }) {
  return (
    <main className="grid min-h-[60dvh] place-items-center px-5 text-center">
      <div>
        <h1 className="font-display text-3xl font-medium">Algo no ha ido bien</h1>
        <p className="mx-auto mt-2 max-w-sm text-muted">Ha ocurrido un error inesperado. Tus datos están a salvo; vuelve a intentarlo.</p>
        <div className="mt-6 flex justify-center">
          <Button onClick={() => reset()}>Reintentar</Button>
        </div>
      </div>
    </main>
  );
}

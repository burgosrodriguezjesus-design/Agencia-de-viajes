import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { LoginForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Entrar" };

async function Form({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  const { next, error } = await searchParams;
  return <LoginForm next={next} linkError={error === "enlace"} />;
}

export default function LoginPage({ searchParams }: { searchParams: Promise<{ next?: string; error?: string }> }) {
  return (
    <>
      <h1 className="font-display text-4xl font-medium tracking-tight">Hola de nuevo</h1>
      <p className="mt-2 mb-8 text-muted">Entra para seguir con tus viajes.</p>
      <Suspense fallback={<div className="h-64" />}>
        <Form searchParams={searchParams} />
      </Suspense>
      <p className="mt-8 text-center text-sm text-muted">
        ¿Aún no tienes cuenta?{" "}
        <Link href="/registro" className="font-medium text-ink underline underline-offset-4">
          Créala gratis
        </Link>
      </p>
    </>
  );
}

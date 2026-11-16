import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { SignUpForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Crear cuenta" };

async function Form({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  const { next } = await searchParams;
  return <SignUpForm next={next} />;
}

export default function SignUpPage({ searchParams }: { searchParams: Promise<{ next?: string }> }) {
  return (
    <>
      <h1 className="font-display text-4xl font-medium tracking-tight">Crea tu cuenta</h1>
      <p className="mt-2 mb-8 text-muted">Gratis y sin tarjeta. Tu primer viaje, en un minuto.</p>
      <Suspense fallback={<div className="h-96" />}>
        <Form searchParams={searchParams} />
      </Suspense>
      <p className="mt-8 text-center text-sm text-muted">
        ¿Ya tienes cuenta?{" "}
        <Link href="/login" className="font-medium text-ink underline underline-offset-4">
          Entra
        </Link>
      </p>
    </>
  );
}

import type { Metadata } from "next";
import Link from "next/link";
import { ResetRequestForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Recuperar contraseña" };

export default function RecoverPage() {
  return (
    <>
      <h1 className="font-display text-4xl font-medium tracking-tight">Recupera tu acceso</h1>
      <p className="mt-2 mb-8 text-muted">Te enviaremos un enlace para elegir una contraseña nueva.</p>
      <ResetRequestForm />
      <p className="mt-8 text-center text-sm text-muted">
        <Link href="/login" className="font-medium text-ink underline underline-offset-4">
          Volver a entrar
        </Link>
      </p>
    </>
  );
}

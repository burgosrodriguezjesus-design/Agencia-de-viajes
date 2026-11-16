import type { Metadata } from "next";
import { NewPasswordForm } from "@/components/auth-forms";

export const metadata: Metadata = { title: "Nueva contraseña" };

export default function NewPasswordPage() {
  return (
    <>
      <h1 className="font-display text-4xl font-medium tracking-tight">Elige una contraseña nueva</h1>
      <p className="mt-2 mb-8 text-muted">Después entrarás directamente en tu cuenta.</p>
      <NewPasswordForm />
    </>
  );
}

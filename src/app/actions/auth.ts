"use server";

import { redirect } from "next/navigation";
import { z } from "zod";
import { SITE_URL } from "@/lib/brand";
import { createClient } from "@/lib/supabase/server";

export interface FormState {
  error?: string;
  message?: string;
}

const credentials = z.object({
  email: z.string().trim().toLowerCase().email("Introduce un correo válido."),
  password: z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(72),
});

/** Solo rutas internas: evita redirecciones abiertas tras iniciar sesión. */
function safeNext(value: FormDataEntryValue | null): string {
  const next = typeof value === "string" ? value : "";
  return next.startsWith("/") && !next.startsWith("//") && !next.includes("\\") ? next : "/app";
}

export async function signIn(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.signInWithPassword(parsed.data);
  if (error) {
    if (error.code === "email_not_confirmed") {
      return { error: "Confirma tu correo antes de entrar: te enviamos un enlace al registrarte." };
    }
    return { error: "Correo o contraseña incorrectos." };
  }
  redirect(safeNext(formData.get("next")));
}

export async function signUp(_prev: FormState, formData: FormData): Promise<FormState> {
  const parsed = credentials.safeParse({ email: formData.get("email"), password: formData.get("password") });
  if (!parsed.success) return { error: parsed.error.issues[0].message };
  if (formData.get("terms") !== "on") {
    return { error: "Debes aceptar los términos y la política de privacidad para crear la cuenta." };
  }
  const next = safeNext(formData.get("next"));
  const fullName = String(formData.get("full_name") ?? "").trim().slice(0, 80);
  const supabase = await createClient();
  const { data, error } = await supabase.auth.signUp({
    ...parsed.data,
    options: {
      emailRedirectTo: `${SITE_URL}/auth/callback?next=${encodeURIComponent(next)}`,
      data: {
        full_name: fullName,
        terms_accepted: "true",
        marketing_consent: formData.get("marketing") === "on" ? "true" : "false",
      },
    },
  });
  if (error) {
    if (error.code === "weak_password") return { error: "Elige una contraseña más segura." };
    if (error.code === "over_email_send_rate_limit") {
      return { error: "Hemos enviado demasiados correos seguidos. Espera unos minutos e inténtalo de nuevo." };
    }
    return { error: "No se pudo crear la cuenta. Inténtalo de nuevo." };
  }
  if (data.session) redirect(next);
  // Con confirmación por correo activa (y también si el correo ya existía:
  // no revelamos qué correos están registrados).
  return { message: "Te hemos enviado un correo para confirmar tu cuenta. Ábrelo y sigue el enlace para empezar." };
}

export async function signOut() {
  const supabase = await createClient();
  await supabase.auth.signOut();
  redirect("/");
}

export async function requestPasswordReset(_prev: FormState, formData: FormData): Promise<FormState> {
  const email = z.string().trim().toLowerCase().email().safeParse(formData.get("email"));
  if (!email.success) return { error: "Introduce un correo válido." };
  const supabase = await createClient();
  await supabase.auth.resetPasswordForEmail(email.data, {
    redirectTo: `${SITE_URL}/auth/callback?next=/nueva-contrasena`,
  });
  return { message: "Si existe una cuenta con ese correo, recibirás un enlace para cambiar la contraseña." };
}

export async function updatePassword(_prev: FormState, formData: FormData): Promise<FormState> {
  const password = z.string().min(8, "La contraseña debe tener al menos 8 caracteres.").max(72).safeParse(formData.get("password"));
  if (!password.success) return { error: password.error.issues[0].message };
  const supabase = await createClient();
  const { error } = await supabase.auth.updateUser({ password: password.data });
  if (error) return { error: "No se pudo cambiar la contraseña. Vuelve a solicitar el enlace." };
  redirect("/app");
}

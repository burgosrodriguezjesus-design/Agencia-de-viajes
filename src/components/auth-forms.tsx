"use client";

import Link from "next/link";
import { useActionState } from "react";
import { requestPasswordReset, signIn, signUp, updatePassword, type FormState } from "@/app/actions/auth";
import { Button, Field, inputClass, Notice } from "./ui";

const initial: FormState = {};

function Feedback({ state }: { state: FormState }) {
  if (state.error) return <Notice tone="danger">{state.error}</Notice>;
  if (state.message) return <Notice tone="save">{state.message}</Notice>;
  return null;
}

export function LoginForm({ next, linkError }: { next?: string; linkError?: boolean }) {
  const [state, action, pending] = useActionState(signIn, initial);
  return (
    <form action={action} className="space-y-4">
      {linkError && !state.error ? (
        <Notice tone="warn">El enlace ha caducado o ya se ha usado. Entra con tu contraseña o solicita uno nuevo.</Notice>
      ) : null}
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Correo electrónico">
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field label="Contraseña">
        <input name="password" type="password" autoComplete="current-password" required minLength={8} className={inputClass} />
      </Field>
      <Feedback state={state} />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Entrando…" : "Entrar"}
      </Button>
      <p className="text-center text-sm text-muted">
        <Link href="/recuperar" className="underline-offset-4 hover:text-ink hover:underline">
          ¿Has olvidado la contraseña?
        </Link>
      </p>
    </form>
  );
}

export function SignUpForm({ next }: { next?: string }) {
  const [state, action, pending] = useActionState(signUp, initial);
  if (state.message) {
    return (
      <div className="space-y-4">
        <Notice tone="save">{state.message}</Notice>
        <p className="text-sm text-muted">¿No lo encuentras? Mira en la carpeta de correo no deseado.</p>
      </div>
    );
  }
  return (
    <form action={action} className="space-y-4">
      <input type="hidden" name="next" value={next ?? ""} />
      <Field label="Nombre" hint="Opcional">
        <input name="full_name" autoComplete="name" maxLength={80} className={inputClass} />
      </Field>
      <Field label="Correo electrónico">
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Field label="Contraseña" hint="Mínimo 8 caracteres">
        <input name="password" type="password" autoComplete="new-password" required minLength={8} className={inputClass} />
      </Field>
      <label className="flex gap-3 text-sm leading-relaxed text-muted">
        <input type="checkbox" name="terms" required className="mt-1 size-4 shrink-0 accent-(--accent)" />
        <span>
          He leído y acepto los{" "}
          <Link href="/legal/terminos" target="_blank" className="text-ink underline underline-offset-4">términos</Link> y la{" "}
          <Link href="/legal/privacidad" target="_blank" className="text-ink underline underline-offset-4">política de privacidad</Link>.
        </span>
      </label>
      <label className="flex gap-3 text-sm leading-relaxed text-muted">
        <input type="checkbox" name="marketing" className="mt-1 size-4 shrink-0 accent-(--accent)" />
        <span>Quiero recibir ideas de viaje y novedades por correo. Opcional; puedes darte de baja cuando quieras.</span>
      </label>
      <Feedback state={state} />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Creando cuenta…" : "Crear cuenta gratis"}
      </Button>
    </form>
  );
}

export function ResetRequestForm() {
  const [state, action, pending] = useActionState(requestPasswordReset, initial);
  return (
    <form action={action} className="space-y-4">
      <Field label="Correo electrónico">
        <input name="email" type="email" autoComplete="email" required className={inputClass} />
      </Field>
      <Feedback state={state} />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Enviando…" : "Enviarme el enlace"}
      </Button>
    </form>
  );
}

export function NewPasswordForm() {
  const [state, action, pending] = useActionState(updatePassword, initial);
  return (
    <form action={action} className="space-y-4">
      <Field label="Nueva contraseña" hint="Mínimo 8 caracteres">
        <input name="password" type="password" autoComplete="new-password" required minLength={8} className={inputClass} />
      </Field>
      <Feedback state={state} />
      <Button type="submit" size="lg" disabled={pending} className="w-full">
        {pending ? "Guardando…" : "Guardar contraseña"}
      </Button>
    </form>
  );
}

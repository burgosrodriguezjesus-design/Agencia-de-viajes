"use client";

import { useActionState, useState, useTransition } from "react";
import { deleteAccount, updateProfile } from "@/app/actions/account";
import { Button, Field, inputClass, Notice } from "./ui";

export function ProfileForm({ fullName, homeCity, marketing }: { fullName: string; homeCity: string; marketing: boolean }) {
  const [message, setMessage] = useState<{ ok: boolean; text: string } | null>(null);
  const [pending, startTransition] = useTransition();
  return (
    <form
      action={(formData) =>
        startTransition(async () => {
          const r = await updateProfile(formData);
          setMessage(r.ok ? { ok: true, text: "Perfil guardado." } : { ok: false, text: r.error ?? "No se pudo guardar." });
        })
      }
      className="space-y-4"
    >
      <div className="grid gap-4 sm:grid-cols-2">
        <Field label="Nombre">
          <input name="full_name" defaultValue={fullName} maxLength={80} autoComplete="name" className={inputClass} />
        </Field>
        <Field label="Ciudad habitual de salida" hint="Opcional">
          <input name="home_city" defaultValue={homeCity} maxLength={80} className={inputClass} />
        </Field>
      </div>
      <label className="flex gap-3 text-sm leading-relaxed text-muted">
        <input type="checkbox" name="marketing" defaultChecked={marketing} className="mt-1 size-4 shrink-0 accent-(--accent)" />
        <span>Quiero recibir ideas de viaje y novedades por correo.</span>
      </label>
      {message ? <Notice tone={message.ok ? "save" : "danger"}>{message.text}</Notice> : null}
      <Button type="submit" disabled={pending}>
        {pending ? "Guardando…" : "Guardar perfil"}
      </Button>
    </form>
  );
}

export function DeleteAccountForm() {
  const [state, action, pending] = useActionState(deleteAccount, {});
  const [open, setOpen] = useState(false);
  if (!open) {
    return (
      <Button variant="secondary" onClick={() => setOpen(true)}>
        Eliminar mi cuenta y mis datos
      </Button>
    );
  }
  return (
    <form action={action} className="space-y-3">
      <p className="text-sm leading-relaxed text-muted">
        Se eliminarán de forma definitiva tu cuenta, tus viajes, conversaciones y documentos. Escribe <strong className="text-ink">ELIMINAR</strong> para confirmar.
      </p>
      <input name="confirm" autoComplete="off" aria-label="Escribe ELIMINAR para confirmar" className={`${inputClass} max-w-xs`} />
      {state.error ? <Notice tone="danger">{state.error}</Notice> : null}
      <div className="flex gap-2">
        <Button type="submit" variant="danger" disabled={pending}>
          {pending ? "Eliminando…" : "Eliminar definitivamente"}
        </Button>
        <Button type="button" variant="ghost" onClick={() => setOpen(false)}>
          Cancelar
        </Button>
      </div>
    </form>
  );
}

"use client";

import { Check, Copy, Link2, Trash2, UserPlus } from "lucide-react";
import { useState, useTransition } from "react";
import { createInvite, removeMember, revokeInvite } from "@/app/actions/sharing";
import { deleteTrip } from "@/app/actions/trips";
import type { TripInvite } from "@/lib/domain/types";
import { Badge, Button, Card, Notice } from "./ui";

function CopyField({ url }: { url: string }) {
  const [copied, setCopied] = useState(false);
  return (
    <div className="flex items-center gap-2">
      <input readOnly value={url} aria-label="Enlace" onFocus={(e) => e.currentTarget.select()} className="h-10 min-w-0 flex-1 rounded-xl border border-line bg-surface-2 px-3 text-sm text-muted" />
      <Button
        variant="secondary"
        size="sm"
        className="h-10"
        onClick={async () => {
          try {
            await navigator.clipboard.writeText(url);
            setCopied(true);
            setTimeout(() => setCopied(false), 1800);
          } catch {
            // sin permiso de portapapeles: el campo queda seleccionable
          }
        }}
      >
        {copied ? <Check className="size-4" aria-hidden /> : <Copy className="size-4" aria-hidden />}
        {copied ? "Copiado" : "Copiar"}
      </Button>
    </div>
  );
}

export function SharePanel({
  tripId,
  siteUrl,
  invites,
  members,
  isOwner,
  tripTitle,
}: {
  tripId: string;
  siteUrl: string;
  invites: TripInvite[];
  members: { user_id: string; role: "viewer" | "editor" }[];
  isOwner: boolean;
  tripTitle: string;
}) {
  const [error, setError] = useState<string | null>(null);
  const [confirmDelete, setConfirmDelete] = useState(false);
  const [pending, startTransition] = useTransition();
  const run = (fn: () => Promise<{ ok: boolean; error?: string }>) =>
    startTransition(async () => {
      setError(null);
      const r = await fn();
      if (!r.ok) setError(r.error ?? "No se pudo completar la acción.");
    });

  const active = invites.filter((i) => !i.revoked_at && (!i.expires_at || new Date(i.expires_at) > new Date()));
  const publicLinks = active.filter((i) => i.kind === "public_link");
  const memberInvites = active.filter((i) => i.kind === "member_invite");

  if (!isOwner) {
    return <Notice>Solo quien creó el viaje puede gestionar con quién se comparte.</Notice>;
  }

  return (
    <div className="space-y-6">
      {error ? <Notice tone="danger">{error}</Notice> : null}

      <Card className="p-6">
        <h3 className="flex items-center gap-2 font-display text-xl font-medium">
          <Link2 className="size-5 text-accent" aria-hidden /> Enlace de solo lectura
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Cualquiera con el enlace ve el itinerario, sin cuenta. No se muestran documentos, conversaciones ni tu presupuesto.
        </p>
        <div className="mt-4 space-y-3">
          {publicLinks.map((invite) => (
            <div key={invite.id} className="flex items-center gap-2">
              <div className="min-w-0 flex-1">
                <CopyField url={`${siteUrl}/compartido/${invite.token}`} />
              </div>
              <Button variant="danger" size="sm" className="h-10" disabled={pending} onClick={() => run(() => revokeInvite(tripId, invite.id))}>
                Desactivar
              </Button>
            </div>
          ))}
          {publicLinks.length === 0 ? (
            <Button variant="secondary" disabled={pending} onClick={() => run(() => createInvite(tripId, "public_link", "viewer"))}>
              Crear enlace público
            </Button>
          ) : null}
        </div>
      </Card>

      <Card className="p-6">
        <h3 className="flex items-center gap-2 font-display text-xl font-medium">
          <UserPlus className="size-5 text-accent" aria-hidden /> Invitar a colaborar
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Envía el enlace a tus compañeros de viaje. Al abrirlo con su cuenta, se unen al viaje. Caduca a los 14 días.
        </p>
        <div className="mt-4 space-y-3">
          {memberInvites.map((invite) => (
            <div key={invite.id} className="flex flex-wrap items-center gap-2">
              <Badge tone="accent">{invite.role === "editor" ? "Puede editar" : "Solo lectura"}</Badge>
              <div className="min-w-0 flex-1 basis-64">
                <CopyField url={`${siteUrl}/invitacion/${invite.token}`} />
              </div>
              <Button variant="danger" size="sm" className="h-10" disabled={pending} onClick={() => run(() => revokeInvite(tripId, invite.id))}>
                Desactivar
              </Button>
            </div>
          ))}
          <div className="flex flex-wrap gap-2">
            <Button variant="secondary" disabled={pending} onClick={() => run(() => createInvite(tripId, "member_invite", "editor"))}>
              Invitación para editar
            </Button>
            <Button variant="ghost" disabled={pending} onClick={() => run(() => createInvite(tripId, "member_invite", "viewer"))}>
              Invitación de solo lectura
            </Button>
          </div>
        </div>
        {members.length > 0 ? (
          <div className="mt-6 border-t border-line pt-4">
            <h4 className="text-sm font-medium">Personas con acceso</h4>
            <ul className="mt-2 divide-y divide-line">
              {members.map((m, i) => (
                <li key={m.user_id} className="flex items-center justify-between gap-3 py-2.5 text-sm">
                  <span>
                    Colaborador {i + 1} <Badge className="ml-2">{m.role === "editor" ? "Puede editar" : "Solo lectura"}</Badge>
                  </span>
                  <Button variant="ghost" size="sm" disabled={pending} onClick={() => run(() => removeMember(tripId, m.user_id))}>
                    Quitar acceso
                  </Button>
                </li>
              ))}
            </ul>
          </div>
        ) : null}
      </Card>

      <Card className="border-danger/30 p-6">
        <h3 className="flex items-center gap-2 font-display text-xl font-medium">
          <Trash2 className="size-5 text-danger" aria-hidden /> Eliminar este viaje
        </h3>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          Se borran el itinerario, las opciones, las conversaciones y los documentos de «{tripTitle}». No se puede deshacer.
        </p>
        <div className="mt-4 flex flex-wrap items-center gap-2">
          {confirmDelete ? (
            <>
              <Button variant="danger" disabled={pending} onClick={() => run(() => deleteTrip(tripId))}>
                Sí, eliminar definitivamente
              </Button>
              <Button variant="ghost" onClick={() => setConfirmDelete(false)}>
                Cancelar
              </Button>
            </>
          ) : (
            <Button variant="secondary" onClick={() => setConfirmDelete(true)}>
              Eliminar viaje
            </Button>
          )}
        </div>
      </Card>
    </div>
  );
}

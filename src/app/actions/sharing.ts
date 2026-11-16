"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { getTrip, requireUser } from "@/lib/data";
import type { ActionResult } from "./trips";

const DOC_BUCKET = "trip-documents";
const ALLOWED_MIME = ["application/pdf", "image/png", "image/jpeg", "image/webp"];
const MAX_BYTES = 10 * 1024 * 1024;

async function ownerOnly(tripId: string) {
  const { user, supabase } = await requireUser();
  const found = await getTrip(supabase, tripId, user.id);
  if (!found || found.role !== "owner") return null;
  return { supabase, user };
}

// ── Compartir ───────────────────────────────────────────────────────────

export async function createInvite(
  tripId: string,
  kind: "public_link" | "member_invite",
  role: "viewer" | "editor",
): Promise<ActionResult> {
  const ctx = await ownerOnly(tripId);
  if (!ctx) return { ok: false, error: "Solo quien creó el viaje puede compartirlo." };
  const { error } = await ctx.supabase.from("trip_invites").insert({
    trip_id: tripId,
    kind,
    role: kind === "public_link" ? "viewer" : role,
    // Las invitaciones de colaborador caducan a los 14 días.
    expires_at: kind === "member_invite" ? new Date(Date.now() + 14 * 86_400_000).toISOString() : null,
  });
  if (error) return { ok: false, error: "No se pudo crear el enlace." };
  refresh();
  return { ok: true };
}

export async function revokeInvite(tripId: string, inviteId: string): Promise<ActionResult> {
  const ctx = await ownerOnly(tripId);
  if (!ctx) return { ok: false, error: "Sin permiso." };
  const { error } = await ctx.supabase
    .from("trip_invites")
    .update({ revoked_at: new Date().toISOString() })
    .eq("id", inviteId)
    .eq("trip_id", tripId);
  if (error) return { ok: false, error: "No se pudo desactivar el enlace." };
  refresh();
  return { ok: true };
}

export async function removeMember(tripId: string, userId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  // RLS: solo el propietario o el propio miembro pueden borrar la fila.
  const { error } = await supabase.from("trip_members").delete().eq("trip_id", tripId).eq("user_id", userId);
  if (error) return { ok: false, error: "No se pudo quitar el acceso." };
  refresh();
  return { ok: true };
}

export async function acceptInvite(token: string) {
  const { supabase } = await requireUser();
  const { data, error } = await supabase.rpc("accept_trip_invite", { p_token: token });
  if (error || !data) redirect("/app?aviso=invitacion-no-valida");
  redirect(`/app/viajes/${data}`);
}

// ── Documentos ──────────────────────────────────────────────────────────

export async function uploadDocument(tripId: string, formData: FormData): Promise<ActionResult> {
  const { user, supabase } = await requireUser();
  const found = await getTrip(supabase, tripId, user.id);
  if (!found || found.role === "viewer") return { ok: false, error: "No tienes permiso para subir documentos." };

  const file = formData.get("file");
  if (!(file instanceof File) || file.size === 0) return { ok: false, error: "Selecciona un archivo." };
  if (file.size > MAX_BYTES) return { ok: false, error: "El archivo supera los 10 MB." };
  if (!ALLOWED_MIME.includes(file.type)) return { ok: false, error: "Formato no admitido. Usa PDF, JPG, PNG o WebP." };

  const category = String(formData.get("category") ?? "otro");
  const ext = file.name.includes(".") ? file.name.split(".").pop()!.toLowerCase().replace(/[^a-z0-9]/g, "") : "bin";
  const path = `${tripId}/${crypto.randomUUID()}.${ext}`;

  const { error: uploadError } = await supabase.storage.from(DOC_BUCKET).upload(path, file, {
    contentType: file.type,
    upsert: false,
  });
  if (uploadError) return { ok: false, error: "No se pudo subir el archivo." };

  const { error } = await supabase.from("documents").insert({
    trip_id: tripId,
    name: file.name.slice(0, 160),
    category: ["billete", "reserva", "seguro", "identidad", "otro"].includes(category) ? category : "otro",
    storage_path: path,
    mime_type: file.type,
    size_bytes: file.size,
  });
  if (error) {
    await supabase.storage.from(DOC_BUCKET).remove([path]);
    return { ok: false, error: "No se pudo registrar el documento." };
  }
  refresh();
  return { ok: true };
}

export async function deleteDocument(tripId: string, documentId: string): Promise<ActionResult> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("trip_id", tripId)
    .maybeSingle();
  if (!data) return { ok: false, error: "El documento no existe." };
  const { error: storageError } = await supabase.storage.from(DOC_BUCKET).remove([data.storage_path as string]);
  if (storageError) return { ok: false, error: "No se pudo eliminar el archivo." };
  const { error } = await supabase.from("documents").delete().eq("id", documentId).eq("trip_id", tripId);
  if (error) return { ok: false, error: "No se pudo eliminar." };
  refresh();
  return { ok: true };
}

/** Enlace temporal (5 min) para abrir un documento privado. */
export async function getDocumentUrl(tripId: string, documentId: string): Promise<{ url?: string; error?: string }> {
  const { supabase } = await requireUser();
  const { data } = await supabase
    .from("documents")
    .select("storage_path")
    .eq("id", documentId)
    .eq("trip_id", tripId)
    .maybeSingle();
  if (!data) return { error: "El documento no existe." };
  const { data: signed, error } = await supabase.storage
    .from(DOC_BUCKET)
    .createSignedUrl(data.storage_path as string, 300);
  if (error || !signed) return { error: "No se pudo abrir el documento." };
  return { url: signed.signedUrl };
}

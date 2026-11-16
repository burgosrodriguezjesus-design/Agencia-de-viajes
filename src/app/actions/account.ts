"use server";

import { refresh } from "next/cache";
import { redirect } from "next/navigation";
import { requireUser } from "@/lib/data";
import { createAdminClient } from "@/lib/supabase/server";
import type { ActionResult } from "./trips";

export async function updateProfile(formData: FormData): Promise<ActionResult> {
  const { user, supabase } = await requireUser();
  const { error } = await supabase
    .from("profiles")
    .update({
      full_name: String(formData.get("full_name") ?? "").trim().slice(0, 80) || null,
      home_city: String(formData.get("home_city") ?? "").trim().slice(0, 80) || null,
      marketing_consent: formData.get("marketing") === "on",
    })
    .eq("id", user.id);
  if (error) return { ok: false, error: "No se pudo guardar el perfil." };
  refresh();
  return { ok: true };
}

/**
 * Derecho de supresión (RGPD): elimina documentos, viajes y la cuenta.
 * Exige escribir ELIMINAR para evitar borrados accidentales.
 */
export async function deleteAccount(_prev: { error?: string }, formData: FormData): Promise<{ error?: string }> {
  if (String(formData.get("confirm") ?? "").trim() !== "ELIMINAR") {
    return { error: "Escribe ELIMINAR para confirmar." };
  }
  const { user, supabase } = await requireUser();

  const { data: subscription } = await supabase
    .from("subscriptions")
    .select("id")
    .eq("user_id", user.id)
    .in("status", ["active", "trialing", "past_due"])
    .maybeSingle();
  if (subscription) {
    return { error: "Tienes una suscripción activa. Cancélala primero desde «Gestionar suscripción»." };
  }

  // Antes de tocar nada se comprueba que la cuenta se puede eliminar: con la
  // función `delete_my_account` de la base de datos o, si no está instalada,
  // con la API de administración (SUPABASE_SECRET_KEY). La sonda llama a la
  // función con un argumento que no admite: no ejecuta nada, y PostgREST solo
  // sugiere su nombre cuando existe.
  const probe = await supabase.rpc("delete_my_account", { sonda: true });
  const hasRpc = probe.error?.code === "PGRST202" && (probe.error.hint ?? "").includes("delete_my_account");
  const admin = hasRpc ? null : createAdminClient();
  if (!hasRpc && !admin) {
    return {
      error:
        "La eliminación automática aún no está activada en esta instalación. Escríbenos y eliminaremos tu cuenta y tus datos en un máximo de 30 días.",
    };
  }

  // Los archivos se borran con la API de Storage (no se pueden borrar por SQL).
  const { data: trips } = await supabase.from("trips").select("id").eq("owner_id", user.id);
  const tripIds = (trips ?? []).map((t) => t.id as string);
  if (tripIds.length > 0) {
    const { data: docs } = await supabase.from("documents").select("storage_path").in("trip_id", tripIds);
    if (docs && docs.length > 0) {
      await supabase.storage.from("trip-documents").remove(docs.map((d) => d.storage_path as string));
    }
  }

  const { error } = hasRpc ? await supabase.rpc("delete_my_account") : await admin!.auth.admin.deleteUser(user.id);
  if (error) return { error: "No se pudo eliminar la cuenta. Escríbenos y lo haremos manualmente." };
  await supabase.auth.signOut();
  redirect("/?cuenta=eliminada");
}

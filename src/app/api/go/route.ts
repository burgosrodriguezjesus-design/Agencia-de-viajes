import { NextResponse } from "next/server";
import { getSessionUser } from "@/lib/data";
import { isAllowedLink } from "@/lib/providers/links";
import { createClient } from "@/lib/supabase/server";

/**
 * Salida hacia un proveedor externo. Registra el clic (proveedor y si es de
 * afiliado; nunca la URL completa) y redirige. Solo a hosts permitidos.
 */
export async function GET(request: Request) {
  const params = new URL(request.url).searchParams;
  const target = params.get("u") ?? "";
  if (!isAllowedLink(target)) {
    return Response.json({ error: "Destino no permitido." }, { status: 400 });
  }
  const tripId = params.get("t");
  try {
    const supabase = await createClient();
    const user = await getSessionUser(supabase);
    if (user) {
      await supabase.from("affiliate_clicks").insert({
        user_id: user.id,
        trip_id: tripId && /^[0-9a-f-]{36}$/i.test(tripId) ? tripId : null,
        provider: (params.get("p") ?? "desconocido").slice(0, 40),
        target_host: new URL(target).hostname,
        is_affiliate: params.get("a") === "1",
      });
    }
  } catch {
    // El registro nunca debe impedir la navegación.
  }
  return NextResponse.redirect(target, { status: 302, headers: { "Referrer-Policy": "no-referrer" } });
}

import "server-only";
import { createServerClient } from "@supabase/ssr";
import { createClient as createSupabaseClient } from "@supabase/supabase-js";
import { cookies } from "next/headers";
import { connection } from "next/server";

/**
 * Cliente de Supabase ligado a la sesión del usuario (cookies). Todas las
 * consultas pasan por RLS: ni las páginas ni los agentes pueden leer o
 * escribir nada que el usuario no pueda.
 */
export async function createClient() {
  const cookieStore = await cookies();
  // La sesión depende del instante de la petición (caducidad del token):
  // se renderiza siempre en el momento, nunca en un prerender.
  await connection();
  return createServerClient(
    process.env.NEXT_PUBLIC_SUPABASE_URL!,
    process.env.NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY!,
    {
      cookies: {
        getAll() {
          return cookieStore.getAll();
        },
        setAll(cookiesToSet) {
          try {
            cookiesToSet.forEach(({ name, value, options }) => cookieStore.set(name, value, options));
          } catch {
            // Llamado desde un Server Component: el proxy refresca la sesión.
          }
        },
      },
    },
  );
}

/**
 * Cliente con la clave secreta (salta RLS). Uso exclusivo: webhook de Stripe.
 * Devuelve null si la clave no está configurada.
 */
export function createAdminClient() {
  const secret = process.env.SUPABASE_SECRET_KEY || process.env.SUPABASE_SERVICE_ROLE_KEY;
  if (!secret) return null;
  return createSupabaseClient(process.env.NEXT_PUBLIC_SUPABASE_URL!, secret, {
    auth: { persistSession: false, autoRefreshToken: false },
  });
}

export type ServerSupabase = Awaited<ReturnType<typeof createClient>>;

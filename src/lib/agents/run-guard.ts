import "server-only";
import { getAgentUsage, getPlan, getSessionUser, getTrip } from "../data";
import type { Plan, Trip } from "../domain/types";
import { createClient, type ServerSupabase } from "../supabase/server";
import type { AgentContext, AgentEvent } from "./runtime";

// Puerta de entrada común a las rutas de agentes: sesión, permiso sobre el
// viaje, límite mensual del plan y registro de uso.

export type GuardResult =
  | { ok: false; status: number; error: string }
  | { ok: true; supabase: ServerSupabase; userId: string; trip: Trip; plan: Plan; runId: string | null };

export async function guardAgentRun(tripId: string, kind: "chat" | "generation"): Promise<GuardResult> {
  const supabase = await createClient();
  const user = await getSessionUser(supabase);
  if (!user) return { ok: false, status: 401, error: "Inicia sesión para continuar." };

  const found = await getTrip(supabase, tripId, user.id);
  if (!found) return { ok: false, status: 404, error: "El viaje no existe." };
  if (found.role === "viewer") return { ok: false, status: 403, error: "Solo tienes permiso de lectura en este viaje." };

  const plan = await getPlan(supabase, user.id);
  const usage = await getAgentUsage(supabase, user.id, plan);
  if (usage.remaining <= 0) {
    return {
      ok: false,
      status: 429,
      error:
        plan === "free"
          ? `Has usado las ${usage.limit} consultas de IA de este mes del plan gratuito. Con Premium tienes ${600} al mes.`
          : `Has alcanzado el límite de uso razonable de este mes (${usage.limit} consultas).`,
    };
  }

  const { data: run } = await supabase
    .from("agent_runs")
    .insert({ user_id: user.id, trip_id: tripId, agent: kind === "chat" ? "asistente" : "pipeline", kind })
    .select("id")
    .single();

  return { ok: true, supabase, userId: user.id, trip: found.trip, plan, runId: (run?.id as string | undefined) ?? null };
}

export function buildContext(
  guard: Extract<GuardResult, { ok: true }>,
  emit: (event: AgentEvent) => void,
): AgentContext {
  return {
    supabase: guard.supabase,
    userId: guard.userId,
    tripId: guard.trip.id,
    plan: guard.plan,
    emit,
    usage: { input: 0, output: 0 },
  };
}

export async function finishRun(
  guard: Extract<GuardResult, { ok: true }>,
  ctx: AgentContext,
  status: "completed" | "failed",
  error?: string,
) {
  if (!guard.runId) return;
  await guard.supabase
    .from("agent_runs")
    .update({
      status,
      input_tokens: ctx.usage.input,
      output_tokens: ctx.usage.output,
      error: error?.slice(0, 500) ?? null,
      finished_at: new Date().toISOString(),
    })
    .eq("id", guard.runId);
}

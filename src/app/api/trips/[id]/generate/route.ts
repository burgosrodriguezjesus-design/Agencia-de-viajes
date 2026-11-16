import { generateTripPlan } from "@/lib/agents/pipeline";
import { buildContext, finishRun, guardAgentRun } from "@/lib/agents/run-guard";
import { describeAgentError } from "@/lib/agents/runtime";
import { sseResponse } from "@/lib/agents/sse";
import { isAiConfigured } from "@/lib/providers/status";

export const maxDuration = 300;

/** Genera el plan inicial del viaje. Solo si el viaje aún no tiene itinerario. */
export async function POST(_request: Request, { params }: { params: Promise<{ id: string }> }) {
  const { id } = await params;
  const guard = await guardAgentRun(id, "generation", { metered: isAiConfigured() });
  if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });

  const { count } = await guard.supabase
    .from("itinerary_items")
    .select("id", { count: "exact", head: true })
    .eq("trip_id", id);
  if ((count ?? 0) > 0) {
    return Response.json({ error: "Este viaje ya tiene un itinerario. Usa el asistente para modificarlo." }, { status: 409 });
  }

  return sseResponse(async (emit) => {
    const ctx = buildContext(guard, emit);
    try {
      const result = await generateTripPlan(ctx);
      result.warnings.forEach((message) => emit({ type: "error", message }));
      await finishRun(guard, ctx, "completed");
    } catch (err) {
      const text = describeAgentError(err);
      emit({ type: "error", message: text });
      await guard.supabase.from("trips").update({ status: "draft" }).eq("id", id);
      await finishRun(guard, ctx, "failed", text);
    }
  });
}

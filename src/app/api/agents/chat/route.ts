import { z } from "zod";
import { runAssistant } from "@/lib/agents/orchestrator";
import { buildContext, finishRun, guardAgentRun } from "@/lib/agents/run-guard";
import { describeAgentError } from "@/lib/agents/runtime";
import { sseResponse } from "@/lib/agents/sse";
import type { ChatMessage } from "@/lib/domain/types";
import { isAiConfigured } from "@/lib/providers/status";

export const maxDuration = 300;

const body = z.object({
  tripId: z.string().uuid(),
  message: z.string().trim().min(1).max(2000),
});

export async function POST(request: Request) {
  const parsed = body.safeParse(await request.json().catch(() => null));
  if (!parsed.success) return Response.json({ error: "Mensaje no válido." }, { status: 400 });
  if (!isAiConfigured()) {
    return Response.json(
      { error: "El asistente de IA todavía no está activado en esta instalación (falta la clave de la API)." },
      { status: 503 },
    );
  }
  const { tripId, message } = parsed.data;
  const guard = await guardAgentRun(tripId, "chat");
  if (!guard.ok) return Response.json({ error: guard.error }, { status: guard.status });

  const { data: history } = await guard.supabase
    .from("chat_messages")
    .select("role, content")
    .eq("trip_id", tripId)
    .order("created_at", { ascending: false })
    .limit(16);

  await guard.supabase.from("chat_messages").insert({ trip_id: tripId, role: "user", content: message });

  return sseResponse(async (emit) => {
    const ctx = buildContext(guard, emit);
    try {
      const reply = await runAssistant(
        ((history ?? []) as Pick<ChatMessage, "role" | "content">[]).reverse(),
        message,
        ctx,
      );
      await guard.supabase.from("chat_messages").insert({ trip_id: tripId, role: "assistant", content: reply });
      await finishRun(guard, ctx, "completed");
    } catch (err) {
      const text = describeAgentError(err);
      emit({ type: "error", message: text });
      await finishRun(guard, ctx, "failed", text);
    }
  });
}

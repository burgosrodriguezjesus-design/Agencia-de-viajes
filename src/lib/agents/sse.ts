import "server-only";
import type { AgentEvent } from "./runtime";

/**
 * Convierte la ejecución de un agente en una respuesta Server-Sent Events.
 * El trabajo continúa aunque el cliente se desconecte, para no dejar el viaje
 * a medio generar.
 */
export function sseResponse(run: (emit: (event: AgentEvent) => void) => Promise<void>): Response {
  const encoder = new TextEncoder();
  let closed = false;
  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      const emit = (event: AgentEvent) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(`data: ${JSON.stringify(event)}\n\n`));
        } catch {
          closed = true;
        }
      };
      // Latido: evita que proxies intermedios corten conexiones largas.
      const heartbeat = setInterval(() => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(": ping\n\n"));
        } catch {
          closed = true;
        }
      }, 15_000);
      try {
        await run(emit);
      } catch (err) {
        emit({ type: "error", message: err instanceof Error ? err.message : "Error inesperado" });
      } finally {
        clearInterval(heartbeat);
        emit({ type: "done" });
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // ya cerrado
          }
        }
      }
    },
    cancel() {
      closed = true;
    },
  });
  return new Response(stream, {
    headers: {
      "Content-Type": "text/event-stream; charset=utf-8",
      "Cache-Control": "no-cache, no-transform",
      Connection: "keep-alive",
      "X-Accel-Buffering": "no",
    },
  });
}

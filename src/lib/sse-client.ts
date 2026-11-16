// Lector de Server-Sent Events sobre fetch (POST), para el chat y la
// generación del viaje. Tipos espejo de AgentEvent (lib/agents/runtime.ts).

export type StreamEvent =
  | { type: "text"; delta: string }
  | { type: "agent"; agent: string; status: "start" | "done" | "error"; detail?: string }
  | { type: "tool"; agent: string; label: string }
  | { type: "trip_updated" }
  | { type: "error"; message: string }
  | { type: "done" };

export async function streamEvents(
  url: string,
  body: unknown,
  onEvent: (event: StreamEvent) => void,
  signal?: AbortSignal,
): Promise<void> {
  const res = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json" },
    body: body === undefined ? undefined : JSON.stringify(body),
    signal,
  });
  if (!res.ok || !res.body) {
    let message = "No se pudo completar la petición.";
    try {
      const data = (await res.json()) as { error?: string };
      if (data.error) message = data.error;
    } catch {
      // respuesta sin JSON
    }
    throw new Error(message);
  }
  const reader = res.body.getReader();
  const decoder = new TextDecoder();
  let buffer = "";
  for (;;) {
    const { value, done } = await reader.read();
    if (done) break;
    buffer += decoder.decode(value, { stream: true });
    let boundary = buffer.indexOf("\n\n");
    while (boundary !== -1) {
      const chunk = buffer.slice(0, boundary);
      buffer = buffer.slice(boundary + 2);
      for (const line of chunk.split("\n")) {
        if (!line.startsWith("data: ")) continue;
        try {
          onEvent(JSON.parse(line.slice(6)) as StreamEvent);
        } catch {
          // línea incompleta o no JSON: se ignora
        }
      }
      boundary = buffer.indexOf("\n\n");
    }
  }
}

export const AGENT_LABEL: Record<string, string> = {
  asistente: "Asistente personal",
  vuelos: "Experto en vuelos",
  hoteles: "Experto en hoteles",
  itinerario: "Arquitecto de itinerarios",
  experiencias: "Experto en experiencias",
  presupuesto: "Optimizador de presupuesto",
};

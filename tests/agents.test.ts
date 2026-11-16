import { beforeEach, describe, expect, it, vi } from "vitest";
import { z } from "zod";

// Cliente de Anthropic simulado: cada llamada a stream() devuelve el siguiente
// mensaje de la cola. Permite probar el bucle de herramientas sin red.
const queue: unknown[] = [];
const requests: Record<string, unknown>[] = [];

vi.mock("@anthropic-ai/sdk", () => {
  class APIError extends Error {
    status?: number;
  }
  class Anthropic {
    static APIError = APIError;
    static AuthenticationError = class extends APIError {};
    static RateLimitError = class extends APIError {};
    static APIConnectionError = class extends APIError {};
    beta = {
      messages: {
        stream: (params: Record<string, unknown>) => {
          requests.push(structuredClone(params));
          const message = queue.shift();
          return {
            on: (_event: string, cb: (delta: string) => void) => {
              const text = (message as { content: { type: string; text?: string }[] }).content.find((b) => b.type === "text")?.text;
              if (text) cb(text);
            },
            finalMessage: async () => message,
          };
        },
      },
    };
  }
  return { default: Anthropic };
});

const usage = { input_tokens: 10, output_tokens: 5 };

beforeEach(() => {
  queue.length = 0;
  requests.length = 0;
});

describe("definición de los agentes", () => {
  it("los seis agentes existen y sus herramientas generan esquemas válidos", async () => {
    const { SPECIALISTS, ASSISTANT_DIRECT_TOOLS } = await import("../src/lib/agents/definitions");
    expect(Object.keys(SPECIALISTS).sort()).toEqual(["experiencias", "hoteles", "itinerario", "presupuesto", "vuelos"]);
    const sets = [...Object.values(SPECIALISTS).map((a) => a.tools), ASSISTANT_DIRECT_TOOLS];
    for (const tools of sets) {
      const names = tools.map((t) => t.name);
      expect(new Set(names).size).toBe(names.length);
      for (const tool of tools) {
        const schema = z.toJSONSchema(tool.schema, { target: "draft-7" }) as { type?: string };
        expect(schema.type).toBe("object");
        expect(tool.description.length).toBeGreaterThan(30);
      }
    }
  });

  it("ninguna herramienta permite al modelo marcar un precio como verificado ni aportar URLs de reserva", async () => {
    const { SPECIALISTS, ASSISTANT_DIRECT_TOOLS } = await import("../src/lib/agents/definitions");
    const all = [...Object.values(SPECIALISTS).flatMap((a) => a.tools), ...ASSISTANT_DIRECT_TOOLS];
    for (const tool of all) {
      const schema = JSON.stringify(z.toJSONSchema(tool.schema, { target: "draft-7" }));
      // "verified" y "user" solo los escribe el código del proveedor o el usuario.
      expect(schema).not.toMatch(/"enum":\[[^\]]*"verified"/);
      expect(schema).not.toMatch(/"enum":\[[^\]]*"user"/);
      expect(schema).not.toMatch(/booking_url|url_reserva/);
    }
  });

  it("no existe ninguna herramienta de compra o reserva", async () => {
    const { SPECIALISTS, ASSISTANT_DIRECT_TOOLS } = await import("../src/lib/agents/definitions");
    const names = [...Object.values(SPECIALISTS).flatMap((a) => a.tools), ...ASSISTANT_DIRECT_TOOLS].map((t) => t.name);
    expect(names.filter((n) => /reservar|comprar|pagar|book|purchase/.test(n))).toEqual([]);
  });
});

describe("bucle de agente", () => {
  const makeCtx = () => {
    const events: { type: string }[] = [];
    return {
      events,
      ctx: {
        supabase: {} as never,
        userId: "u",
        tripId: "t",
        plan: "free" as const,
        emit: (e: { type: string }) => events.push(e),
        usage: { input: 0, output: 0 },
      },
    };
  };

  it("ejecuta herramientas en paralelo, devuelve todos los resultados juntos y termina con el texto final", async () => {
    const { runAgent, defineTool } = await import("../src/lib/agents/runtime");
    const calls: string[] = [];
    const eco = defineTool({
      name: "eco",
      label: "Probando",
      description: "Devuelve el texto recibido, para pruebas del bucle de herramientas.",
      schema: z.object({ texto: z.string() }),
      mutates: true,
      run: async (input) => {
        calls.push(input.texto);
        return { eco: input.texto };
      },
    });
    queue.push(
      {
        stop_reason: "tool_use",
        usage,
        content: [
          { type: "thinking", thinking: "", signature: "s" },
          { type: "tool_use", id: "a", name: "eco", input: { texto: "uno" } },
          { type: "tool_use", id: "b", name: "eco", input: { texto: 2 } }, // entrada inválida
          { type: "tool_use", id: "c", name: "no_existe", input: {} },
        ],
      },
      { stop_reason: "end_turn", usage, content: [{ type: "text", text: "Listo." }] },
    );
    const { ctx, events } = makeCtx();
    const streamed: string[] = [];
    const text = await runAgent({
      agent: { id: "asistente", name: "x", system: "s", tools: [eco], effort: "low", maxTurns: 5 },
      ctx: ctx as never,
      messages: [{ role: "user", content: "hola" }],
      onText: (d) => streamed.push(d),
    });

    expect(text).toBe("Listo.");
    expect(streamed).toEqual(["Listo."]);
    expect(calls).toEqual(["uno"]); // la entrada inválida no se ejecuta
    expect(ctx.usage).toEqual({ input: 20, output: 10 });
    expect(events.filter((e) => e.type === "trip_updated")).toHaveLength(1);

    // Segunda petición: el turno del asistente se reenvía íntegro (con su bloque
    // de pensamiento) y los tres resultados van en UN solo mensaje de usuario.
    const second = requests[1].messages as { role: string; content: { type: string; tool_use_id?: string; is_error?: boolean }[] }[];
    expect(second).toHaveLength(3);
    expect(second[1].content[0].type).toBe("thinking");
    const results = second[2].content;
    expect(results.map((r) => r.tool_use_id)).toEqual(["a", "b", "c"]);
    expect(results.map((r) => Boolean(r.is_error))).toEqual([false, true, true]);
  });

  it("no ejecuta herramientas si la respuesta se cortó por max_tokens ni si el modelo declina", async () => {
    const { runAgent, defineTool } = await import("../src/lib/agents/runtime");
    let ran = false;
    const tool = defineTool({
      name: "accion",
      label: "x",
      description: "Herramienta de prueba que no debería ejecutarse en estos casos.",
      schema: z.object({}),
      run: async () => {
        ran = true;
        return "ok";
      },
    });
    const agent = { id: "asistente" as const, name: "x", system: "s", tools: [tool], effort: "low" as const, maxTurns: 3 };

    queue.push({ stop_reason: "max_tokens", usage, content: [{ type: "tool_use", id: "a", name: "accion", input: {} }] });
    await expect(runAgent({ agent, ctx: makeCtx().ctx as never, messages: [{ role: "user", content: "x" }] })).rejects.toThrow(/cortó/);

    queue.push({ stop_reason: "refusal", usage, content: [{ type: "tool_use", id: "a", name: "accion", input: {} }] });
    const text = await runAgent({ agent, ctx: makeCtx().ctx as never, messages: [{ role: "user", content: "x" }] });
    expect(text).toMatch(/No puedo ayudar/);
    expect(ran).toBe(false);
  });

  it("se detiene al alcanzar el máximo de pasos", async () => {
    const { runAgent, defineTool } = await import("../src/lib/agents/runtime");
    const tool = defineTool({
      name: "bucle",
      label: "x",
      description: "Herramienta de prueba que el modelo simulado llama sin parar.",
      schema: z.object({}),
      run: async () => "ok",
    });
    for (let i = 0; i < 5; i++) queue.push({ stop_reason: "tool_use", usage, content: [{ type: "tool_use", id: `t${i}`, name: "bucle", input: {} }] });
    const text = await runAgent({
      agent: { id: "itinerario", name: "x", system: "s", tools: [tool], effort: "low", maxTurns: 3 },
      ctx: makeCtx().ctx as never,
      messages: [{ role: "user", content: "x" }],
    });
    expect(requests).toHaveLength(3);
    expect(text).toMatch(/límite de pasos/);
  });

  it("el plan gratuito no puede usar los especialistas de pago", async () => {
    const { canUseAgent } = await import("../src/lib/billing/plans");
    expect(canUseAgent("free", "itinerario")).toBe(true);
    expect(canUseAgent("free", "experiencias")).toBe(true);
    for (const agent of ["vuelos", "hoteles", "presupuesto"] as const) {
      expect(canUseAgent("free", agent)).toBe(false);
      expect(canUseAgent("premium", agent)).toBe(true);
    }
  });
});

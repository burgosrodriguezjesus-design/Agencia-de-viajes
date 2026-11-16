import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import type { AgentId } from "../billing/plans";
import type { Plan } from "../domain/types";
import type { ServerSupabase } from "../supabase/server";

// Motor común de los agentes: bucle de uso de herramientas sobre la API de
// Claude con streaming. Cada agente es un prompt de sistema + un subconjunto
// de herramientas; las herramientas validan su entrada con Zod y trabajan con
// la sesión del usuario (RLS), de modo que un agente nunca puede tocar datos
// ajenos ni marcar un precio como verificado.

export type AgentEvent =
  | { type: "text"; delta: string }
  | { type: "agent"; agent: AgentId; status: "start" | "done" | "error"; detail?: string }
  | { type: "tool"; agent: AgentId; label: string }
  | { type: "trip_updated" }
  | { type: "error"; message: string }
  | { type: "done" };

export interface AgentContext {
  supabase: ServerSupabase;
  userId: string;
  tripId: string;
  plan: Plan;
  emit: (event: AgentEvent) => void;
  /** Acumulado de tokens de toda la ejecución (incluye subagentes). */
  usage: { input: number; output: number };
  signal?: AbortSignal;
}

export interface AgentTool<S extends z.ZodType = z.ZodType> {
  name: string;
  description: string;
  schema: S;
  /** Texto corto que se muestra al usuario mientras se ejecuta. */
  label: string;
  /** true si la herramienta modifica el viaje (para refrescar la interfaz). */
  mutates?: boolean;
  run: (input: z.infer<S>, ctx: AgentContext) => Promise<unknown>;
}

export function defineTool<S extends z.ZodType>(tool: AgentTool<S>): AgentTool {
  return tool as unknown as AgentTool;
}

export interface AgentDefinition {
  id: AgentId;
  name: string;
  system: string;
  tools: AgentTool[];
  effort: "low" | "medium" | "high";
  maxTurns: number;
}

type Msg = Anthropic.Beta.BetaMessageParam;

export const AGENT_MODEL = process.env.AGENT_MODEL || "claude-opus-5-5";
export const SPECIALIST_MODEL = process.env.AGENT_SPECIALIST_MODEL || AGENT_MODEL;

let client: Anthropic | null = null;
function getClient(): Anthropic {
  client ??= new Anthropic();
  return client;
}

export class AgentUnavailableError extends Error {}

const MAX_TOOL_RESULT_CHARS = 24_000;

function toToolParam(tool: AgentTool): Anthropic.Beta.BetaTool {
  const schema = z.toJSONSchema(tool.schema, { target: "draft-7" }) as Record<string, unknown>;
  delete schema.$schema;
  return {
    name: tool.name,
    description: tool.description,
    input_schema: schema as Anthropic.Beta.BetaTool["input_schema"],
    // Las entradas grandes (lotes de actividades) llegan en streaming; al
    // activarlo la validación es nuestra: se hace con Zod antes de ejecutar.
    eager_input_streaming: true,
  };
}

export interface RunAgentOptions {
  agent: AgentDefinition;
  ctx: AgentContext;
  messages: Msg[];
  model?: string;
  /** Recibe el texto del agente según se genera (solo el asistente lo usa). */
  onText?: (delta: string) => void;
}

/**
 * Ejecuta un agente hasta que termina su turno. Devuelve el texto final.
 * Las herramientas de un mismo turno se ejecutan en paralelo y sus resultados
 * se devuelven juntos en un único mensaje.
 */
export async function runAgent({ agent, ctx, messages, model, onText }: RunAgentOptions): Promise<string> {
  const anthropic = getClient();
  const tools = agent.tools.map(toToolParam);
  const byName = new Map(agent.tools.map((t) => [t.name, t]));
  const history: Msg[] = [...messages];
  let finalText = "";
  let jsonRetries = 0;

  for (let turn = 0; turn < agent.maxTurns; turn++) {
    const stream = anthropic.beta.messages.stream(
      {
        model: model ?? SPECIALIST_MODEL,
        max_tokens: 32_000,
        // Si el modelo declina por política, la API reintenta en el modelo
        // alternativo por defecto dentro de la misma llamada.
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
        output_config: { effort: agent.effort },
        system: [{ type: "text", text: agent.system, cache_control: { type: "ephemeral" } }],
        tools,
        messages: history,
      },
      { signal: ctx.signal },
    );
    if (onText) stream.on("text", onText);

    let message: Anthropic.Beta.BetaMessage;
    try {
      message = await stream.finalMessage();
      jsonRetries = 0;
    } catch (err) {
      // Con eager_input_streaming, un JSON de herramienta ilegible rechaza el
      // turno: se reintenta (máx. 2 veces). Los errores de API se propagan.
      if (err instanceof Anthropic.APIError || jsonRetries++ >= 2) throw err;
      turn--;
      continue;
    }

    ctx.usage.input += message.usage.input_tokens + (message.usage.cache_read_input_tokens ?? 0) + (message.usage.cache_creation_input_tokens ?? 0);
    ctx.usage.output += message.usage.output_tokens;

    const text = message.content
      .filter((b): b is Anthropic.Beta.BetaTextBlock => b.type === "text")
      .map((b) => b.text)
      .join("");
    if (text) finalText = text;

    if (message.stop_reason === "refusal") {
      return finalText || "No puedo ayudar con esa petición. ¿Probamos con otra cosa sobre tu viaje?";
    }
    if (message.stop_reason === "pause_turn") {
      history.push({ role: "assistant", content: message.content });
      continue;
    }

    const toolUses = message.content.filter(
      (b): b is Anthropic.Beta.BetaToolUseBlock => b.type === "tool_use",
    );
    if (toolUses.length === 0) return finalText;

    if (message.stop_reason === "max_tokens") {
      // Una entrada de herramienta truncada puede parecer válida: no se ejecuta.
      throw new Error("La respuesta del agente se cortó antes de completar una acción.");
    }

    history.push({ role: "assistant", content: message.content });

    const results = await Promise.all(
      toolUses.map(async (use): Promise<Anthropic.Beta.BetaToolResultBlockParam> => {
        const tool = byName.get(use.name);
        if (!tool) {
          return { type: "tool_result", tool_use_id: use.id, is_error: true, content: `Herramienta desconocida: ${use.name}` };
        }
        const parsed = tool.schema.safeParse(use.input);
        if (!parsed.success) {
          return {
            type: "tool_result",
            tool_use_id: use.id,
            is_error: true,
            content: `Entrada no válida: ${z.prettifyError(parsed.error)}`,
          };
        }
        ctx.emit({ type: "tool", agent: agent.id, label: tool.label });
        try {
          const output = await tool.run(parsed.data, ctx);
          if (tool.mutates) ctx.emit({ type: "trip_updated" });
          let content = typeof output === "string" ? output : JSON.stringify(output);
          if (content.length > MAX_TOOL_RESULT_CHARS) {
            content = `${content.slice(0, MAX_TOOL_RESULT_CHARS)}… [resultado recortado: pide menos elementos]`;
          }
          return { type: "tool_result", tool_use_id: use.id, content };
        } catch (err) {
          return {
            type: "tool_result",
            tool_use_id: use.id,
            is_error: true,
            content: err instanceof Error ? err.message : "Error al ejecutar la herramienta",
          };
        }
      }),
    );
    history.push({ role: "user", content: results });
  }
  return finalText || "He alcanzado el límite de pasos para esta tarea. Dime si quieres que continúe.";
}

/** Traduce errores de la API a mensajes para el usuario. */
export function describeAgentError(err: unknown): string {
  if (err instanceof AgentUnavailableError) return err.message;
  if (err instanceof Anthropic.AuthenticationError) {
    return "La clave de la API de IA no es válida. Revisa ANTHROPIC_API_KEY.";
  }
  if (err instanceof Anthropic.RateLimitError) {
    return "Hay mucha demanda en este momento. Inténtalo de nuevo en un minuto.";
  }
  if (err instanceof Anthropic.APIConnectionError) {
    return "No se pudo conectar con el servicio de IA. Inténtalo de nuevo.";
  }
  if (err instanceof Anthropic.APIError) {
    return `El servicio de IA devolvió un error (${err.status ?? "sin código"}). Inténtalo de nuevo.`;
  }
  return err instanceof Error ? err.message : "Error inesperado";
}

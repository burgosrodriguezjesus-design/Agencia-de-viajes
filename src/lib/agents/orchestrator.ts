import "server-only";
import type Anthropic from "@anthropic-ai/sdk";
import { z } from "zod";
import { canUseAgent, type AgentId } from "../billing/plans";
import type { ChatMessage } from "../domain/types";
import { isAiConfigured } from "../providers/status";
import { ASSISTANT_DIRECT_TOOLS, ASSISTANT_SYSTEM, SPECIALISTS } from "./definitions";
import {
  AGENT_MODEL,
  AgentUnavailableError,
  defineTool,
  runAgent,
  SPECIALIST_MODEL,
  type AgentContext,
  type AgentDefinition,
} from "./runtime";

type SpecialistId = Exclude<AgentId, "asistente">;

/** Ejecuta un especialista con un encargo autosuficiente y devuelve su informe. */
export async function runSpecialist(id: SpecialistId, task: string, ctx: AgentContext): Promise<string> {
  if (!isAiConfigured()) {
    throw new AgentUnavailableError("Los agentes de IA no están activados todavía (falta la clave de la API).");
  }
  const agent = SPECIALISTS[id];
  ctx.emit({ type: "agent", agent: id, status: "start", detail: agent.name });
  try {
    const report = await runAgent({
      agent,
      ctx,
      model: SPECIALIST_MODEL,
      messages: [{ role: "user", content: task }],
    });
    ctx.emit({ type: "agent", agent: id, status: "done", detail: agent.name });
    return report;
  } catch (err) {
    ctx.emit({ type: "agent", agent: id, status: "error", detail: agent.name });
    throw err;
  }
}

const consultarEspecialista = defineTool({
  name: "consultar_especialista",
  label: "Coordinando al equipo",
  description:
    "Encarga una tarea a un agente especialista del equipo. El especialista trabaja sobre el mismo viaje con sus propias herramientas, guarda sus resultados en él y te devuelve un informe. No ve esta conversación: el encargo debe incluir todo lo que necesita saber. Para tareas independientes puedes lanzar varios especialistas en paralelo en el mismo turno.",
  schema: z.object({
    agente: z.enum(["vuelos", "hoteles", "itinerario", "experiencias", "presupuesto"]),
    encargo: z.string().min(10).max(2000).describe("Qué quiere el usuario, restricciones y qué debe quedar hecho"),
  }),
  run: async (input, ctx) => {
    if (!canUseAgent(ctx.plan, input.agente)) {
      return {
        disponible: false,
        motivo: `El agente de ${input.agente} forma parte del plan Premium. En el plan gratuito puedes ofrecer los enlaces de comparación y los cambios de itinerario.`,
      };
    }
    const informe = await runSpecialist(input.agente, input.encargo, ctx);
    return { disponible: true, informe };
  },
});

const ASSISTANT: AgentDefinition = {
  id: "asistente",
  name: "Asistente personal",
  effort: "medium",
  maxTurns: 14,
  system: ASSISTANT_SYSTEM,
  tools: [...ASSISTANT_DIRECT_TOOLS, consultarEspecialista],
};

/**
 * Turno de conversación con el asistente. El historial se pasa como texto
 * plano (sin bloques de herramientas de turnos anteriores): el estado vive en
 * el viaje, y el asistente lo relee con `ver_viaje`.
 */
export async function runAssistant(
  history: Pick<ChatMessage, "role" | "content">[],
  userMessage: string,
  ctx: AgentContext,
): Promise<string> {
  if (!isAiConfigured()) {
    throw new AgentUnavailableError("El asistente de IA no está activado todavía (falta la clave de la API).");
  }
  const messages: Anthropic.Beta.BetaMessageParam[] = [];
  for (const m of history.slice(-16)) {
    // La API exige empezar por un turno de usuario.
    if (messages.length === 0 && m.role !== "user") continue;
    messages.push({ role: m.role, content: m.content });
  }
  messages.push({ role: "user", content: userMessage });

  ctx.emit({ type: "agent", agent: "asistente", status: "start" });
  const text = await runAgent({
    agent: ASSISTANT,
    ctx,
    model: AGENT_MODEL,
    messages,
    onText: (delta) => ctx.emit({ type: "text", delta }),
  });
  ctx.emit({ type: "agent", agent: "asistente", status: "done" });
  return text;
}

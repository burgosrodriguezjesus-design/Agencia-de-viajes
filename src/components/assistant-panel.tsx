"use client";

import { ArrowUp, MessagesSquare, Sparkles, X } from "lucide-react";
import { useRouter } from "next/navigation";
import { createContext, useCallback, useContext, useEffect, useMemo, useRef, useState, type ReactNode } from "react";
import { AGENT_LABEL, streamEvents } from "@/lib/sse-client";
import { cn, Notice } from "./ui";

interface Message {
  id: string;
  role: "user" | "assistant";
  content: string;
}

interface AssistantApi {
  /** Abre el panel y, si se indica, envía un mensaje al asistente. */
  ask: (message?: string) => void;
  aiEnabled: boolean;
  canEdit: boolean;
}

const AssistantContext = createContext<AssistantApi | null>(null);

export function useAssistant(): AssistantApi {
  const ctx = useContext(AssistantContext);
  if (!ctx) throw new Error("useAssistant debe usarse dentro de AssistantProvider");
  return ctx;
}

const SUGGESTIONS = [
  "Quiero gastar menos en este viaje",
  "Organiza mañana para que no perdamos tiempo",
  "Elimina las actividades caras",
  "¿Cuánto dinero nos queda del presupuesto?",
  "Busca otro hotel más céntrico",
];

/** Texto del asistente: párrafos, negritas y enlaces https, sin HTML crudo. */
function RichText({ text }: { text: string }) {
  const blocks = text.split(/\n{2,}/);
  return (
    <>
      {blocks.map((block, i) => (
        <p key={i} className="whitespace-pre-wrap">
          {block.split(/(\*\*[^*]+\*\*|\[[^\]]+\]\(https:\/\/[^\s)]+\)|https:\/\/[^\s)]+)/g).map((part, j) => {
            if (/^\*\*[^*]+\*\*$/.test(part)) return <strong key={j}>{part.slice(2, -2)}</strong>;
            const md = /^\[([^\]]+)\]\((https:\/\/[^\s)]+)\)$/.exec(part);
            if (md) {
              return (
                <a key={j} href={md[2]} target="_blank" rel="noopener noreferrer nofollow" className="text-accent underline underline-offset-2">
                  {md[1]}
                </a>
              );
            }
            if (/^https:\/\//.test(part)) {
              return (
                <a key={j} href={part} target="_blank" rel="noopener noreferrer nofollow" className="break-all text-accent underline underline-offset-2">
                  {part}
                </a>
              );
            }
            return part;
          })}
        </p>
      ))}
    </>
  );
}

export function AssistantProvider({
  tripId,
  initialMessages,
  aiEnabled,
  canEdit,
  children,
}: {
  tripId: string;
  initialMessages: Message[];
  aiEnabled: boolean;
  canEdit: boolean;
  children: ReactNode;
}) {
  const router = useRouter();
  const [open, setOpen] = useState(false);
  const [messages, setMessages] = useState<Message[]>(initialMessages);
  const [input, setInput] = useState("");
  const [busy, setBusy] = useState(false);
  const [activity, setActivity] = useState<string | null>(null);
  const [error, setError] = useState<string | null>(null);
  const scrollRef = useRef<HTMLDivElement>(null);
  const refreshTimer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const busyRef = useRef(false);

  useEffect(() => {
    scrollRef.current?.scrollTo({ top: scrollRef.current.scrollHeight });
  }, [messages, activity, open]);

  useEffect(() => {
    if (!open) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [open]);

  // Refresca la página (itinerario, presupuesto...) según trabajan los agentes.
  const scheduleRefresh = useCallback(() => {
    if (refreshTimer.current) return;
    refreshTimer.current = setTimeout(() => {
      refreshTimer.current = null;
      router.refresh();
    }, 900);
  }, [router]);

  const send = useCallback(
    async (text: string) => {
      const message = text.trim();
      if (!message || busyRef.current) return;
      busyRef.current = true;
      setBusy(true);
      setError(null);
      setInput("");
      const replyId = crypto.randomUUID();
      setMessages((prev) => [
        ...prev,
        { id: crypto.randomUUID(), role: "user", content: message },
        { id: replyId, role: "assistant", content: "" },
      ]);
      setActivity("Pensando");
      try {
        await streamEvents("/api/agents/chat", { tripId, message }, (event) => {
          if (event.type === "text") {
            setActivity(null);
            setMessages((prev) => prev.map((m) => (m.id === replyId ? { ...m, content: m.content + event.delta } : m)));
          } else if (event.type === "agent" && event.agent !== "asistente") {
            setActivity(event.status === "start" ? `${AGENT_LABEL[event.agent] ?? event.agent} trabajando` : "Revisando el resultado");
          } else if (event.type === "tool") {
            setActivity(event.agent === "asistente" ? event.label : `${AGENT_LABEL[event.agent] ?? event.agent}: ${event.label.toLowerCase()}`);
          } else if (event.type === "trip_updated") {
            scheduleRefresh();
          } else if (event.type === "error") {
            setError(event.message);
          }
        });
      } catch (err) {
        setError(err instanceof Error ? err.message : "No se pudo contactar con el asistente.");
      } finally {
        busyRef.current = false;
        setBusy(false);
        setActivity(null);
        setMessages((prev) => prev.filter((m) => m.id !== replyId || m.content.trim() !== ""));
        router.refresh();
      }
    },
    [router, scheduleRefresh, tripId],
  );

  const api = useMemo<AssistantApi>(
    () => ({
      ask: (message) => {
        setOpen(true);
        if (message) void send(message);
      },
      aiEnabled,
      canEdit,
    }),
    [aiEnabled, canEdit, send],
  );

  const disabled = !aiEnabled || !canEdit;

  return (
    <AssistantContext value={api}>
      {children}

      <button
        type="button"
        onClick={() => setOpen(true)}
        className={cn(
          "fixed right-4 bottom-4 z-40 inline-flex h-13 items-center gap-2 rounded-full bg-ink px-5 text-sm font-medium text-bg shadow-float transition hover:scale-[1.03] sm:right-6 sm:bottom-6",
          open && "pointer-events-none opacity-0",
        )}
      >
        <MessagesSquare className="size-[18px]" aria-hidden />
        Asistente
        {busy ? <span className="size-2 animate-pulse-soft rounded-full bg-accent" aria-label="trabajando" /> : null}
      </button>

      {open ? <div className="fixed inset-0 z-40 bg-black/30 backdrop-blur-[2px] sm:hidden" onClick={() => setOpen(false)} aria-hidden /> : null}

      <aside
        aria-label="Asistente personal de viaje"
        aria-hidden={!open}
        inert={!open}
        className={cn(
          "fixed inset-y-0 right-0 z-50 flex w-full flex-col border-l border-line bg-bg shadow-float transition-transform duration-300 sm:w-[26rem]",
          open ? "translate-x-0" : "translate-x-full",
        )}
      >
        <header className="flex items-center justify-between border-b border-line px-5 py-4">
          <div className="flex items-center gap-3">
            <span className="grid size-9 place-items-center rounded-full bg-accent-soft text-accent">
              <Sparkles className="size-[18px]" aria-hidden />
            </span>
            <div>
              <h2 className="text-[15px] leading-tight font-semibold">Asistente personal</h2>
              <p className="text-xs text-muted">Coordina a los 5 agentes especialistas</p>
            </div>
          </div>
          <button type="button" onClick={() => setOpen(false)} aria-label="Cerrar asistente" className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-surface-2 hover:text-ink">
            <X className="size-5" aria-hidden />
          </button>
        </header>

        <div ref={scrollRef} className="scroll-quiet flex-1 space-y-4 overflow-y-auto px-5 py-5">
          {!aiEnabled ? (
            <Notice tone="warn">
              El asistente de IA todavía no está activado en esta instalación (falta la clave de la API de Claude).
              Mientras tanto puedes editar el viaje a mano: arrastrar actividades, añadir precios y comparar opciones.
            </Notice>
          ) : !canEdit ? (
            <Notice>Tienes acceso de solo lectura a este viaje, así que no puedes pedir cambios al asistente.</Notice>
          ) : null}

          {messages.length === 0 && !disabled ? (
            <div>
              <p className="font-display text-2xl leading-tight font-medium">¿Qué cambiamos del viaje?</p>
              <p className="mt-2 text-sm leading-relaxed text-muted">
                Pídemelo con tus palabras. Conozco el viaje entero y puedo coordinar al equipo para actualizarlo.
              </p>
              <div className="mt-5 flex flex-col items-start gap-2">
                {SUGGESTIONS.map((s) => (
                  <button
                    key={s}
                    type="button"
                    onClick={() => void send(s)}
                    className="rounded-2xl border border-line bg-surface px-3.5 py-2 text-left text-sm transition hover:border-ink/40"
                  >
                    {s}
                  </button>
                ))}
              </div>
            </div>
          ) : null}

          {messages.map((m) =>
            m.role === "user" ? (
              <div key={m.id} className="flex justify-end">
                <p className="max-w-[85%] rounded-2xl rounded-br-md bg-ink px-4 py-2.5 text-[15px] leading-relaxed whitespace-pre-wrap text-bg">{m.content}</p>
              </div>
            ) : m.content ? (
              <div key={m.id} className="max-w-[92%] space-y-2.5 text-[15px] leading-relaxed">
                <RichText text={m.content} />
              </div>
            ) : null,
          )}

          {activity ? (
            <p className="flex items-center gap-2 text-sm text-muted" role="status">
              <span className="size-2 animate-pulse-soft rounded-full bg-accent" aria-hidden />
              {activity}…
            </p>
          ) : null}
          {error ? <Notice tone="danger">{error}</Notice> : null}
        </div>

        <form
          onSubmit={(e) => {
            e.preventDefault();
            void send(input);
          }}
          className="border-t border-line p-3"
        >
          <div className="flex items-end gap-2 rounded-2xl border border-line bg-surface p-2 focus-within:border-accent focus-within:ring-2 focus-within:ring-accent/20">
            <textarea
              value={input}
              onChange={(e) => setInput(e.target.value)}
              onKeyDown={(e) => {
                if (e.key === "Enter" && !e.shiftKey) {
                  e.preventDefault();
                  void send(input);
                }
              }}
              rows={1}
              maxLength={2000}
              disabled={disabled}
              placeholder={disabled ? "Asistente no disponible" : "Añade dos días en Kioto…"}
              aria-label="Mensaje para el asistente"
              className="max-h-32 min-h-9 flex-1 resize-none bg-transparent px-2 py-1.5 text-[15px] placeholder:text-muted/70 focus:outline-none disabled:opacity-60"
            />
            <button
              type="submit"
              disabled={disabled || busy || !input.trim()}
              aria-label="Enviar"
              className="grid size-9 shrink-0 place-items-center rounded-full bg-accent text-accent-ink transition disabled:opacity-40"
            >
              <ArrowUp className="size-[18px]" aria-hidden />
            </button>
          </div>
          <p className="mt-2 px-1 text-[11px] leading-snug text-muted">
            El asistente no puede reservar ni pagar nada. Los precios que no vengan de un proveedor son estimaciones.
          </p>
        </form>
      </aside>
    </AssistantContext>
  );
}

/** Botón que abre el asistente con una petición ya escrita. */
export function AskAssistantButton({
  message,
  children,
  className,
}: {
  message: string;
  children: ReactNode;
  className?: string;
}) {
  const { ask, aiEnabled, canEdit } = useAssistant();
  if (!canEdit) return null;
  return (
    <button
      type="button"
      onClick={() => ask(aiEnabled ? message : undefined)}
      className={cn(
        "inline-flex h-10 items-center gap-2 rounded-full bg-accent px-4 text-sm font-medium text-accent-ink transition hover:opacity-90",
        className,
      )}
    >
      <Sparkles className="size-4" aria-hidden />
      {children}
    </button>
  );
}

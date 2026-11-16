"use client";

import { Check, CircleDashed, Loader2, TriangleAlert } from "lucide-react";
import { usePathname, useRouter } from "next/navigation";
import { useCallback, useEffect, useRef, useState } from "react";
import { AGENT_LABEL, streamEvents } from "@/lib/sse-client";
import { Button, Card, cn, Notice } from "./ui";

type StageState = "pending" | "running" | "done" | "error";

interface Stage {
  id: string;
  label: string;
  state: StageState;
  detail?: string;
}

/**
 * Lanza la generación inicial del viaje y muestra el trabajo de cada agente
 * en directo. Se inicia sola al llegar desde el formulario (?generar=1).
 */
export function GenerationRunner({
  tripId,
  autoStart,
  aiEnabled,
  stages: stageIds,
}: {
  tripId: string;
  autoStart: boolean;
  aiEnabled: boolean;
  /** Agentes que participarán según el plan del usuario. */
  stages: string[];
}) {
  const router = useRouter();
  const pathname = usePathname();
  const started = useRef(false);
  const [running, setRunning] = useState(false);
  const [finished, setFinished] = useState(false);
  const [warnings, setWarnings] = useState<string[]>([]);
  const [activity, setActivity] = useState<string | null>(null);
  const [stages, setStages] = useState<Stage[]>(() =>
    stageIds.map((id) => ({ id, label: AGENT_LABEL[id] ?? id, state: "pending" })),
  );

  const run = useCallback(async () => {
    if (started.current) return;
    started.current = true;
    setRunning(true);
    setFinished(false);
    setWarnings([]);
    setStages((prev) => prev.map((s) => ({ ...s, state: "pending", detail: undefined })));
    let refreshTimer: ReturnType<typeof setTimeout> | null = null;
    try {
      await streamEvents(`/api/trips/${tripId}/generate`, undefined, (event) => {
        if (event.type === "agent") {
          setStages((prev) =>
            prev.map((s) =>
              s.id === event.agent
                ? { ...s, state: event.status === "start" ? "running" : event.status === "done" ? "done" : "error", detail: event.detail }
                : s,
            ),
          );
          if (event.status !== "start") setActivity(null);
        } else if (event.type === "tool") {
          setActivity(`${AGENT_LABEL[event.agent] ?? event.agent}: ${event.label.toLowerCase()}`);
        } else if (event.type === "trip_updated") {
          refreshTimer ??= setTimeout(() => {
            refreshTimer = null;
            router.refresh();
          }, 1200);
        } else if (event.type === "error") {
          setWarnings((prev) => [...prev, event.message]);
        }
      });
    } catch (err) {
      setWarnings((prev) => [...prev, err instanceof Error ? err.message : "No se pudo generar el viaje."]);
    } finally {
      started.current = false;
      setRunning(false);
      setFinished(true);
      setActivity(null);
      // Quita ?generar=1 y recarga los datos ya generados.
      router.replace(pathname, { scroll: false });
      router.refresh();
    }
  }, [pathname, router, tripId]);

  useEffect(() => {
    if (autoStart) void run();
  }, [autoStart, run]);

  if (finished && warnings.length === 0) return null;

  return (
    <Card className="overflow-hidden">
      <div className="border-b border-line px-6 py-5">
        <h2 className="font-display text-2xl font-medium">
          {running ? "Tu equipo está preparando el viaje" : finished ? "No hemos podido completar el plan" : "Genera el plan de tu viaje"}
        </h2>
        <p className="mt-1 text-sm leading-relaxed text-muted">
          {running
            ? "Puedes quedarte mirando o explorar las pestañas: se irán rellenando solas. Suele tardar entre uno y tres minutos."
            : aiEnabled
              ? "Los agentes buscarán lugares reales, organizarán los días y prepararán las opciones para comparar."
              : "Modo básico: crearemos un itinerario con lugares de interés reales agrupados por cercanía. Los agentes de IA se activan al configurar la clave de la API."}
        </p>
      </div>
      <ol className="divide-y divide-line">
        {stages.map((stage) => (
          <li key={stage.id} className="flex items-center gap-3 px-6 py-3.5">
            <span
              className={cn(
                "grid size-7 shrink-0 place-items-center rounded-full",
                stage.state === "done" && "bg-save-soft text-save",
                stage.state === "running" && "bg-accent-soft text-accent",
                stage.state === "error" && "bg-warn-soft text-warn",
                stage.state === "pending" && "bg-surface-2 text-muted",
              )}
            >
              {stage.state === "done" ? (
                <Check className="size-4" aria-hidden />
              ) : stage.state === "running" ? (
                <Loader2 className="size-4 animate-spin" aria-hidden />
              ) : stage.state === "error" ? (
                <TriangleAlert className="size-4" aria-hidden />
              ) : (
                <CircleDashed className="size-4" aria-hidden />
              )}
            </span>
            <div className="min-w-0 flex-1">
              <p className={cn("text-[15px] font-medium", stage.state === "pending" && "text-muted")}>{stage.detail ?? stage.label}</p>
              {stage.state === "running" && activity ? <p className="truncate text-sm text-muted">{activity}…</p> : null}
            </div>
            <span className="text-xs text-muted">
              {stage.state === "done" ? "Listo" : stage.state === "running" ? "Trabajando" : stage.state === "error" ? "Incompleto" : "En cola"}
            </span>
          </li>
        ))}
      </ol>
      {warnings.length > 0 ? (
        <div className="space-y-2 border-t border-line p-4">
          {warnings.map((w, i) => (
            <Notice key={i} tone="warn">{w}</Notice>
          ))}
        </div>
      ) : null}
      {!running ? (
        <div className="border-t border-line p-4">
          <Button variant="accent" onClick={() => void run()}>
            {finished ? "Reintentar" : "Generar mi viaje"}
          </Button>
        </div>
      ) : null}
    </Card>
  );
}

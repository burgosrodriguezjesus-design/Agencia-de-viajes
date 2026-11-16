"use client";

import { useTransition } from "react";
import { setSuggestionStatus } from "@/app/actions/trips";
import { useAssistant } from "./assistant-panel";
import { Button } from "./ui";

export function SuggestionActions({ tripId, id, title, status }: { tripId: string; id: string; title: string; status: string }) {
  const { ask, aiEnabled, canEdit } = useAssistant();
  const [pending, startTransition] = useTransition();
  if (!canEdit) return null;
  const set = (next: "applied" | "dismissed" | "proposed") =>
    startTransition(async () => {
      await setSuggestionStatus(tripId, id, next);
    });
  if (status !== "proposed") {
    return (
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => set("proposed")}>
        Recuperar
      </Button>
    );
  }
  return (
    <div className="flex flex-wrap gap-2">
      <Button
        size="sm"
        disabled={pending}
        title="El asistente hará el cambio en tu viaje. No se reserva ni se paga nada."
        onClick={() => {
          set("applied");
          if (aiEnabled) ask(`Aplica esta propuesta de ahorro en el viaje: «${title}».`);
        }}
      >
        Aplicar
      </Button>
      <Button variant="ghost" size="sm" disabled={pending} onClick={() => set("dismissed")}>
        Descartar
      </Button>
    </div>
  );
}

"use client";

import { useTransition } from "react";
import { chooseOption } from "@/app/actions/trips";
import { useAssistant } from "./assistant-panel";
import { Button } from "./ui";

/** Elige una opción para el presupuesto (no reserva nada). */
export function ChooseOptionButton({ tripId, optionId, children }: { tripId: string; optionId: string; children: React.ReactNode }) {
  const { canEdit } = useAssistant();
  const [pending, startTransition] = useTransition();
  if (!canEdit) return null;
  return (
    <Button
      size="sm"
      disabled={pending}
      title="Elegir no reserva nada: solo cambia la opción incluida en tu presupuesto"
      onClick={() =>
        startTransition(async () => {
          await chooseOption(tripId, optionId, true);
        })
      }
    >
      {pending ? "Cambiando…" : children}
    </Button>
  );
}

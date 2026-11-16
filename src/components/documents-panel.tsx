"use client";

import { FileText, Trash2, Upload } from "lucide-react";
import { useRef, useState, useTransition } from "react";
import { deleteDocument, getDocumentUrl, uploadDocument } from "@/app/actions/sharing";
import type { TripDocument } from "@/lib/domain/types";
import { Badge, Button, EmptyState, inputClass, Notice } from "./ui";

const CATEGORY_LABEL: Record<TripDocument["category"], string> = {
  billete: "Billete",
  reserva: "Reserva",
  seguro: "Seguro",
  identidad: "Identidad",
  otro: "Otro",
};

function formatSize(bytes: number | null): string {
  if (!bytes) return "";
  return bytes < 1024 * 1024 ? `${Math.max(1, Math.round(bytes / 1024))} KB` : `${(bytes / 1024 / 1024).toFixed(1)} MB`;
}

export function DocumentsPanel({ tripId, documents, canEdit }: { tripId: string; documents: TripDocument[]; canEdit: boolean }) {
  const [error, setError] = useState<string | null>(null);
  const [pending, startTransition] = useTransition();
  const formRef = useRef<HTMLFormElement>(null);

  const open = (id: string) =>
    startTransition(async () => {
      setError(null);
      const r = await getDocumentUrl(tripId, id);
      if (r.url) window.open(r.url, "_blank", "noopener,noreferrer");
      else setError(r.error ?? "No se pudo abrir el documento.");
    });

  return (
    <div className="space-y-6">
      {canEdit ? (
        <form
          ref={formRef}
          action={(formData) =>
            startTransition(async () => {
              setError(null);
              const r = await uploadDocument(tripId, formData);
              if (r.ok) formRef.current?.reset();
              else setError(r.error ?? "No se pudo subir.");
            })
          }
          className="flex flex-wrap items-end gap-3 rounded-2xl border border-line bg-surface p-5"
        >
          <label className="min-w-56 flex-1 text-sm">
            <span className="mb-1.5 block font-medium">Archivo</span>
            <input
              type="file"
              name="file"
              required
              accept="application/pdf,image/png,image/jpeg,image/webp"
              className="block w-full text-sm text-muted file:mr-3 file:h-10 file:cursor-pointer file:rounded-full file:border-0 file:bg-surface-2 file:px-4 file:text-sm file:font-medium file:text-ink"
            />
          </label>
          <label className="w-40 text-sm">
            <span className="mb-1.5 block font-medium">Tipo</span>
            <select name="category" defaultValue="reserva" className={inputClass}>
              {Object.entries(CATEGORY_LABEL).map(([value, label]) => (
                <option key={value} value={value}>
                  {label}
                </option>
              ))}
            </select>
          </label>
          <Button type="submit" disabled={pending} className="h-11">
            <Upload className="size-4" aria-hidden /> {pending ? "Subiendo…" : "Subir"}
          </Button>
          <p className="w-full text-xs text-muted">PDF o imagen, máximo 10 MB. Se guardan en un almacén privado: solo las personas con acceso al viaje pueden abrirlos.</p>
        </form>
      ) : null}

      {error ? <Notice tone="danger">{error}</Notice> : null}

      {documents.length === 0 ? (
        <EmptyState title="Sin documentos todavía">
          Guarda aquí billetes, confirmaciones de reserva, el seguro de viaje y todo lo que quieras tener a mano durante el viaje.
        </EmptyState>
      ) : (
        <ul className="divide-y divide-line overflow-hidden rounded-2xl border border-line bg-surface">
          {documents.map((doc) => (
            <li key={doc.id} className="flex items-center gap-3 px-4 py-3">
              <span className="grid size-10 shrink-0 place-items-center rounded-xl bg-surface-2 text-muted">
                <FileText className="size-5" aria-hidden />
              </span>
              <button type="button" onClick={() => open(doc.id)} className="min-w-0 flex-1 text-left">
                <span className="block truncate font-medium underline-offset-4 hover:underline">{doc.name}</span>
                <span className="text-xs text-muted">{formatSize(doc.size_bytes)}</span>
              </button>
              <Badge>{CATEGORY_LABEL[doc.category]}</Badge>
              {canEdit ? (
                <button
                  type="button"
                  disabled={pending}
                  aria-label={`Eliminar ${doc.name}`}
                  onClick={() =>
                    startTransition(async () => {
                      setError(null);
                      const r = await deleteDocument(tripId, doc.id);
                      if (!r.ok) setError(r.error ?? "No se pudo eliminar.");
                    })
                  }
                  className="grid size-9 place-items-center rounded-full text-muted transition hover:bg-danger-soft hover:text-danger"
                >
                  <Trash2 className="size-4" aria-hidden />
                </button>
              ) : null}
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}

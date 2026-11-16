import { formatMoney, type BudgetSummary } from "@/lib/domain/money";
import { cn } from "./ui";

/** Barra de presupuesto: confirmado (verde) + estimado (ámbar) sobre el total. */
export function BudgetBar({ summary, className }: { summary: BudgetSummary; className?: string }) {
  const max = Math.max(summary.budget ?? 0, summary.total, 1);
  const confirmedPct = (summary.confirmedTotal / max) * 100;
  const estimatedPct = (summary.estimatedTotal / max) * 100;
  const over = summary.remaining !== null && summary.remaining < 0;
  return (
    <div className={className}>
      <div className="flex h-3 overflow-hidden rounded-full bg-surface-2" role="img" aria-label={`Planificado ${formatMoney(summary.total, summary.currency)}`}>
        <div className="bg-save transition-all" style={{ width: `${confirmedPct}%` }} />
        <div className="bg-warn/70 transition-all" style={{ width: `${estimatedPct}%` }} />
      </div>
      <div className="mt-2.5 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-muted">
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-save" /> Confirmado {formatMoney(summary.confirmedTotal, summary.currency)}
        </span>
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2 rounded-full bg-warn/70" /> Estimado {formatMoney(summary.estimatedTotal, summary.currency)}
        </span>
        {summary.missingCount > 0 ? <span>{summary.missingCount} sin precio</span> : null}
        {summary.remaining !== null ? (
          <span className={cn("ml-auto font-medium", over ? "text-danger" : "text-ink")}>
            {over ? `Te pasas ${formatMoney(-summary.remaining, summary.currency)}` : `Quedan ${formatMoney(summary.remaining, summary.currency)}`}
          </span>
        ) : null}
      </div>
    </div>
  );
}

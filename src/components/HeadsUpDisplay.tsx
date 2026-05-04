/**
 * HeadsUpDisplay — consumes useAttentionData (ONE SOURCE OF TRUTH)
 * All queries are consolidated in useAttentionData — NO duplicate queries here.
 */
import { useNavigate } from "react-router-dom";
import { GLOBAL_ACTION_NEEDED_ROUTE, useAttentionData } from "@/hooks/useAttentionData";
import { AlertTriangle } from "lucide-react";

export function HeadsUpDisplay() {
  const navigate = useNavigate();
  const { hudItems, hasErrors, queryErrors } = useAttentionData();

  const activeCards = hudItems.filter((c) => c.count > 0);
  const zeroCards = hudItems.filter((c) => c.count === 0);
  const handleNavigate = () => navigate(GLOBAL_ACTION_NEEDED_ROUTE);

  return (
    <section className="px-4 py-3 space-y-3">
      <div className="flex items-center gap-2">
        <div className="h-6 w-6 rounded-md bg-primary flex items-center justify-center">
          <AlertTriangle className="h-3.5 w-3.5 text-primary-foreground" />
        </div>
        <span className="text-sm font-semibold">Heads-Up Display</span>
        {hasErrors && (
          <span className="ml-auto text-[10px] font-medium text-destructive" title={queryErrors.join(", ")}>
            ⚠ {queryErrors.length} source{queryErrors.length !== 1 ? "s" : ""} degraded
          </span>
        )}
        {!hasErrors && activeCards.length > 0 && (
          <span className="ml-auto text-xs font-medium text-overdue">
            {activeCards.length} need{activeCards.length !== 1 ? "" : "s"} attention
          </span>
        )}
      </div>

      {activeCards.length > 0 && (
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {activeCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.key}
                className={`rounded-xl border ${card.borderClass} p-3 text-center bg-gradient-to-br ${card.bgClass} cursor-pointer hover:shadow-md transition-all active:scale-[0.98]`}
                onClick={handleNavigate}
              >
                <div className="h-8 w-8 rounded-full bg-background/60 flex items-center justify-center mx-auto mb-1.5">
                  <Icon className={`h-4 w-4 ${card.color}`} />
                </div>
                <div className={`text-xl font-bold ${card.color}`}>{card.count}</div>
                <div className="text-[10px] text-muted-foreground font-medium">{card.label}</div>
              </div>
            );
          })}
        </div>
      )}

      {zeroCards.length > 0 && (
        <div className="grid grid-cols-4 md:grid-cols-8 gap-2">
          {zeroCards.map((card) => {
            const Icon = card.icon;
            return (
              <div
                key={card.key}
                className="rounded-lg border border-border/50 p-2 text-center opacity-50 hover:opacity-80 cursor-pointer transition-all"
                onClick={handleNavigate}
              >
                <Icon className="h-3.5 w-3.5 text-muted-foreground mx-auto mb-0.5" />
                <div className="text-[10px] text-muted-foreground font-medium truncate">{card.label}</div>
              </div>
            );
          })}
        </div>
      )}

      {activeCards.length === 0 && !hasErrors && (
        <div className="rounded-xl border border-complete/30 p-4 text-center bg-gradient-to-br from-complete/5 to-card">
          <p className="text-sm font-medium text-complete">✓ All clear — nothing needs attention</p>
        </div>
      )}
    </section>
  );
}

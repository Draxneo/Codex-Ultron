/**
 * JarvisFactCard — universal 5W renderer.
 *
 * Compact horizontal icon row: 👤 WHO · 🛠️ WHAT · 🕐 WHEN · 📍 WHERE · 💡 WHY
 * Icons whose facts are missing are silently skipped.
 *
 * Every JARVIS-created card (action_items, outbox approvals, attention items)
 * delegates its 5W body to this component. Card-specific buttons / status badges
 * remain in their own wrapper components.
 */

import { User, Wrench, Clock, MapPin, Lightbulb } from "lucide-react";
import { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";
import type { JarvisFacts } from "@/types/jarvisFacts";

interface JarvisFactCardProps {
  facts: JarvisFacts;
  /** Optional dense styling for nested contexts (e.g., inside small list rows). */
  dense?: boolean;
  /** Slot for action buttons rendered to the right. */
  actions?: React.ReactNode;
  className?: string;
}

interface Row {
  key: keyof JarvisFacts;
  Icon: typeof User;
  label: string;
  value: string;
  tooltip?: string;
}

function buildRows(facts: JarvisFacts): Row[] {
  const rows: Row[] = [];
  if (facts.who?.label) {
    rows.push({ key: "who", Icon: User, label: "Who", value: facts.who.label, tooltip: facts.who.phone });
  }
  if (facts.what?.label) {
    rows.push({ key: "what", Icon: Wrench, label: "What", value: facts.what.label });
  }
  if (facts.when?.label) {
    rows.push({ key: "when", Icon: Clock, label: "When", value: facts.when.label, tooltip: facts.when.iso });
  }
  if (facts.where?.label) {
    rows.push({ key: "where", Icon: MapPin, label: "Where", value: facts.where.label, tooltip: facts.where.address });
  }
  if (facts.why?.label) {
    rows.push({ key: "why", Icon: Lightbulb, label: "Why", value: facts.why.label });
  }
  return rows;
}

export function JarvisFactCard({ facts, dense = false, actions, className }: JarvisFactCardProps) {
  const rows = buildRows(facts);
  if (rows.length === 0 && !actions) return null;

  return (
    <TooltipProvider delayDuration={300}>
      <div
        className={cn(
          "flex items-center gap-x-3 gap-y-1 flex-wrap",
          dense ? "text-[11px]" : "text-xs",
          className,
        )}
      >
        {rows.map(({ key, Icon, label, value, tooltip }, i) => (
          <Tooltip key={key}>
            <TooltipTrigger asChild>
              <div
                className={cn(
                  "flex items-center gap-1 min-w-0",
                  // subtle separator dot between items, except first
                  i > 0 && "before:content-['·'] before:text-muted-foreground/40 before:mr-2 before:-ml-1",
                )}
              >
                <Icon
                  className={cn(
                    "shrink-0 text-muted-foreground",
                    dense ? "h-3 w-3" : "h-3.5 w-3.5",
                    key === "who" && "text-primary/70",
                    key === "where" && "text-accent-foreground/80",
                    key === "when" && "text-primary/70",
                    key === "why" && "text-muted-foreground",
                  )}
                />
                <span className="truncate max-w-[180px] text-foreground/90">{value}</span>
              </div>
            </TooltipTrigger>
            <TooltipContent side="top" className="text-[10px]">
              <span className="font-semibold">{label}</span>
              {tooltip && <span className="block opacity-80 mt-0.5">{tooltip}</span>}
            </TooltipContent>
          </Tooltip>
        ))}
        {actions && <div className="ml-auto flex items-center gap-1 shrink-0">{actions}</div>}
      </div>
    </TooltipProvider>
  );
}

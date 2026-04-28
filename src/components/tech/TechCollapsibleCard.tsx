/**
 * TechCollapsibleCard — Wraps a tech card with a clickable header that
 * toggles content visibility. Polished pass so every section on the
 * tech job detail can be collapsed and re-expanded.
 */
import { useState, type ReactNode, type ComponentType } from "react";
import { Card } from "@/components/ui/card";
import { ChevronDown } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  icon?: ComponentType<{ className?: string }>;
  iconColor?: string;
  iconBg?: string;
  title: string;
  rightSlot?: ReactNode;
  defaultOpen?: boolean;
  children: ReactNode;
  className?: string;
  id?: string;
  /** When false, the body is always shown (header still rendered, no chevron). */
  collapsible?: boolean;
}

export function TechCollapsibleCard({
  icon: Icon,
  iconColor = "text-primary",
  iconBg = "bg-primary/10",
  title,
  rightSlot,
  defaultOpen = true,
  children,
  className,
  id,
  collapsible = true,
}: Props) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <Card id={id} className={cn("overflow-hidden", className)}>
      <div className="flex items-center gap-2 px-4 h-14 border-b border-border bg-card">
        <button
          type="button"
          onClick={() => collapsible && setOpen((o) => !o)}
          disabled={!collapsible}
          className="flex-1 flex h-full items-center gap-3 text-left -mx-1 px-1 rounded active:bg-muted/50 disabled:active:bg-transparent"
          aria-expanded={open}
        >
          {Icon && (
            <span className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
              <Icon className={cn("h-5 w-5", iconColor)} />
            </span>
          )}
          <span className="text-base font-semibold text-foreground truncate">{title}</span>
          {collapsible && (
            <ChevronDown
              className={cn(
                "h-5 w-5 text-muted-foreground transition-transform ml-1",
                open ? "rotate-0" : "-rotate-90",
              )}
            />
          )}
        </button>
        {rightSlot && <div className="shrink-0 flex items-center gap-1.5">{rightSlot}</div>}
      </div>
      {open && <div>{children}</div>}
    </Card>
  );
}

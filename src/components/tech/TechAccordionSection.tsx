/**
 * TechAccordionSection.tsx — HCP-style collapsible card row with `+` add button.
 *
 * Used for: Estimate, Line Items, Job Inputs, Job Fields, Tags, Lead Source, Notes, Property Profile.
 */

import { useState, type ReactNode } from "react";
import { ChevronDown, Plus } from "lucide-react";
import { cn } from "@/lib/utils";

interface TechAccordionSectionProps {
  title: string;
  count?: number;
  defaultOpen?: boolean;
  onAdd?: () => void;
  children?: ReactNode;
  /** Optional right-side label shown before the +/chevron */
  rightLabel?: string;
}

export function TechAccordionSection({
  title,
  count,
  defaultOpen = false,
  onAdd,
  children,
  rightLabel,
}: TechAccordionSectionProps) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <div className="border-b border-border last:border-b-0 bg-card">
      <div className="flex items-center px-4 h-12">
        <button
          type="button"
          onClick={() => setOpen((o) => !o)}
          className="flex-1 flex items-center gap-2 text-left active:opacity-70"
        >
          <ChevronDown
            className={cn("h-4 w-4 text-muted-foreground transition-transform", open ? "rotate-0" : "-rotate-90")}
          />
          <span className="text-sm font-medium text-foreground">{title}</span>
          {typeof count === "number" && (
            <span className="text-xs text-muted-foreground">({count})</span>
          )}
          {rightLabel && (
            <span className="ml-auto text-xs text-muted-foreground">{rightLabel}</span>
          )}
        </button>
        {onAdd && (
          <button
            type="button"
            onClick={onAdd}
            className="ml-2 h-8 w-8 rounded-full flex items-center justify-center text-primary hover:bg-primary/10 active:bg-primary/20"
            aria-label={`Add ${title}`}
          >
            <Plus className="h-5 w-5" />
          </button>
        )}
      </div>
      {open && <div className="px-4 pb-3 -mt-1">{children}</div>}
    </div>
  );
}

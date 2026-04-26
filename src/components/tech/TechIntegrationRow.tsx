/**
 * TechIntegrationRow.tsx — HCP-style row for external integrations (Bluon, Copilot, Pricebook).
 */

import type { LucideIcon } from "lucide-react";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";

interface TechIntegrationRowProps {
  icon: LucideIcon;
  label: string;
  description?: string;
  onClick: () => void;
  iconBg?: string;
  iconColor?: string;
}

export function TechIntegrationRow({
  icon: Icon,
  label,
  description,
  onClick,
  iconBg = "bg-primary/10",
  iconColor = "text-primary",
}: TechIntegrationRowProps) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="w-full flex items-center gap-3 px-4 h-14 bg-card border-b border-border last:border-b-0 active:bg-muted/50"
    >
      <div className={cn("h-9 w-9 rounded-lg flex items-center justify-center shrink-0", iconBg)}>
        <Icon className={cn("h-5 w-5", iconColor)} />
      </div>
      <div className="flex-1 min-w-0 text-left">
        <p className="text-sm font-medium text-foreground truncate">{label}</p>
        {description && <p className="text-xs text-muted-foreground truncate">{description}</p>}
      </div>
      <ChevronRight className="h-4 w-4 text-muted-foreground shrink-0" />
    </button>
  );
}

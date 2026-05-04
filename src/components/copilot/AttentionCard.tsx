import { useNavigate } from "react-router-dom";
import { ChevronRight } from "lucide-react";
import { cn } from "@/lib/utils";
import { type AttentionItem } from "@/hooks/useAttentionData";

interface AttentionCardProps {
  item: AttentionItem;
  /** Use larger padding/text for full-page layout */
  large?: boolean;
  /** Override default navigation behavior */
  onClick?: () => void;
}

export function AttentionCard({ item, large = false, onClick }: AttentionCardProps) {
  const navigate = useNavigate();
  const Icon = item.icon;

  const handleClick = () => {
    if (onClick) {
      onClick();
      return;
    }

    navigate(item.route);
  };

  return (
    <button
      onClick={handleClick}
      className={cn(
        "w-full flex items-center gap-3 rounded-lg border text-left transition-all hover:shadow-sm hover:border-primary/20 active:scale-[0.98]",
        large ? "p-4 hover:shadow-md" : "p-3",
        item.severity === "critical" && "border-destructive/30 bg-destructive/5",
        item.severity === "warning" && "border-amber-500/30 bg-amber-500/5",
        item.severity === "info" && "border-border bg-card",
      )}
    >
      <div className={cn("shrink-0 rounded-lg", large ? "p-2.5" : "p-2", item.bg)}>
        <Icon className={cn(large ? "h-5 w-5" : "h-4 w-4", item.color)} />
      </div>
      <div className="flex-1 min-w-0">
        <p className="text-sm font-medium">{item.label}</p>
        <p className={cn("font-bold", large ? "text-2xl" : "text-lg", item.color)}>{item.count}</p>
      </div>
      <ChevronRight className={cn("text-muted-foreground shrink-0", large ? "h-5 w-5" : "h-4 w-4")} />
    </button>
  );
}

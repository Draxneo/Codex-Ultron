import { cn } from "@/lib/utils";

/**
 * iMessage/Gmail-style day divider. Appears between messages/calls
 * in a thread so the user can visually scan conversations by day.
 */
export function DayDivider({ label, className }: { label: string; className?: string }) {
  return (
    <div className={cn("flex items-center gap-2 my-2", className)}>
      <div className="flex-1 h-px bg-border/60" />
      <span className="text-[10px] font-semibold uppercase tracking-wider text-muted-foreground px-2 py-0.5 rounded-full bg-muted/50">
        {label}
      </span>
      <div className="flex-1 h-px bg-border/60" />
    </div>
  );
}

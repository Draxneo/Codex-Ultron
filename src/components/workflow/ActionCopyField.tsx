import { Copy } from "lucide-react";
import { cn } from "@/lib/utils";

export function ActionCopyField({ label, value }: { label: string; value: string }) {
  const copy = () => {
    if (!value) return;
    navigator.clipboard.writeText(value);
  };

  return (
    <div className="flex items-center gap-1.5">
      <span className="text-[10px] text-muted-foreground uppercase tracking-wide w-24 shrink-0">{label}</span>
      <span className={cn("text-xs font-mono truncate flex-1", !value && "text-muted-foreground italic")}>
        {value || "-"}
      </span>
      {value && (
        <button onClick={copy} className="shrink-0 h-5 w-5 rounded border border-border flex items-center justify-center hover:bg-accent">
          <Copy className="h-2.5 w-2.5" />
        </button>
      )}
    </div>
  );
}

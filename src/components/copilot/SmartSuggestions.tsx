import { useJarvisSuggestions, recordSuggestionClick, type JarvisSuggestion } from "@/hooks/useJarvisSuggestions";
import { Sparkles, TrendingUp, Loader2 } from "lucide-react";
import { cn } from "@/lib/utils";

interface Props {
  contextType: "customer" | "job" | "call" | "sms";
  contextSubtype?: string;
  customerId?: string | null;
  jobId?: string | null;
  phone?: string | null;
  summary?: string | null;
  onPick: (suggestion: JarvisSuggestion) => void;
}

export function SmartSuggestions({
  contextType,
  contextSubtype,
  customerId,
  jobId,
  phone,
  summary,
  onPick,
}: Props) {
  const { data: suggestions = [], isLoading } = useJarvisSuggestions({
    context_type: contextType,
    context_subtype: contextSubtype,
    customer_id: customerId,
    job_id: jobId,
    phone,
    summary,
  });

  if (isLoading) {
    return (
      <div className="flex items-center justify-center py-3 text-xs text-muted-foreground">
        <Loader2 className="h-3 w-3 animate-spin mr-2" /> JARVIS is thinking...
      </div>
    );
  }
  if (suggestions.length === 0) return null;

  return (
    <div className="space-y-1.5">
      <p className="text-[10px] uppercase tracking-wider text-muted-foreground px-1 flex items-center gap-1">
        <Sparkles className="h-3 w-3" /> Suggested next steps
      </p>
      <div className="flex flex-wrap gap-1.5">
        {suggestions.map((s) => (
          <button
            key={s.key}
            onClick={() => {
              recordSuggestionClick({
                context_type: contextType,
                context_subtype: contextSubtype,
                action_key: s.key,
                action_label: s.label,
                customer_id: customerId,
                job_id: jobId,
              });
              onPick(s);
            }}
            className={cn(
              "text-xs px-3 py-1.5 rounded-full border transition-colors flex items-center gap-1",
              s.source === "learned"
                ? "border-primary/40 bg-primary/10 text-primary hover:bg-primary/20"
                : "border-border text-foreground hover:bg-accent"
            )}
            title={s.source === "learned" ? "You use this often" : "AI suggestion"}
          >
            {s.source === "learned" && <TrendingUp className="h-3 w-3" />}
            {s.label}
          </button>
        ))}
      </div>
    </div>
  );
}

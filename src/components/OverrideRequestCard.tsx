import { AlertTriangle, ShieldCheck, X } from "lucide-react";
import { Button } from "@/components/ui/button";

type Props = {
  rule: string;
  request: string;
  onOverride: () => void;
  onCancel: () => void;
  loading?: boolean;
};

export function OverrideRequestCard({ rule, request, onOverride, onCancel, loading }: Props) {
  return (
    <div className="bg-yellow-500/10 border border-yellow-500/30 rounded-lg p-3 space-y-2 text-xs">
      <p className="font-semibold text-[10px] uppercase tracking-wide text-yellow-700 dark:text-yellow-400 flex items-center gap-1">
        <AlertTriangle className="h-3 w-3" /> Rule Conflict — Override Required
      </p>
      <div className="space-y-1.5">
        <div className="bg-background/50 rounded p-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase mb-0.5">Active Rule</p>
          <p className="text-foreground">{rule}</p>
        </div>
        <div className="bg-background/50 rounded p-2">
          <p className="text-[10px] font-medium text-muted-foreground uppercase mb-0.5">Your Request</p>
          <p className="text-foreground">{request}</p>
        </div>
      </div>
      <div className="flex gap-2">
        <Button
          size="sm"
          className="flex-1 text-xs h-7 bg-yellow-600 hover:bg-yellow-700 text-white"
          onClick={onOverride}
          disabled={loading}
        >
          <ShieldCheck className="h-3 w-3 mr-1" /> Override & Proceed
        </Button>
        <Button
          size="sm"
          variant="outline"
          className="text-xs h-7"
          onClick={onCancel}
          disabled={loading}
        >
          <X className="h-3 w-3 mr-1" /> Cancel
        </Button>
      </div>
    </div>
  );
}

/** Parse [OVERRIDE_REQUEST] from AI response. Returns null if not an override. */
export function parseOverrideRequest(content: string): { rule: string; request: string; cleanContent: string } | null {
  const marker = "[OVERRIDE_REQUEST]";
  // Only trigger if the marker appears at the start of the content or at the start of a line
  // (not when the AI merely mentions it in descriptive text)
  const markerRegex = /(?:^|\n)\s*\[OVERRIDE_REQUEST\]/;
  if (!markerRegex.test(content)) return null;

  const afterMarker = content.split(marker)[1] || "";
  
  // Try to parse "Rule: ... Request: ..." format
  const ruleMatch = afterMarker.match(/(?:rule|conflict|instruction)[:\s]*["']?(.+?)["']?\s*(?:request|you're asking|action)[:\s]*["']?(.+?)["']?$/is);
  if (ruleMatch) {
    return { rule: ruleMatch[1].trim(), request: ruleMatch[2].trim(), cleanContent: content.split(marker)[0].trim() };
  }

  // Fallback: split on newlines
  const lines = afterMarker.trim().split("\n").filter(l => l.trim());
  return {
    rule: lines[0]?.trim() || "Conflicting rule detected",
    request: lines.slice(1).join(" ").trim() || "Your request conflicts with a stored rule",
    cleanContent: content.split(marker)[0].trim(),
  };
}

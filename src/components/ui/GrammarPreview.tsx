import { Check, X, Undo2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { diffWords } from "@/lib/textDiff";

interface GrammarPreviewProps {
  original: string;
  polished: string;
  onAccept: () => void;
  onReject: () => void;
  onCancel: () => void;
  loading?: boolean;
}

export function GrammarPreview({
  original,
  polished,
  onAccept,
  onReject,
  onCancel,
  loading,
}: GrammarPreviewProps) {
  const diffNodes = diffWords(original, polished);

  return (
    <div className="border border-accent/30 bg-accent/5 rounded-lg p-3 space-y-2 animate-in fade-in slide-in-from-bottom-2 duration-200">
      <div className="flex items-center gap-2 text-xs text-muted-foreground">
        <span className="font-medium text-accent">✨ Grammar suggestion</span>
        <button onClick={onCancel} className="ml-auto p-0.5 hover:bg-muted rounded">
          <X className="h-3 w-3" />
        </button>
      </div>
      <p className="text-sm leading-relaxed whitespace-pre-wrap">{diffNodes}</p>
      <div className="flex items-center gap-2">
        <Button
          size="sm"
          onClick={onAccept}
          disabled={loading}
          className="h-7 text-xs bg-accent hover:bg-accent/90 text-accent-foreground"
        >
          <Check className="h-3 w-3 mr-1" /> Send Corrected
        </Button>
        <Button
          size="sm"
          variant="ghost"
          onClick={onReject}
          disabled={loading}
          className="h-7 text-xs"
        >
          <Undo2 className="h-3 w-3 mr-1" /> Send Original
        </Button>
      </div>
    </div>
  );
}

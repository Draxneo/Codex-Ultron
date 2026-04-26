import { Mic, Loader2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { useVoiceToText } from "@/hooks/useVoiceToText";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DictateButtonProps {
  /** Called with the transcribed text once Deepgram returns. */
  onTranscript: (text: string) => void;
  /** Hide on mobile (default true — Gboard already provides native dictation). */
  hideOnMobile?: boolean;
  /** Visual size of the icon button. */
  size?: "xs" | "sm" | "md";
  className?: string;
  title?: string;
}

/**
 * Universal dictation mic button.
 *
 * Wraps the existing useVoiceToText hook (Deepgram nova-3 with keyterm
 * boosting) into a one-line drop-in for any composer or note field.
 *
 * Idle  → blue mic
 * Listening → red pulsing mic (auto-stops on silence via the hook)
 * Transcribing → spinner
 *
 * Defaults to desktop-only because mobile keyboards already have a native
 * mic key — doubling up confuses users.
 */
export function DictateButton({
  onTranscript,
  hideOnMobile = true,
  size = "sm",
  className,
  title = "Dictate (voice to text)",
}: DictateButtonProps) {
  const isMobile = useIsMobile();

  const { isRecording, loading, toggle } = useVoiceToText({
    onTranscript: (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed) {
        toast.info("Didn't catch that — try again");
        return;
      }
      onTranscript(trimmed);
    },
    onError: (err) => toast.error(err || "Voice transcription failed"),
  });

  if (hideOnMobile && isMobile) return null;

  const dims =
    size === "xs" ? "h-6 w-6" : size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const iconDims =
    size === "xs" ? "h-3 w-3" : size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={loading ? "Transcribing…" : isRecording ? "Listening — click to stop" : title}
      onClick={toggle}
      disabled={loading}
      className={cn(
        dims,
        "shrink-0 transition-colors",
        isRecording && "text-destructive bg-destructive/10 hover:bg-destructive/20 animate-pulse",
        !isRecording && !loading && "text-muted-foreground hover:text-primary",
        className,
      )}
    >
      {loading ? (
        <Loader2 className={cn(iconDims, "animate-spin")} />
      ) : (
        <Mic className={iconDims} />
      )}
    </Button>
  );
}

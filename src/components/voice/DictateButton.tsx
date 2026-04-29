import { Loader2, Mic, MicOff } from "lucide-react";
import { Button } from "@/components/ui/button";
import { type DictationProvider, useVoiceToText } from "@/hooks/useVoiceToText";
import { useIsMobile } from "@/hooks/use-mobile";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

interface DictateButtonProps {
  onTranscript: (text: string) => void;
  hideOnMobile?: boolean;
  size?: "xs" | "sm" | "md";
  provider?: DictationProvider;
  prompt?: string;
  autoStopOnSilence?: boolean;
  showLabel?: boolean;
  idleLabel?: string;
  recordingLabel?: string;
  loadingLabel?: string;
  className?: string;
  title?: string;
}

export function DictateButton({
  onTranscript,
  hideOnMobile = true,
  size = "sm",
  provider,
  prompt,
  autoStopOnSilence = true,
  showLabel = false,
  idleLabel = "Talk",
  recordingLabel = "Stop",
  loadingLabel = "Transcribing",
  className,
  title = "Dictate voice to text",
}: DictateButtonProps) {
  const isMobile = useIsMobile();

  const { isRecording, loading, toggle } = useVoiceToText({
    provider,
    prompt,
    autoStopOnSilence,
    onTranscript: (text) => {
      const trimmed = (text || "").trim();
      if (!trimmed) {
        toast.info("Didn't catch that. Try again.");
        return;
      }
      onTranscript(trimmed);
    },
    onError: (err) => toast.error(err || "Voice transcription failed"),
  });

  if (hideOnMobile && isMobile) return null;

  const dims =
    size === "xs" ? "h-6 w-6" : size === "sm" ? "h-8 w-8" : "h-9 w-9";
  const labelDims =
    size === "xs" ? "h-7 px-2 text-xs" : size === "sm" ? "h-8 px-2.5 text-xs" : "h-9 px-3 text-sm";
  const iconDims =
    size === "xs" ? "h-3 w-3" : size === "sm" ? "h-3.5 w-3.5" : "h-4 w-4";
  const currentTitle = loading ? "Transcribing..." : isRecording ? "Recording - click to stop" : title;

  if (showLabel) {
    return (
      <Button
        type="button"
        variant={isRecording ? "destructive" : "outline"}
        title={currentTitle}
        onClick={toggle}
        disabled={loading}
        className={cn(
          labelDims,
          "shrink-0 gap-1.5 transition-colors",
          isRecording && "animate-pulse",
          className,
        )}
      >
        {loading ? (
          <Loader2 className={cn(iconDims, "animate-spin")} />
        ) : isRecording ? (
          <MicOff className={iconDims} />
        ) : (
          <Mic className={iconDims} />
        )}
        <span>{loading ? loadingLabel : isRecording ? recordingLabel : idleLabel}</span>
      </Button>
    );
  }

  return (
    <Button
      type="button"
      variant="ghost"
      size="icon"
      title={currentTitle}
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

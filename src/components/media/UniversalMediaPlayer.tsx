import { useEffect, useId, useRef, useState, type SyntheticEvent } from "react";
import { AlertCircle, Pause, Play, Volume2 } from "lucide-react";
import { Button } from "@/components/ui/button";
import { Slider } from "@/components/ui/slider";
import { cn } from "@/lib/utils";

type MediaKind = "audio" | "video";
type PlayerVariant = "compact" | "inline" | "card";

interface UniversalMediaPlayerProps {
  src: string;
  kind?: MediaKind;
  title?: string;
  subtitle?: string;
  variant?: PlayerVariant;
  autoPlay?: boolean;
  className?: string;
  onPlayed?: () => void;
  stopPropagation?: boolean;
}

const GLOBAL_MEDIA_EVENT = "ultraoffice:media-play";

function formatTime(seconds: number) {
  if (!Number.isFinite(seconds) || seconds <= 0) return "0:00";
  const rounded = Math.floor(seconds);
  const minutes = Math.floor(rounded / 60);
  const remaining = rounded % 60;
  return `${minutes}:${remaining.toString().padStart(2, "0")}`;
}

export function UniversalMediaPlayer({
  src,
  kind = "audio",
  title,
  subtitle,
  variant = "inline",
  autoPlay = false,
  className,
  onPlayed,
  stopPropagation,
}: UniversalMediaPlayerProps) {
  const id = useId();
  const mediaRef = useRef<HTMLAudioElement | HTMLVideoElement | null>(null);
  const [playing, setPlaying] = useState(false);
  const [duration, setDuration] = useState(0);
  const [currentTime, setCurrentTime] = useState(0);
  const [error, setError] = useState<string | null>(null);

  useEffect(() => {
    const onOtherMediaStarted = (event: Event) => {
      const detail = (event as CustomEvent<{ id: string }>).detail;
      if (detail?.id !== id) {
        mediaRef.current?.pause();
      }
    };

    window.addEventListener(GLOBAL_MEDIA_EVENT, onOtherMediaStarted);
    return () => window.removeEventListener(GLOBAL_MEDIA_EVENT, onOtherMediaStarted);
  }, [id]);

  useEffect(() => {
    setPlaying(false);
    setCurrentTime(0);
    setDuration(0);
    setError(null);
  }, [src]);

  const toggle = async () => {
    const media = mediaRef.current;
    if (!media) return;

    if (playing) {
      media.pause();
      return;
    }

    try {
      setError(null);
      window.dispatchEvent(new CustomEvent(GLOBAL_MEDIA_EVENT, { detail: { id } }));
      await media.play();
      onPlayed?.();
    } catch (err: any) {
      console.warn("Universal media playback failed", { src, kind, error: err });
      setError(err?.message || "Could not play this media");
      setPlaying(false);
    }
  };

  const seek = ([value]: number[]) => {
    const media = mediaRef.current;
    if (!media || !Number.isFinite(value)) return;
    media.currentTime = value;
    setCurrentTime(value);
  };

  const mediaProps = {
    ref: mediaRef as any,
    src,
    preload: "metadata" as const,
    autoPlay,
    onPlay: () => {
      window.dispatchEvent(new CustomEvent(GLOBAL_MEDIA_EVENT, { detail: { id } }));
      setPlaying(true);
    },
    onPause: () => setPlaying(false),
    onEnded: () => {
      setPlaying(false);
      setCurrentTime(0);
    },
    onLoadedMetadata: (event: SyntheticEvent<HTMLAudioElement | HTMLVideoElement>) => {
      setDuration(event.currentTarget.duration || 0);
    },
    onTimeUpdate: (event: SyntheticEvent<HTMLAudioElement | HTMLVideoElement>) => {
      setCurrentTime(event.currentTarget.currentTime || 0);
    },
    onError: () => {
      console.warn("Universal media failed to load", { src, kind });
      setError("Media file could not be loaded");
      setPlaying(false);
    },
  };

  if (variant === "compact") {
    return (
      <Button
        type="button"
        size="icon"
        variant="ghost"
        className={cn("h-7 w-7 shrink-0", className)}
        title={playing ? "Pause" : "Play"}
        onClick={(event) => {
          if (stopPropagation) event.stopPropagation();
          void toggle();
        }}
      >
        {kind === "audio" ? <audio {...mediaProps} /> : <video {...mediaProps} className="hidden" />}
        {playing ? <Pause className="h-3.5 w-3.5" /> : <Play className="h-3.5 w-3.5" />}
      </Button>
    );
  }

  return (
    <div
      className={cn(
        "rounded-lg border border-border bg-card p-3",
        variant === "card" && "p-4",
        className,
      )}
      onClick={(event) => {
        if (stopPropagation) event.stopPropagation();
      }}
    >
      {kind === "video" && (
        <video
          {...mediaProps}
          className={cn("mb-3 max-h-[55dvh] w-full rounded-md bg-black object-contain")}
        />
      )}
      {kind === "audio" && <audio {...mediaProps} />}

      <div className="flex items-center gap-3">
        <Button type="button" size="icon" variant="secondary" className="h-9 w-9 shrink-0" onClick={() => void toggle()}>
          {playing ? <Pause className="h-4 w-4" /> : <Play className="h-4 w-4" />}
        </Button>

        <div className="min-w-0 flex-1">
          <div className="mb-1 flex items-center gap-2">
            <Volume2 className="h-3.5 w-3.5 text-muted-foreground" />
            <p className="truncate text-xs font-semibold">{title || (kind === "video" ? "Video" : "Audio")}</p>
            {subtitle && <span className="truncate text-[10px] text-muted-foreground">{subtitle}</span>}
          </div>
          <Slider
            value={[Math.min(currentTime, duration || currentTime || 0)]}
            min={0}
            max={Math.max(duration, currentTime, 1)}
            step={0.5}
            onValueChange={seek}
            className="w-full"
          />
          <div className="mt-1 flex items-center justify-between text-[10px] text-muted-foreground tabular-nums">
            <span>{formatTime(currentTime)}</span>
            <span>{formatTime(duration)}</span>
          </div>
        </div>
      </div>

      {error && (
        <div className="mt-2 flex items-center gap-1.5 text-xs text-destructive">
          <AlertCircle className="h-3.5 w-3.5" />
          {error}
        </div>
      )}
    </div>
  );
}

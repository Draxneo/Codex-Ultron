/**
 * TechJarvisPushToTalk — Press-and-hold mic button that streams the
 * technician's voice to the existing `ai-task-agent` orchestrator with
 * the current job pinned as page context.
 *
 * Replaces the legacy "Estimate / Line Items / Job Inputs / Job Fields …"
 * accordion stack on the tech job detail. Techs don't need workflow
 * scaffolding — they need to ask JARVIS a question hands-free.
 */

import { useState, useCallback, useRef } from "react";
import { Mic, Loader2, Sparkles, Volume2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { useVoiceToText } from "@/hooks/useVoiceToText";
import { useAnnouncer } from "@/hooks/useAnnouncer";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { toast } from "sonner";

interface Props {
  jobId: string;
  jobNumber?: string | null;
  customerName?: string | null;
  /** Render without outer Card chrome (used inside TechCollapsibleCard) */
  bare?: boolean;
}

export function TechJarvisPushToTalk({ jobId, jobNumber, customerName, bare = false }: Props) {
  const [thinking, setThinking] = useState(false);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const transcriptRef = useRef<string>("");
  const { announce } = useAnnouncer();

  const askJarvis = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question) return;
      setLastQuestion(question);
      setThinking(true);
      try {
        const pageCtx = `Active job: ${jobNumber || jobId}${customerName ? ` for ${customerName}` : ""}. Job ID: ${jobId}.`;
        const { data, error } = await supabase.functions.invoke("ai-task-agent", {
          body: {
            mode: "chat",
            messages: [{ role: "user", content: question }],
            page_context: pageCtx,
          },
        });
        if (error) throw error;
        const reply: string = data?.reply || "No response.";
        setLastReply(reply);
        announce(reply);
      } catch (e: any) {
        toast.error(e?.message || "JARVIS failed to respond");
      } finally {
        setThinking(false);
      }
    },
    [jobId, jobNumber, customerName, announce]
  );

  const { isRecording, loading, start, stop } = useVoiceToText({
    onTranscript: (t) => {
      transcriptRef.current = t;
    },
  });

  const onPressStart = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      // Capture the pointer so we keep getting events even if finger drifts off the button
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      transcriptRef.current = "";
      start();
    },
    [start]
  );

  const onPressEnd = useCallback(
    async (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try {
        e.currentTarget.releasePointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      if (!isRecording) return;
      await stop();
      // Wait briefly for transcript callback to populate
      setTimeout(() => {
        const text = transcriptRef.current;
        if (text) askJarvis(text);
      }, 350);
    },
    [isRecording, stop, askJarvis]
  );

  const busy = loading || thinking;
  const active = isRecording;

  const inner = (
    <div className="flex flex-col items-center gap-3 p-4">
      {!bare && (
        <div className="flex items-center gap-2 self-start">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Ask JARVIS</span>
          <span className="text-[11px] text-muted-foreground ml-1">Hold to talk</span>
        </div>
      )}

      <button
        type="button"
        onPointerDown={onPressStart}
        onPointerUp={onPressEnd}
        onPointerCancel={onPressEnd}
        disabled={busy && !active}
        className={cn(
          "relative h-24 w-24 rounded-full flex items-center justify-center transition-all select-none touch-none",
          "shadow-lg active:scale-95",
          active
            ? "bg-destructive text-destructive-foreground scale-110 ring-4 ring-destructive/30 animate-pulse"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
          busy && !active && "opacity-60"
        )}
        aria-label="Hold to talk to JARVIS"
      >
        {thinking ? (
          <Loader2 className="h-9 w-9 animate-spin" />
        ) : active ? (
          <Mic className="h-10 w-10" />
        ) : loading ? (
          <Loader2 className="h-9 w-9 animate-spin" />
        ) : (
          <Mic className="h-10 w-10" />
        )}
      </button>

      <p className="text-[11px] text-muted-foreground h-4">
        {active
          ? "Listening… release to send"
          : thinking
            ? "JARVIS is thinking…"
            : loading
              ? "Transcribing…"
              : "Press and hold the mic"}
      </p>

      {lastQuestion && (
        <div className="w-full pt-2 border-t border-border space-y-2">
          <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">You asked</p>
          <p className="text-xs text-foreground italic">"{lastQuestion}"</p>
          {lastReply && (
            <>
              <div className="flex items-center gap-1.5 pt-1">
                <Volume2 className="h-3 w-3 text-primary" />
                <p className="text-[11px] uppercase tracking-wide text-muted-foreground font-medium">JARVIS</p>
              </div>
              <p className="text-xs text-foreground whitespace-pre-wrap">{lastReply}</p>
            </>
          )}
        </div>
      )}
    </div>
  );

  if (bare) return inner;
  return <Card className="overflow-hidden">{inner}</Card>;
}

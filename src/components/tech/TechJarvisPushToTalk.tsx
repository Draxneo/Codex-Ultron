/**
 * TechJarvisPushToTalk - field-first voice assistant for tech jobs.
 *
 * The tech workflow is intentionally simple:
 * take pictures, talk to JARVIS, build/send the customer cart.
 */

import { useState, useCallback, useRef } from "react";
import { Camera, Loader2, Mic, ShoppingCart, Sparkles, Volume2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
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
  onOpenCart?: () => void;
  onOpenPhotos?: () => void;
}

export function TechJarvisPushToTalk({
  jobId,
  jobNumber,
  customerName,
  bare = false,
  onOpenCart,
  onOpenPhotos,
}: Props) {
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
        const pageCtx = [
          `Active job: ${jobNumber || jobId}${customerName ? ` for ${customerName}` : ""}.`,
          `Job ID: ${jobId}.`,
          "Tech workflow: photos plus voice notes should become repair/replacement recommendations, cart options, and a customer-ready approval/payment link.",
          "If the tech describes options, respond with clear cart item names, prices to confirm, and what should be sent to the customer. Keep customer-facing sends human-approved.",
        ].join(" ");

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
    [jobId, jobNumber, customerName, announce],
  );

  const { isRecording, loading, start, stop } = useVoiceToText({
    onTranscript: (t) => {
      transcriptRef.current = t;
    },
  });

  const onPressStart = useCallback(
    (e: React.PointerEvent<HTMLButtonElement>) => {
      e.preventDefault();
      try {
        e.currentTarget.setPointerCapture(e.pointerId);
      } catch {
        /* noop */
      }
      transcriptRef.current = "";
      start();
    },
    [start],
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
      setTimeout(() => {
        const text = transcriptRef.current;
        if (text) askJarvis(text);
      }, 350);
    },
    [isRecording, stop, askJarvis],
  );

  const busy = loading || thinking;
  const active = isRecording;

  const inner = (
    <div className="flex flex-col items-center gap-4 p-4">
      {!bare && (
        <div className="flex items-center gap-2 self-start">
          <Sparkles className="h-4 w-4 text-primary" />
          <span className="text-sm font-semibold text-foreground">Ask JARVIS</span>
          <span className="text-[11px] text-muted-foreground ml-1">Hold to talk</span>
        </div>
      )}

      <div className="w-full rounded-xl border border-purple-500/20 bg-purple-500/5 p-3">
        <p className="text-sm font-semibold text-foreground">Tell JARVIS what you found.</p>
        <p className="mt-1 text-xs text-muted-foreground leading-relaxed">
          Talk through the diagnosis, repair choices, equipment options, and anything the customer asked.
          JARVIS should help turn that into cart options and a customer-ready link.
        </p>
      </div>

      <button
        type="button"
        onPointerDown={onPressStart}
        onPointerUp={onPressEnd}
        onPointerCancel={onPressEnd}
        disabled={busy && !active}
        className={cn(
          "relative h-32 w-32 rounded-full flex items-center justify-center transition-all select-none touch-none",
          "shadow-xl active:scale-95",
          active
            ? "bg-destructive text-destructive-foreground scale-110 ring-4 ring-destructive/30 animate-pulse"
            : "bg-primary text-primary-foreground hover:bg-primary/90",
          busy && !active && "opacity-60",
        )}
        aria-label="Hold to talk to JARVIS"
      >
        {thinking || loading ? (
          <Loader2 className="h-12 w-12 animate-spin" />
        ) : (
          <Mic className="h-14 w-14" />
        )}
      </button>

      <p className="text-sm font-medium text-muted-foreground h-5">
        {active
          ? "Listening... release to send"
          : thinking
            ? "JARVIS is thinking..."
            : loading
              ? "Transcribing..."
              : "Press and hold the mic"}
      </p>

      <div className="grid grid-cols-2 gap-2 w-full">
        <Button type="button" variant="outline" className="h-12 gap-2" onClick={onOpenPhotos}>
          <Camera className="h-4 w-4" /> Add photos
        </Button>
        <Button type="button" variant="outline" className="h-12 gap-2" onClick={onOpenCart}>
          <ShoppingCart className="h-4 w-4" /> Open cart
        </Button>
      </div>

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
              <div className="flex gap-2 pt-1">
                <Button type="button" size="sm" className="h-9 gap-1.5" onClick={onOpenCart}>
                  <ShoppingCart className="h-3.5 w-3.5" /> Build cart
                </Button>
                <Button type="button" size="sm" variant="outline" className="h-9 gap-1.5" onClick={onOpenPhotos}>
                  <Camera className="h-3.5 w-3.5" /> Add more photos
                </Button>
              </div>
            </>
          )}
        </div>
      )}
    </div>
  );

  if (bare) return inner;
  return <Card className="overflow-hidden">{inner}</Card>;
}

/**
 * TechJarvisPushToTalk - field-first voice assistant for tech jobs.
 *
 * The tech workflow is intentionally simple:
 * take pictures, talk to JARVIS, build/send the customer cart.
 */

import { useState, useCallback, useRef } from "react";
import { Camera, Check, Loader2, Mic, ShoppingCart, Sparkles, Trash2, Volume2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useVoiceToText } from "@/hooks/useVoiceToText";
import { useAnnouncer } from "@/hooks/useAnnouncer";
import { useJobCart, type JobCartItem, type NewCartItem } from "@/hooks/useJobCart";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
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

type ProposedCartAction = {
  id: string;
  name: string;
  description: string | null;
  unitPrice: number;
  quantity: number;
  kind: NewCartItem["kind"];
  tier: JobCartItem["tier"];
  sourceLine: string;
};

function inferKind(text: string): NewCartItem["kind"] {
  const lower = text.toLowerCase();
  if (/\b(system|condenser|furnace|air handler|coil|equipment|unit)\b/.test(lower)) return "equipment";
  if (/\b(part|capacitor|contactor|motor|board|sensor|valve|filter)\b/.test(lower)) return "part";
  if (/\b(repair|replace|clean|diagnostic|recharge|recondition|service)\b/.test(lower)) return "repair";
  return "custom";
}

function inferTier(text: string): JobCartItem["tier"] {
  const lower = text.toLowerCase();
  if (/\b(good|basic|option a)\b/.test(lower)) return "good";
  if (/\b(better|recommended|option b)\b/.test(lower)) return "better";
  if (/\b(best|premium|option c)\b/.test(lower)) return "best";
  if (/\b(critical|urgent)\b/.test(lower)) return "critical";
  return "recommended";
}

function stripOptionPrefix(text: string) {
  return text
    .replace(/^[-*\u2022\d.)\s]+/, "")
    .replace(/^cart\s+option\s*[:#-]?\s*/i, "")
    .replace(/^option\s+[a-c0-9#]+\s*[:.-]?\s*/i, "")
    .replace(/^name\s*[:|-]\s*/i, "")
    .replace(/\|\s*price\s*:?\s*$/i, "")
    .replace(/\s{2,}/g, " ")
    .trim();
}

function cleanOptionName(line: string, priceMatch: RegExpMatchArray) {
  const priceText = priceMatch[0];
  const beforePrice = line.slice(0, priceMatch.index).trim();
  const candidate = beforePrice || line.replace(priceText, "").trim();
  return stripOptionPrefix(candidate);
}

function parseJarvisCartSuggestions(reply: string): ProposedCartAction[] {
  const seen = new Set<string>();
  const suggestions: ProposedCartAction[] = [];
  const lines = reply
    .split(/\r?\n/)
    .map((line) => line.trim())
    .filter(Boolean);

  for (const line of lines) {
    const priceMatch = line.match(/\$\s*([\d,]+(?:\.\d{1,2})?)/);
    if (!priceMatch) continue;

    const unitPrice = Number(priceMatch[1].replace(/,/g, ""));
    if (!Number.isFinite(unitPrice) || unitPrice <= 0) continue;

    let name = cleanOptionName(line, priceMatch);
    let description = line.replace(priceMatch[0], "").trim();

    const pipeParts = line.split("|").map((part) => part.trim()).filter(Boolean);
    if (pipeParts.length >= 2) {
      const namePart = pipeParts.find((part) => !/price\s*:/i.test(part) && !/\$\s*[\d,]+/i.test(part));
      const descriptionPart = pipeParts.find((part) => /description\s*:/i.test(part));
      if (namePart) name = stripOptionPrefix(namePart);
      if (descriptionPart) description = descriptionPart.replace(/^description\s*:\s*/i, "").trim();
    }

    name = name.replace(/\s*[-:]\s*$/, "").trim();
    if (!name || name.length < 3 || /total|subtotal|tax|financing/i.test(name)) continue;

    const key = `${name.toLowerCase()}-${unitPrice}`;
    if (seen.has(key)) continue;
    seen.add(key);

    suggestions.push({
      id: `${key}-${suggestions.length}`,
      name: name.slice(0, 120),
      description: description && description !== name ? description.slice(0, 500) : null,
      unitPrice,
      quantity: 1,
      kind: inferKind(line),
      tier: inferTier(line),
      sourceLine: line,
    });

    if (suggestions.length >= 6) break;
  }

  return suggestions;
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
  const [proposedCartActions, setProposedCartActions] = useState<ProposedCartAction[]>([]);
  const [addingSuggestionId, setAddingSuggestionId] = useState<string | null>(null);
  const transcriptRef = useRef<string>("");
  const sendTranscriptWhenReadyRef = useRef(false);
  const { announce } = useAnnouncer();
  const { addItem } = useJobCart(jobId);
  const { employeeId } = useEffectiveAuth();

  const askJarvis = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question) return;
      setLastQuestion(question);
      setProposedCartActions([]);
      setThinking(true);
      let transcriptId: string | null = null;
      try {
        const { data: transcriptRow, error: transcriptError } = await (supabase as any)
          .from("job_transcripts")
          .insert({
            job_id: jobId,
            technician_id: employeeId || null,
            transcript_text: question,
            source: "tech_voice",
            metadata: {
              job_number: jobNumber || null,
              customer_name: customerName || null,
              workflow: "tech_jarvis_cart",
            },
          })
          .select("id")
          .single();

        if (transcriptError) {
          console.warn("[TechJarvisPushToTalk] Could not save tech transcript", transcriptError);
          toast.warning("JARVIS will still answer, but this voice note did not save to the job.");
        } else {
          transcriptId = transcriptRow?.id || null;
        }

        const pageCtx = [
          `Active job: ${jobNumber || jobId}${customerName ? ` for ${customerName}` : ""}.`,
          `Job ID: ${jobId}.`,
          "Tech workflow: photos plus voice notes should become repair/replacement recommendations, cart options, and a customer-ready approval/payment link.",
          "If the tech describes options, respond with clear cart item names, prices to confirm, and what should be sent to the customer. Keep customer-facing sends human-approved.",
          "When recommending cart choices, add a final section named CART OPTIONS. Put each priced option on one line like: Option A: Replace capacitor | price: $289 | description: Includes part, labor, testing.",
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
        const suggestedItems = parseJarvisCartSuggestions(reply);
        setLastReply(reply);
        setProposedCartActions(suggestedItems);
        if (transcriptId) {
          await (supabase as any)
            .from("job_transcripts")
            .update({
              ai_processed_at: new Date().toISOString(),
              ai_response: reply,
              suggested_items: suggestedItems.map((item) => ({
                name: item.name,
                description: item.description,
                unit_price: item.unitPrice,
                quantity: item.quantity,
                kind: item.kind,
                tier: item.tier,
                source_line: item.sourceLine,
              })),
            })
            .eq("id", transcriptId);
        }
        announce(reply);
      } catch (e: any) {
        toast.error(e?.message || "JARVIS failed to respond");
      } finally {
        setThinking(false);
      }
    },
    [jobId, jobNumber, customerName, employeeId, announce],
  );

  const addProposedAction = useCallback(
    async (action: ProposedCartAction) => {
      setAddingSuggestionId(action.id);
      try {
        await addItem.mutateAsync({
          kind: action.kind,
          name: action.name,
          description: action.description,
          quantity: action.quantity,
          unit_price: action.unitPrice,
          tier: action.tier,
          metadata: {
            source: "tech_jarvis_voice",
            job_id: jobId,
            customer_name: customerName,
            tech_question: lastQuestion,
            jarvis_source_line: action.sourceLine,
          },
        });
        setProposedCartActions((items) => items.filter((item) => item.id !== action.id));
        onOpenCart?.();
      } catch (e: any) {
        toast.error(e?.message || "Could not add JARVIS suggestion");
      } finally {
        setAddingSuggestionId(null);
      }
    },
    [addItem, customerName, jobId, lastQuestion, onOpenCart],
  );

  const dismissProposedAction = useCallback((id: string) => {
    setProposedCartActions((items) => items.filter((item) => item.id !== id));
  }, []);

  const { isRecording, loading, start, stop } = useVoiceToText({
    onTranscript: (t) => {
      transcriptRef.current = t;
      if (sendTranscriptWhenReadyRef.current && t.trim()) {
        sendTranscriptWhenReadyRef.current = false;
        askJarvis(t);
      }
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
      sendTranscriptWhenReadyRef.current = true;
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
    },
    [isRecording, stop],
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
              {proposedCartActions.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">Proposed cart actions</p>
                      <p className="text-[11px] text-muted-foreground">
                        JARVIS found priced options. Review before adding anything.
                      </p>
                    </div>
                    <Badge variant="outline" className="bg-background">
                      Needs approval
                    </Badge>
                  </div>
                  <div className="space-y-2">
                    {proposedCartActions.map((action) => (
                      <div key={action.id} className="rounded-lg border bg-background p-2.5 space-y-2">
                        <div className="flex items-start justify-between gap-2">
                          <div className="min-w-0">
                            <p className="text-sm font-semibold text-foreground leading-tight">{action.name}</p>
                            {action.description && (
                              <p className="mt-1 text-xs text-muted-foreground leading-relaxed">{action.description}</p>
                            )}
                            <div className="mt-2 flex flex-wrap items-center gap-1.5">
                              <Badge variant="secondary" className="capitalize">{action.kind}</Badge>
                              {action.tier && <Badge variant="outline" className="capitalize">{action.tier}</Badge>}
                            </div>
                          </div>
                          <p className="text-sm font-bold tabular-nums">${action.unitPrice.toFixed(2)}</p>
                        </div>
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="h-10 gap-1.5"
                            disabled={addingSuggestionId === action.id || addItem.isPending}
                            onClick={() => addProposedAction(action)}
                          >
                            {addingSuggestionId === action.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            Add to cart
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-10 w-10"
                            disabled={addingSuggestionId === action.id}
                            onClick={() => dismissProposedAction(action.id)}
                            aria-label="Dismiss suggested cart item"
                          >
                            <Trash2 className="h-3.5 w-3.5" />
                          </Button>
                        </div>
                      </div>
                    ))}
                  </div>
                </div>
              )}
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

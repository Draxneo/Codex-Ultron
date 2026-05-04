/**
 * JarvisTrainingButton.tsx — Train JARVIS feedback dialog
 *
 * SYSTEM CONNECTIONS:
 *   - Inserts into public.jarvis_training_feedback (RLS allows authenticated)
 *   - Reads card snapshot fields from props (immutable record at report time)
 *   - Used by: NowHQ.tsx, OperationsDeskV2.tsx (Intake), and any other place
 *     showing a JARVIS-generated action_item card.
 *
 * SITS ON: action_item card top-right corner. Renders a small "Train JARVIS"
 * button. Clicking opens a dialog where the user picks one or more issue
 * tags (Wrong customer / Wrong phone / Wrong address / etc.) and writes a
 * short correction. Submit saves to DB and toasts confirmation.
 *
 * Why a structured form instead of just free text:
 *   The issue_tags array makes the feedback queryable later — we can pull
 *   "show me all the times JARVIS got the customer wrong this week" without
 *   reading every free-form note. Free-form is still kept for nuance.
 *
 * Why immutable snapshot:
 *   The action_item row may get edited / merged / resolved before we review
 *   the feedback. Storing the JARVIS output verbatim at report time keeps
 *   the prompt-tightening review honest about what JARVIS actually said.
 *
 * Rule exception: This component does direct supabase.from(...).insert()
 * instead of going through an edge function. That's intentional — RLS
 * enforces auth, and skipping the edge function keeps the UX snappy
 * (single round-trip). The user's UI doesn't need to wait on a 400ms cold
 * start just to log a single feedback row.
 */

import { useState } from "react";
import { Sparkles, Loader2 } from "lucide-react";
import {
  Dialog,
  DialogContent,
  DialogDescription,
  DialogFooter,
  DialogHeader,
  DialogTitle,
  DialogTrigger,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { Checkbox } from "@/components/ui/checkbox";
import { Label } from "@/components/ui/label";
import { Textarea } from "@/components/ui/textarea";
import { supabase } from "@/integrations/supabase/client";
import { useAuth } from "@/hooks/useAuth";
import { toast } from "sonner";
import { cn } from "@/lib/utils";

export interface JarvisTrainingButtonProps {
  /** The action_item.id this feedback is about. Required. */
  actionItemId: string;
  /** Optional related FKs — captured for downstream review queries. */
  jobId?: string | null;
  customerId?: string | null;
  callId?: string | null;
  smsId?: string | null;
  /**
   * Snapshot of the JARVIS output that's being reported as wrong. Stored
   * verbatim in jarvis_training_feedback.jarvis_output. Pass whatever the
   * card is showing — title, customer fields, intent, address, intent
   * confidence, etc. Don't filter; raw blob is what we want.
   */
  jarvisOutput: Record<string, unknown>;
  /**
   * Which JARVIS path produced this output (e.g. "sms-webhook",
   * "summarize-call", "ai-task-agent"). Helps the prompt-improvement task
   * cluster feedback by source.
   */
  sourceFunction?: string | null;
  /** Visual variant. "icon" → just the sparkles button (compact). */
  variant?: "icon" | "labeled";
  className?: string;
}

/** Issue tags shown as checkboxes. Order is the display order. */
const ISSUE_TAGS: { key: string; label: string }[] = [
  { key: "wrong_customer", label: "Wrong customer" },
  { key: "wrong_phone", label: "Wrong phone number" },
  { key: "wrong_address", label: "Wrong address" },
  { key: "wrong_intent", label: "Wrong intent / category" },
  { key: "wrong_urgency", label: "Wrong urgency" },
  { key: "missed_context", label: "Missed context from transcript / message" },
  { key: "duplicate_card", label: "Duplicate of existing card" },
  { key: "should_be_relay", label: "This is a relay (answering service / Google), not a real customer" },
  { key: "other", label: "Other" },
];

export function JarvisTrainingButton({
  actionItemId,
  jobId,
  customerId,
  callId,
  smsId,
  jarvisOutput,
  sourceFunction,
  variant = "labeled",
  className,
}: JarvisTrainingButtonProps) {
  const { user } = useAuth();
  const reportedBy = user?.id ?? null;
  // Best-effort display name — falls back to email prefix if no full_name.
  // We don't fetch the profile here on every render; reviewers can join
  // jarvis_training_feedback.reported_by to profiles for the canonical name.
  const reportedByName =
    (user?.user_metadata as any)?.full_name ||
    (user?.email ? user.email.split("@")[0] : null);
  const [open, setOpen] = useState(false);
  const [selectedTags, setSelectedTags] = useState<Set<string>>(new Set());
  const [feedback, setFeedback] = useState("");
  const [submitting, setSubmitting] = useState(false);

  const toggleTag = (key: string) => {
    setSelectedTags((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key);
      else next.add(key);
      return next;
    });
  };

  const reset = () => {
    setSelectedTags(new Set());
    setFeedback("");
    setSubmitting(false);
  };

  const submit = async () => {
    if (!feedback.trim()) {
      toast.error("Tell JARVIS what was wrong before submitting");
      return;
    }
    setSubmitting(true);
    const { error } = await supabase.from("jarvis_training_feedback").insert({
      action_item_id: actionItemId,
      job_id: jobId ?? null,
      customer_id: customerId ?? null,
      related_call_id: callId ?? null,
      related_sms_id: smsId ?? null,
      issue_tags: Array.from(selectedTags),
      user_feedback: feedback.trim(),
      jarvis_output: jarvisOutput ?? {},
      source_function: sourceFunction ?? null,
      reported_by: reportedBy,
      reported_by_name: reportedByName,
    });
    setSubmitting(false);
    if (error) {
      console.error("[JarvisTrainingButton] insert error:", error);
      toast.error("Couldn't save feedback. Please try again.");
      return;
    }
    toast.success("Saved. JARVIS will be better next time.");
    setOpen(false);
    reset();
  };

  return (
    <Dialog open={open} onOpenChange={(v) => { setOpen(v); if (!v) reset(); }}>
      <DialogTrigger asChild>
        {variant === "icon" ? (
          <Button
            variant="ghost"
            size="icon"
            className={cn("h-8 w-8 text-muted-foreground hover:text-foreground", className)}
            title="Train JARVIS — tell us what went wrong"
            aria-label="Train JARVIS"
          >
            <Sparkles className="h-4 w-4" />
          </Button>
        ) : (
          <Button
            variant="ghost"
            size="sm"
            className={cn("h-8 gap-1.5 text-xs text-muted-foreground hover:text-foreground", className)}
            title="Train JARVIS — tell us what went wrong"
          >
            <Sparkles className="h-3.5 w-3.5" />
            Train JARVIS
          </Button>
        )}
      </DialogTrigger>
      <DialogContent className="max-w-lg">
        <DialogHeader>
          <DialogTitle className="flex items-center gap-2">
            <Sparkles className="h-4 w-4" />
            Train JARVIS
          </DialogTitle>
          <DialogDescription>
            Tell JARVIS what it got wrong on this card. Your notes go to the
            training queue and will be used to tighten the prompts that
            generated this output.
          </DialogDescription>
        </DialogHeader>

        <div className="space-y-4 py-2">
          <div>
            <Label className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              What went wrong? (pick any)
            </Label>
            <div className="mt-2 grid grid-cols-1 gap-1.5 sm:grid-cols-2">
              {ISSUE_TAGS.map(({ key, label }) => (
                <label
                  key={key}
                  className="flex cursor-pointer items-start gap-2 rounded-md border border-border bg-card/40 px-2.5 py-1.5 text-xs hover:bg-card"
                >
                  <Checkbox
                    checked={selectedTags.has(key)}
                    onCheckedChange={() => toggleTag(key)}
                    className="mt-0.5 h-3.5 w-3.5"
                  />
                  <span className="leading-snug">{label}</span>
                </label>
              ))}
            </div>
          </div>

          <div>
            <Label htmlFor="jarvis-feedback" className="text-xs font-semibold uppercase tracking-wide text-muted-foreground">
              What should JARVIS have done instead?
            </Label>
            <Textarea
              id="jarvis-feedback"
              value={feedback}
              onChange={(e) => setFeedback(e.target.value)}
              placeholder="Example: This came from the answering service number, so the customer is whoever was named in the message body — not the relay number itself."
              className="mt-2 min-h-[100px] text-sm"
              autoFocus
            />
          </div>
        </div>

        <DialogFooter className="gap-2">
          <Button variant="ghost" onClick={() => setOpen(false)} disabled={submitting}>
            Cancel
          </Button>
          <Button onClick={submit} disabled={submitting || !feedback.trim()}>
            {submitting ? (
              <>
                <Loader2 className="mr-2 h-4 w-4 animate-spin" />
                Saving
              </>
            ) : (
              "Send to JARVIS"
            )}
          </Button>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
}

/**
 * TechJarvisPushToTalk - field-first voice assistant for tech jobs.
 *
 * The tech workflow is intentionally simple:
 * take pictures, talk to JARVIS, and capture clean field notes.
 */

import { useState, useCallback, useRef } from "react";
import { useQuery } from "@tanstack/react-query";
import { Camera, Check, HelpCircle, Loader2, Mic, ShoppingCart, Sparkles, Trash2, Volume2 } from "lucide-react";
import { Card } from "@/components/ui/card";
import { Button } from "@/components/ui/button";
import { Badge } from "@/components/ui/badge";
import { useVoiceToText } from "@/hooks/useVoiceToText";
import { useAnnouncer } from "@/hooks/useAnnouncer";
import { useJobCart, type JobCartItem, type NewCartItem } from "@/hooks/useJobCart";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";
import { supabase } from "@/integrations/supabase/client";
import { cn } from "@/lib/utils";
import { buildDefaultDecisionMetadata } from "@/lib/customerDecisionStory";
import {
  interpretTechCartSpeech,
  mergeFollowUpAnswer,
  type TechCartFollowUpQuestion,
} from "@/lib/techCartInterpreter";
import { toast } from "sonner";

interface Props {
  jobId: string;
  jobNumber?: string | null;
  customerName?: string | null;
  /** Render without outer Card chrome (used inside TechCollapsibleCard) */
  bare?: boolean;
  onOpenCart?: () => void;
  onOpenPhotos?: () => void;
  enableProposalActions?: boolean;
}

type ProposedCartAction = {
  id: string;
  name: string;
  description: string | null;
  unitPrice: number;
  quantity: number;
  kind: NewCartItem["kind"];
  tier: JobCartItem["tier"];
  sourceId?: string | null;
  confidence?: "high" | "medium" | "low";
  missingSpecs?: string[];
  metadata?: Record<string, unknown>;
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

function inferEquipmentTier(tier: string | null | undefined): JobCartItem["tier"] {
  const lower = String(tier || "").toLowerCase();
  if (lower.includes("ultimate") || lower.includes("infinity") || lower.includes("best")) return "best";
  if (lower.includes("better") || lower.includes("performance")) return "better";
  if (lower.includes("good") || lower.includes("comfort") || lower.includes("value")) return "good";
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
      sourceId: null,
      confidence: "low",
      missingSpecs: ["catalog match"],
      sourceLine: line,
    });

    if (suggestions.length >= 6) break;
  }

  return suggestions;
}

function mergeCartSuggestions(primary: ProposedCartAction[], secondary: ProposedCartAction[]) {
  const seen = new Set<string>();
  const merged: ProposedCartAction[] = [];
  for (const item of [...primary, ...secondary]) {
    const key = `${item.sourceId || item.name.toLowerCase()}-${Math.round(item.unitPrice)}`;
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(item);
  }
  return merged.slice(0, 8);
}

async function suggestCatalogTrainingPhrase(action: ProposedCartAction, phrase: string | null) {
  const cleanPhrase = phrase?.trim().replace(/\s+/g, " ");
  if (!cleanPhrase || cleanPhrase.length < 4 || cleanPhrase.length > 180) return;
  if (!action.sourceId || action.confidence === "high") return;
  const targetType = action.kind === "equipment" ? "equipment" : action.kind === "repair" ? "repair" : null;
  if (!targetType) return;

  const { data: existing, error: existingError } = await supabase
    .from("jarvis_catalog_terms" as any)
    .select("id")
    .eq("target_type", targetType)
    .eq("target_id", action.sourceId)
    .ilike("phrase", cleanPhrase)
    .maybeSingle();
  if (existingError || existing?.id) return;

  await supabase.from("jarvis_catalog_terms" as any).insert({
    target_type: targetType,
    target_id: action.sourceId,
    phrase: cleanPhrase,
    status: "suggested",
    source: "tech_correction",
    confidence: 0.65,
    notes: "A technician accepted this JARVIS cart match. Review before approving as a reusable phrase.",
  });
}

export function TechJarvisPushToTalk({
  jobId,
  jobNumber,
  customerName,
  bare = false,
  onOpenCart,
  onOpenPhotos,
  enableProposalActions = true,
}: Props) {
  const [thinking, setThinking] = useState(false);
  const [lastReply, setLastReply] = useState<string | null>(null);
  const [lastQuestion, setLastQuestion] = useState<string | null>(null);
  const [proposedCartActions, setProposedCartActions] = useState<ProposedCartAction[]>([]);
  const [followUpQuestions, setFollowUpQuestions] = useState<TechCartFollowUpQuestion[]>([]);
  const [addingSuggestionId, setAddingSuggestionId] = useState<string | null>(null);
  const transcriptRef = useRef<string>("");
  const sendTranscriptWhenReadyRef = useRef(false);
  const { announce } = useAnnouncer();
  const { addItem } = useJobCart(jobId);
  const { employeeId } = useEffectiveAuth();
  const { data: repairCatalog = [] } = useQuery({
    queryKey: ["repair-catalog-tech-jarvis"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("repair_catalog")
        .select("id, name, category, tech_description, customer_description, keywords, default_severity, base_price, member_price, is_active")
        .eq("is_active", true);
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const { data: equipmentMatchups = [] } = useQuery({
    queryKey: ["equipment-matchups-tech-jarvis"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("equipment_matchups" as any)
        .select("id, brand, system_type, tier, application, condenser_model, furnace_model, coil_model, tonnage, seer2, eer2, hspf2, cooling_cap, afue, ahri_number, ahri_certificate_path, heat_kit, total_price, factory_rebate_price, monthly_payment, monthly_payment_120, cps_tonnage, early_rebate, burnout_rebate, notes, low_margin_price, cps_rebate_tier, features_benefits, image_url")
        .order("brand")
        .order("tonnage")
        .order("tier");
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });
  const { data: jarvisCatalogTerms = [] } = useQuery({
    queryKey: ["jarvis-catalog-terms-tech-jarvis"],
    queryFn: async () => {
      const { data, error } = await supabase
        .from("jarvis_catalog_terms" as any)
        .select("id, target_type, target_id, phrase, status, source, confidence")
        .eq("status", "approved");
      if (error) throw error;
      return data || [];
    },
    staleTime: 5 * 60 * 1000,
  });

  const askJarvis = useCallback(
    async (text: string) => {
      const question = text.trim();
      if (!question) return;
      setLastQuestion(question);
      setProposedCartActions([]);
      setFollowUpQuestions([]);
      setThinking(true);
      let transcriptId: string | null = null;
      try {
        const interpreted = enableProposalActions
          ? interpretTechCartSpeech(question, repairCatalog as any, equipmentMatchups as any, jarvisCatalogTerms as any)
          : { matches: [], questions: [] };
        const fieldLanguageItems: ProposedCartAction[] = interpreted.matches.map((match) => ({
          id: `field-${match.id}`,
          name: match.name,
          description: match.description,
          unitPrice: match.unitPrice,
          quantity: 1,
          kind: match.sourceType === "equipment" ? "equipment" : match.sourceType === "custom" ? "custom" : "repair",
          tier:
            match.sourceType === "equipment"
              ? inferEquipmentTier((match.metadata?.tier as string | null) || match.equipmentMatchup?.tier || null)
              : match.sourceType === "custom" ? "recommended"
              : match.catalogItem?.default_severity === "necessary" ? "critical" : "recommended",
          sourceId: match.sourceId,
          confidence: match.confidence,
          missingSpecs: match.missingSpecs,
          metadata: match.metadata,
          sourceLine: match.sourcePhrase,
        }));
        if (fieldLanguageItems.length > 0) {
          setProposedCartActions(fieldLanguageItems);
          setFollowUpQuestions(interpreted.questions);
        }

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
              workflow: enableProposalActions ? "tech_jarvis_proposal" : "tech_jarvis_field_notes",
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
          enableProposalActions
            ? "Tech workflow: photos plus voice notes should become repair/replacement recommendations, priced proposal options, and a customer-ready approval/payment link."
            : "Tech workflow: photos plus voice notes should become clear field notes, diagnosis summaries, repair/replacement recommendations, and next-step guidance.",
          "When discussing replacement equipment, think like the field team: brand, tonnage, system type, tier, then orientation/install location. Example: Carrier 3 ton Performance gas heat system in the attic.",
          "When discussing repairs, think like the field team: contactor, dual run capacitor, condenser fan motor, blower motor, drain flush, thermostat, control board, TXV, coil cleaning. Match field slang to the pricebook/catalog when possible.",
          "Do not force variable OEM specialty parts into the pricebook. Control boards, CPU boards, inverter boards, ECM/variable-speed blower motors, and unusual OEM motors should become CUSTOM cart options with a clean label like 'OEM replacement part - CPU/control board'. Ask for the price if the tech did not say it.",
          "If the tech is trying to add a cart item but an important detail is missing, ask one simple follow-up question instead of guessing. Examples: capacitor MFD, motor horsepower, motor voltage.",
          enableProposalActions
            ? "If the tech describes options, respond with clear proposal item names, prices to confirm, and what should be sent to the customer. Keep customer-facing sends human-approved."
            : "Do not create cart actions in this view. Focus on what the technician found, what still needs proof, and the clean next step.",
          enableProposalActions
            ? "When recommending proposal choices, add a final section named CART OPTIONS. Put each priced option on one line like: Option A: Replace capacitor | price: $289 | description: Includes part, labor, testing."
            : "If pricing is mentioned, summarize it as field context only. The proposal workspace can handle cart creation later.",
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
        const aiItems = enableProposalActions ? parseJarvisCartSuggestions(reply) : [];
        const suggestedItems = mergeCartSuggestions(fieldLanguageItems, aiItems);
        setLastReply(reply);
        setProposedCartActions(suggestedItems);
        setFollowUpQuestions(interpreted.questions);
        if (transcriptId) {
          const { error: transcriptUpdateError } = await (supabase as any)
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
                source_id: item.sourceId || null,
                confidence: item.confidence || null,
                missing_specs: item.missingSpecs || [],
                metadata: item.metadata || null,
              })),
              metadata: {
                job_number: jobNumber || null,
                customer_name: customerName || null,
                workflow: enableProposalActions ? "tech_jarvis_proposal" : "tech_jarvis_field_notes",
                jarvis_follow_up_questions: interpreted.questions,
              },
            })
            .eq("id", transcriptId);
          if (transcriptUpdateError) {
            console.warn("[TechJarvisPushToTalk] Could not save JARVIS response", transcriptUpdateError);
            toast.warning("JARVIS answered, but the office may not see this field note until it syncs.");
          }
        }
        if (suggestedItems.length > 0) {
          const { error: actionError } = await (supabase as any)
            .from("action_items")
            .insert({
              title: `Review tech proposal for ${customerName || jobNumber || "job"}`,
              description: `${suggestedItems.length} proposal item${suggestedItems.length === 1 ? "" : "s"} detected from the tech voice note.\n\n${question.slice(0, 500)}`,
              category: "tech_field_update",
              priority: "high",
              source: "tech_jarvis_voice",
              status: "pending",
              job_id: jobId,
              suggested_action: "Review the tech's proposal items, then approve/send the customer presentation.",
              metadata: {
                transcript_id: transcriptId,
                job_number: jobNumber || null,
                customer_name: customerName || null,
                suggested_item_count: suggestedItems.length,
                suggested_items: suggestedItems.map((item) => ({
                  name: item.name,
                  unit_price: item.unitPrice,
                  kind: item.kind,
                  tier: item.tier,
                  source_id: item.sourceId || null,
                  confidence: item.confidence || null,
                  missing_specs: item.missingSpecs || [],
                  metadata: item.metadata || null,
                })),
                follow_up_questions: interpreted.questions,
              },
            });
          if (actionError) {
            console.warn("[TechJarvisPushToTalk] Could not surface proposal review card", actionError);
            toast.warning("Proposal items were detected, but the office Now card did not save.");
          }
        }
        announce(reply);
      } catch (e: any) {
        toast.error(e?.message || "JARVIS failed to respond");
      } finally {
        setThinking(false);
      }
    },
    [jobId, jobNumber, customerName, employeeId, announce, enableProposalActions, repairCatalog, equipmentMatchups, jarvisCatalogTerms],
  );

  const addProposedAction = useCallback(
    async (action: ProposedCartAction) => {
      setAddingSuggestionId(action.id);
      try {
        await addItem.mutateAsync({
          kind: action.kind,
          source_id: action.sourceId || null,
          name: action.name,
          description: action.description,
          quantity: action.quantity,
          unit_price: action.unitPrice,
          tier: action.tier,
          metadata: {
            ...buildDefaultDecisionMetadata(action),
            source: "tech_jarvis_voice",
            job_id: jobId,
            customer_name: customerName,
            tech_question: lastQuestion,
            jarvis_source_line: action.sourceLine,
            jarvis_confidence: action.confidence || null,
            jarvis_missing_specs: action.missingSpecs || [],
            ...(action.metadata || {}),
          },
        });
        void suggestCatalogTrainingPhrase(action, lastQuestion);
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

  const answerFollowUp = useCallback(
    (question: TechCartFollowUpQuestion, answer: string) => {
      if (!lastQuestion) return;
      setFollowUpQuestions((items) => items.filter((item) => item.id !== question.id));
      void askJarvis(mergeFollowUpAnswer(lastQuestion, answer));
    },
    [askJarvis, lastQuestion],
  );

  const { isRecording, loading, start, stop } = useVoiceToText({
    context: "tech_jarvis",
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

      {!bare && (
        <div className="w-full rounded-xl border border-purple-500/20 bg-purple-500/5 p-3">
          <p className="text-sm font-semibold text-foreground">Field notes</p>
        </div>
      )}

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
          ? "Listening"
          : thinking
            ? "Thinking"
            : loading
              ? "Transcribing"
              : "Hold to talk"}
      </p>

      <div className={cn("grid gap-2 w-full", enableProposalActions ? "grid-cols-2" : "grid-cols-1")}>
        <Button type="button" variant="outline" className="h-12 gap-2" onClick={onOpenPhotos}>
          <Camera className="h-4 w-4" /> Photos
        </Button>
        {enableProposalActions && (
          <Button type="button" variant="outline" className="h-12 gap-2" onClick={onOpenCart}>
            <ShoppingCart className="h-4 w-4" /> Quote
          </Button>
        )}
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
              {enableProposalActions && followUpQuestions.length > 0 && (
                <div className="rounded-xl border border-sky-500/30 bg-sky-500/5 p-3 space-y-3">
                  <div className="flex items-start gap-2">
                    <HelpCircle className="mt-0.5 h-4 w-4 shrink-0 text-sky-600" />
                    <div>
                      <p className="text-sm font-semibold text-foreground">JARVIS needs one detail</p>
                      <p className="text-[11px] text-muted-foreground">
                        Tap the answer instead of typing. JARVIS will tighten the cart suggestion.
                      </p>
                    </div>
                  </div>
                  {followUpQuestions.map((question) => (
                    <div key={question.id} className="space-y-2">
                      <p className="text-sm font-semibold leading-tight text-foreground">{question.question}</p>
                      <div className="flex flex-wrap gap-1.5">
                        {question.options.map((option) => (
                          <Button
                            key={option}
                            type="button"
                            size="sm"
                            variant="outline"
                            className="h-9 rounded-full px-3 text-xs"
                            disabled={thinking || loading}
                            onClick={() => answerFollowUp(question, option)}
                          >
                            {option}
                          </Button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
              {enableProposalActions && proposedCartActions.length > 0 && (
                <div className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 space-y-3">
                  <div className="flex items-center justify-between gap-2">
                    <div>
                      <p className="text-sm font-semibold text-foreground">JARVIS cart suggestions</p>
                      <p className="text-[11px] text-muted-foreground">
                        Field language matched to the catalog. Review before adding anything.
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
                              {action.confidence && (
                                <Badge variant="outline" className="capitalize">{action.confidence} confidence</Badge>
                              )}
                              {action.missingSpecs && action.missingSpecs.length > 0 && (
                                <Badge variant="outline" className="border-sky-500/40 bg-sky-500/10 text-sky-700 dark:text-sky-300">
                                  needs {action.missingSpecs.join(" + ")}
                                </Badge>
                              )}
                            </div>
                          </div>
                          <p className="text-sm font-bold tabular-nums">
                            {action.unitPrice > 0 ? `$${action.unitPrice.toFixed(2)}` : "No price"}
                          </p>
                        </div>
                        <div className="grid grid-cols-[1fr_auto] gap-2">
                          <Button
                            type="button"
                            size="sm"
                            className="h-10 gap-1.5"
                            disabled={
                              addingSuggestionId === action.id ||
                              addItem.isPending ||
                              action.unitPrice <= 0 ||
                              Boolean(action.missingSpecs?.length)
                            }
                            onClick={() => addProposedAction(action)}
                          >
                            {addingSuggestionId === action.id ? (
                              <Loader2 className="h-3.5 w-3.5 animate-spin" />
                            ) : (
                              <Check className="h-3.5 w-3.5" />
                            )}
                            {action.unitPrice <= 0
                              ? "Needs price"
                              : action.missingSpecs?.length
                                ? "Answer first"
                                : "Add to proposal"}
                          </Button>
                          <Button
                            type="button"
                            size="icon"
                            variant="outline"
                            className="h-10 w-10"
                            disabled={addingSuggestionId === action.id}
                            onClick={() => dismissProposedAction(action.id)}
                            aria-label="Dismiss suggested proposal item"
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
                {enableProposalActions && (
                  <Button type="button" size="sm" className="h-9 gap-1.5" onClick={onOpenCart}>
                    <ShoppingCart className="h-3.5 w-3.5" /> Build proposal
                  </Button>
                )}
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

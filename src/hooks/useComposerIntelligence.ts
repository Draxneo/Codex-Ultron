import { useState, useCallback, type ChangeEvent, type FocusEvent, type RefObject } from "react";
import { useAutoCorrect, runFinalCorrectionPass, type AutoCorrectMode } from "@/hooks/useAutoCorrect";
import { polishText } from "@/lib/grammarPolish";

/**
 * useComposerIntelligence — single source of truth for composer text intelligence.
 *
 * Layers (all configurable, all default-on):
 *   1. Real-time dictionary autocorrect (as the user types)
 *   2. Final dictionary pass on blur (catches typos when no word boundary fired)
 *   3. AI grammar polish on send with accept/reject preview
 *
 * Use this for ALL composer surfaces (SMS, email, chat, copilot) so the user
 * gets identical correction behavior everywhere. Composers stay responsible for
 * their own UI (attachments, templates, etc.) — this hook just owns the text
 * pipeline + the preview state.
 *
 * Usage:
 *   const c = useComposerIntelligence({
 *     value: body,
 *     setValue: setBody,
 *     context: "sms",
 *     onSend: async (text) => sendSms(to, text),
 *   });
 *   // wire <Input ref={c.inputRef} value={body} onChange={c.handleChange} onBlur={c.handleBlur} />
 *   // wire <Button onClick={c.handleSend} disabled={c.isBusy} />
 *   // render {c.preview && <GrammarPreview ... onAccept={c.acceptPolish} onReject={c.rejectPolish} onCancel={c.cancelPolish} />}
 */
export interface UseComposerIntelligenceOptions {
  value: string;
  setValue: (value: string) => void;
  /** Context hint for the AI polish — different prompts for sms/email/chat. */
  context?: "sms" | "email" | "chat";
  /** Real-time autocorrect aggressiveness. Default "safe". */
  mode?: AutoCorrectMode;
  /** Skip AI polish entirely (still runs typing + blur passes). */
  skipPolish?: boolean;
  /** Skip the on-blur final dictionary pass. */
  skipBlurPass?: boolean;
  /** Called with the final corrected text. Return true on success to clear preview. */
  onSend: (text: string) => Promise<boolean | void> | boolean | void;
}

export interface ComposerPreview {
  original: string;
  polished: string;
}

export interface UseComposerIntelligenceResult {
  inputRef: RefObject<any>;
  handleChange: (e: ChangeEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  handleBlur: (e?: FocusEvent<HTMLInputElement | HTMLTextAreaElement>) => void;
  /** Call this from your Send button. Runs final-pass + polish + (preview or send). */
  handleSend: () => Promise<void>;
  /** True while AI grammar check is running. */
  polishing: boolean;
  /** True while polishing OR while preview is awaiting user decision. */
  isBusy: boolean;
  /** Non-null when the AI suggested a correction the user hasn't acted on. */
  preview: ComposerPreview | null;
  acceptPolish: () => void;
  rejectPolish: () => void;
  cancelPolish: () => void;
}

export function useComposerIntelligence(
  opts: UseComposerIntelligenceOptions
): UseComposerIntelligenceResult {
  // 2026-05-04: AI grammar polish (layer 3) defaults to OFF now that Whisper
  // dictation produces clean text and we still have keystroke autocorrect
  // (layer 1, mode="safe") + the on-blur dictionary pass (layer 2). The AI
  // polish was firing on every send with a preview dialog — overkill that
  // interrupted the user's flow without adding much over the dictionary
  // passes. To opt back in: pass `skipPolish: false` explicitly.
  const { value, setValue, context = "sms", mode = "safe", skipPolish = true, skipBlurPass, onSend } = opts;

  const { handleChange, inputRef } = useAutoCorrect(value, setValue, mode);
  const [polishing, setPolishing] = useState(false);
  const [preview, setPreview] = useState<ComposerPreview | null>(null);

  const handleBlur = useCallback(() => {
    if (skipBlurPass || !value) return;
    const fixed = runFinalCorrectionPass(value, mode);
    if (fixed !== value) setValue(fixed);
  }, [value, setValue, mode, skipBlurPass]);

  const performSend = useCallback(
    async (text: string) => {
      const result = await onSend(text);
      // If onSend returned false explicitly, leave the preview up so user can retry.
      // Otherwise (true/undefined/void), clear it.
      if (result !== false) setPreview(null);
    },
    [onSend]
  );

  const handleSend = useCallback(async () => {
    if (!value.trim() || polishing) return;

    // 1) Local final dictionary pass — catches typos when the user never hit a word boundary.
    const localFixed = runFinalCorrectionPass(value.trim(), mode);

    if (skipPolish) {
      await performSend(localFixed);
      return;
    }

    // 2) AI grammar polish — show preview if it changed anything material.
    setPolishing(true);
    try {
      const polished = await polishText(localFixed, context);
      setPolishing(false);
      if (polished && polished.trim() !== localFixed.trim()) {
        setValue(localFixed);
        setPreview({ original: localFixed, polished: polished.trim() });
        return; // wait for user accept/reject
      }
      await performSend(localFixed);
    } catch {
      setPolishing(false);
      // Polish failed → just send the locally-corrected text.
      await performSend(localFixed);
    }
  }, [value, polishing, mode, skipPolish, context, setValue, performSend]);

  const acceptPolish = useCallback(() => {
    if (!preview) return;
    const text = preview.polished;
    setValue(text);
    performSend(text);
  }, [preview, setValue, performSend]);

  const rejectPolish = useCallback(() => {
    if (!preview) return;
    const text = preview.original;
    setPreview(null);
    performSend(text);
  }, [preview, performSend]);

  const cancelPolish = useCallback(() => setPreview(null), []);

  return {
    inputRef,
    handleChange,
    handleBlur,
    handleSend,
    polishing,
    isBusy: polishing || preview !== null,
    preview,
    acceptPolish,
    rejectPolish,
    cancelPolish,
  };
}

/**
 * useIsOnCall — Single source of truth for "user is engaged on a live call".
 *
 * Returns true while the softphone status is `connecting` or `on-call`.
 * Used by notification hooks (email, SMS, chat, desktop) to suppress
 * toast/desktop popups so JARVIS doesn't distract the user mid-conversation.
 *
 * Incoming `ringing` is intentionally NOT suppressed — that's the user's cue
 * that someone is calling and is handled separately by the softphone UI.
 */
import { useSoftphoneContext } from "@/components/SoftphoneProvider";

const ACTIVE_CALL_STATUSES = new Set(["connecting", "on-call"]);

export function useIsOnCall(): boolean {
  const { status } = useSoftphoneContext();
  return ACTIVE_CALL_STATUSES.has(status);
}

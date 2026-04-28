/**
 * SmsLogContext — Lifts useSmsLog into a global provider so the realtime
 * subscription is ALWAYS live and the conversation list is pre-warmed.
 *
 * BEFORE: useSmsLog was only mounted when SmsPanel was rendered. If the user
 * was anywhere else (Mission Control, Jobs, etc.) when an inbound SMS arrived,
 * the announcer would speak instantly but the SMS feed wasn't subscribed —
 * so when the user finally opened SMS, fetchMessages had to run from scratch
 * (500-row fetch + pinned team query + contact map build = noticeable lag).
 *
 * AFTER: SmsLogProvider mounts once at the app shell (after auth), keeping
 * realtime subscribed and state warm. SmsPanel reads from context, so the
 * UI is instantaneous when navigating to it.
 */
import { createContext, useContext, ReactNode } from "react";
import { useSmsLog } from "@/hooks/useSmsLog";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";

type SmsLogContextValue = ReturnType<typeof useSmsLog>;

const SmsLogContext = createContext<SmsLogContextValue | null>(null);

export function SmsLogProvider({ children }: { children: ReactNode }) {
  const { role, employeeId, user } = useEffectiveAuth();
  const value = useSmsLog({ role, employeeId, userId: user?.id ?? null });
  return <SmsLogContext.Provider value={value}>{children}</SmsLogContext.Provider>;
}

/**
 * Returns the global SMS log context, or null if no provider is mounted
 * (e.g., on public/embedded routes). Consumers should fall back to a local
 * useSmsLog() call when this returns null.
 */
export function useSmsLogContextOptional(): SmsLogContextValue | null {
  return useContext(SmsLogContext);
}

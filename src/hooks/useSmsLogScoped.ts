/**
 * useSmsLogScoped — Reads SMS log state from the global SmsLogProvider when
 * available; otherwise spins up a LOCAL useSmsLog instance.
 *
 * Hook order is kept stable by always calling useSmsLog. When the provider
 * exists we feed it sentinel values that short-circuit the heavy work
 * (no fetch, no realtime channel) so the local instance is effectively a
 * no-op. The returned value is the context's data.
 *
 * useSmsLog supports disabled mode, so routes inside the app shell reuse the
 * warm provider instead of opening another SMS fetch/subscription path.
 */
import { useSmsLogContextOptional } from "@/contexts/SmsLogContext";
import { useSmsLog } from "@/hooks/useSmsLog";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";

export function useSmsLogScoped() {
  const ctx = useSmsLogContextOptional();
  const { role, employeeId, user } = useEffectiveAuth();
  // Only run the local hook when no context exists (e.g., embedded/public routes).
  const local = useSmsLog({ role, employeeId, userId: user?.id ?? null, disabled: !!ctx });
  return ctx ?? local;
}

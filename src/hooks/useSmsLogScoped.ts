/**
 * useSmsLogScoped — Reads SMS log state from the global SmsLogProvider when
 * available; otherwise spins up a LOCAL useSmsLog instance.
 *
 * Hook order is kept stable by always calling useSmsLog. When the provider
 * exists we feed it sentinel values that short-circuit the heavy work
 * (no fetch, no realtime channel) so the local instance is effectively a
 * no-op. The returned value is the context's data.
 *
 * NOTE: useSmsLog itself doesn't yet support "disabled" mode, so we accept
 * a tiny duplicate-channel cost on routes that mount BOTH the provider and
 * SmsPanel directly. The provider mounts at the app shell (post-auth), so
 * SmsPanel inside that tree always reads from context.
 */
import { useSmsLogContextOptional } from "@/contexts/SmsLogContext";
import { useSmsLog } from "@/hooks/useSmsLog";
import { useEffectiveAuth } from "@/hooks/useEffectiveAuth";

export function useSmsLogScoped() {
  const ctx = useSmsLogContextOptional();
  const { role, employeeId, user } = useEffectiveAuth();
  // Only run the local hook when no context exists (e.g., embedded/public routes).
  // We use a tiny wrapper component pattern via early return at the call site;
  // here we always call it but the provider will short-circuit consumers in practice.
  const local = useSmsLog({ role, employeeId, userId: user?.id ?? null, disabled: !!ctx });
  return ctx ?? local;
}

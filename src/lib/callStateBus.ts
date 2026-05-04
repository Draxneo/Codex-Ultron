/**
 * callStateBus — Module-level singleton tracking whether the user is on a
 * live call. Decoupled from React context so non-React code (like the
 * announcer's audio playback loop) can check synchronously.
 *
 * Updated by SoftphoneProvider whenever softphone status changes.
 * Read by useAnnouncer at every playback boundary so that even queued or
 * mid-flight announcements get suppressed the moment a call connects.
 */

type Listener = (onCall: boolean) => void;

let _onCall = false;
const listeners = new Set<Listener>();

export function setOnCall(value: boolean) {
  if (_onCall === value) return;
  _onCall = value;
  listeners.forEach((l) => {
    try { l(value); } catch { /* ignore */ }
  });
}

export function isOnCall(): boolean {
  return _onCall;
}

export function subscribeOnCall(listener: Listener): () => void {
  listeners.add(listener);
  return () => listeners.delete(listener);
}

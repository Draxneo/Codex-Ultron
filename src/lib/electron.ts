/**
 * Electron environment detection & IPC bridge.
 *
 * The Electron main process exposes a `window.electronAPI` object via
 * contextBridge (preload script). This module provides helpers so the
 * rest of the app can interact with it safely — everything is a no-op
 * when running in a regular browser.
 */

const DIAL_REQUEST_STORAGE_KEY = "softphone:dial-request";
const DIAL_REQUEST_TTL_MS = 30_000;

interface StoredDialRequest {
  number: string;
  contactName?: string;
  jobId?: string;
  customerId?: string;
  ts: number;
}

function parseStoredDialRequest(raw: string | null): StoredDialRequest | null {
  if (!raw) return null;

  try {
    const parsed = JSON.parse(raw) as StoredDialRequest;
    if (!parsed?.number || typeof parsed.number !== "string") return null;
    if (!parsed.ts || Date.now() - parsed.ts > DIAL_REQUEST_TTL_MS) return null;
    return parsed;
  } catch {
    return null;
  }
}

export function isElectron(): boolean {
  return (
    (typeof navigator !== "undefined" && /Electron/i.test(navigator.userAgent)) ||
    (typeof window !== "undefined" && Boolean((window as any).electronAPI))
  );
}

/** True when this window is the Electron pop-out softphone window */
export function isElectronPopout(): boolean {
  if (!isElectron()) return false;
  return new URLSearchParams(window.location.search).get("view") === "softphone";
}

/** True when this is the Electron MAIN window (not the pop-out) */
export function isElectronMain(): boolean {
  return isElectron() && !isElectronPopout();
}

/**
 * Send a message to the Electron main process.
 * No-op in a regular browser.
 */
export function sendToMain(channel: string, data?: unknown): void {
  try {
    const api = (window as any).electronAPI;
    if (api?.send) {
      api.send(channel, data);
    }
  } catch {
    // Not in Electron or preload not wired — silently ignore
  }
}

/**
 * Legacy pop-out dial handoff kept for compatibility with older flows.
 */
export function sendDialToPopout(number: string, contactName?: string, jobId?: string, customerId?: string): void {
  if (!isElectron()) return;

  const payload = { number, contactName, jobId, customerId };
  sendToMain("ensure-phone-window");

  [0, 200, 700, 1500].forEach((delay) => {
    window.setTimeout(() => sendToMain("dial-number", payload), delay);
  });

  try {
    const backup: StoredDialRequest = {
      number,
      contactName,
      jobId,
      customerId,
      ts: Date.now(),
    };
    localStorage.setItem(DIAL_REQUEST_STORAGE_KEY, JSON.stringify(backup));
  } catch {
    // ignore storage failures
  }
}

/** Last dial request from backup storage (if still fresh). */
export function getStoredDialRequest(): { number: string; contactName?: string; jobId?: string; customerId?: string } | null {
  try {
    const parsed = parseStoredDialRequest(localStorage.getItem(DIAL_REQUEST_STORAGE_KEY));
    if (!parsed) return null;
    return { number: parsed.number, contactName: parsed.contactName, jobId: parsed.jobId, customerId: parsed.customerId };
  } catch {
    return null;
  }
}

/** Clears the backup dial request after it's consumed. */
export function clearStoredDialRequest(): void {
  try {
    localStorage.removeItem(DIAL_REQUEST_STORAGE_KEY);
  } catch {
    // ignore
  }
}

/**
 * Listen for a message from the Electron main process.
 * Returns an unsubscribe function. No-op in a regular browser.
 */
export function onMainMessage(channel: string, handler: (...args: any[]) => void): () => void {
  try {
    const api = (window as any).electronAPI;
    if (api?.on) {
      const wrappedHandler = (...args: any[]) => {
        // Some preload bridges pass only payload, others pass (event, ...args).
        // Normalize so listeners expecting (_event, payload) always work.
        if (args.length <= 1) {
          handler(undefined, args[0]);
          return;
        }
        handler(...args);
      };

      api.on(channel, wrappedHandler);
      return () => api.off?.(channel, wrappedHandler);
    }
  } catch {
    // ignore
  }
  return () => {};
}

/**
 * Show a custom toast notification on the secondary monitor via Electron.
 * Falls back to browser Notification API when not in Electron.
 */
export function showElectronToast(opts: {
  title: string;
  body: string;
  icon?: string;
  variant?: 'default' | 'destructive' | 'call';
}): boolean {
  if (!isElectron()) return false;
  sendToMain('show-toast', opts);
  return true;
}

/**
 * Open a dedicated CSR Intake window via Electron IPC.
 * The main process should handle 'open-csr-intake' by creating a new
 * BrowserWindow pointing at /?view=csr-intake&phone=...&name=...&sid=...
 * Pass `callSid` as soon as it's known (Twilio assigns it slightly after
 * the call starts) so the popup can subscribe to live transcripts by SID.
 */
export function openCsrIntakeWindow(phone: string, callerName?: string, callSid?: string): void {
  if (!isElectron()) return;
  sendToMain('open-csr-intake', { phone, callerName, callSid });
}

/**
 * Tell the CSR Intake popup that the active call has ended. The popup uses
 * this to swap from "Live Transcript" → "Last Call Transcript" and stop the
 * realtime subscription.
 */
export function notifyCsrCallEnded(callSid?: string): void {
  if (!isElectron()) return;
  sendToMain('csr-call-ended', { callSid: callSid || '' });
}

/**
 * OS-level audible beep via Electron's shell.beep().
 * Bypasses any renderer-level audio gating (screen off, suspended AudioContext).
 * No-op outside Electron.
 */
export function playSystemBeep(): void {
  try {
    const api = (window as any).electronAPI;
    api?.playSystemBeep?.();
  } catch {
    // ignore
  }
}

/**
 * Tell the Electron main process an incoming call is ringing so it can
 * focus or launch Ultraphone and emit a few system beeps to wake the monitor.
 */
export function notifyIncomingCallWake(payload?: { shouldLaunchUltraphone?: boolean; appUrl?: string; webUrl?: string }): void {
  try {
    const api = (window as any).electronAPI;
    api?.incomingCallWake?.(payload);
  } catch {
    // ignore
  }
}

/**
 * Subscribe to system resume / screen-unlock events from Electron.
 * Returns an unsubscribe function. No-op outside Electron.
 */
export function onPowerResume(handler: () => void): () => void {
  try {
    const api = (window as any).electronAPI;
    if (api?.onPowerResume) {
      return api.onPowerResume(handler);
    }
  } catch {
    // ignore
  }
  return () => {};
}

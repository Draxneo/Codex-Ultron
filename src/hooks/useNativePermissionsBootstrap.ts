/**
 * useNativePermissionsBootstrap.ts
 *
 * SYSTEM CONNECTIONS: imports Capacitor plugins (@capgo/capacitor-twilio-voice,
 * @capacitor/geolocation). Reads/writes localStorage flag `npb_v1_done` so we
 * don't re-prompt on every navigation.
 *
 * SITS ON: src/App.tsx → PrivateAppListeners (mounted only for authenticated
 * users on internal routes). No-op on web.
 *
 * Purpose: when a tech (or admin) opens the Android Capacitor shell for the
 * first time after install, run them through the runtime permission prompts
 * we actually need. Specifically:
 *   - Microphone (Twilio Voice cannot connect a call without it — silent
 *     failure if the OS denies)
 *   - Location (On-My-Way ETA cache + tech location tracking)
 *   - Push (already handled by usePushNotifications.ts — we don't duplicate)
 *
 * Why automatic: Android requires a runtime request for each "dangerous"
 * permission. Just declaring them in AndroidManifest is NOT enough. If the app
 * never explicitly calls a request method, the user never sees the system
 * dialog and the permission stays denied — Twilio Voice fails silently.
 *
 * Behavior: requests are FIRE-AND-FORGET. If the user denies, we toast a
 * helpful note pointing them at Settings → Apps → Permissions. We don't block
 * the app. If they later need to grant, there's a manual re-trigger via
 * useNativePermissionsBootstrap.requestAll() (re-exported below).
 *
 * Rule exception: this is one of the few places it's OK to import Capacitor
 * plugins synchronously — the dynamic import keeps the web bundle lean by
 * lazy-loading the native modules only when needed.
 */
import { useEffect, useRef } from "react";
import { useCapacitor } from "@/hooks/useCapacitor";
import { useToast } from "@/hooks/use-toast";

const STORAGE_KEY = "npb_v1_done";

/**
 * Requests microphone permission via the @capgo/capacitor-twilio-voice plugin.
 * Returns true if granted, false if denied or plugin unavailable.
 */
async function requestMicrophone(): Promise<boolean> {
  try {
    const { TwilioVoice } = await import("@capgo/capacitor-twilio-voice");
    // First check current state — if already granted, don't re-prompt.
    try {
      const checkResult = await (TwilioVoice as any).checkMicrophonePermission?.();
      if (checkResult?.granted) return true;
    } catch {
      // Method may not exist on older plugin versions — fall through to request.
    }
    const result = await (TwilioVoice as any).requestMicrophonePermission?.();
    return Boolean(result?.granted);
  } catch (e) {
    console.warn("[NativePermissionsBootstrap] microphone request failed:", e);
    return false;
  }
}

/**
 * Requests foreground+coarse location via @capacitor/geolocation. Used for
 * On-My-Way ETA cache and live tech location markers on the dispatch board.
 */
async function requestLocation(): Promise<boolean> {
  try {
    const { Geolocation } = await import("@capacitor/geolocation");
    // Capacitor geolocation does its own check-then-request internally on call,
    // but we explicitly call requestPermissions to ensure the system dialog fires.
    const result = await Geolocation.requestPermissions({
      permissions: ["location", "coarseLocation"],
    });
    return result.location === "granted" || result.coarseLocation === "granted";
  } catch (e) {
    console.warn("[NativePermissionsBootstrap] location request failed:", e);
    return false;
  }
}

/**
 * Public hook. Mount once at the top of the authenticated tree.
 *
 * Behavior summary:
 *   - No-op on web
 *   - On native, if not already completed, sequentially request microphone
 *     + location, store completion flag, toast on each denial with a hint
 *     for opening device settings.
 *
 * @returns void (the hook is side-effecting only)
 */
export function useNativePermissionsBootstrap() {
  const { isNative } = useCapacitor();
  const { toast } = useToast();
  const ranRef = useRef(false);

  useEffect(() => {
    if (!isNative) return;
    if (ranRef.current) return;

    // Allow re-running by clearing localStorage if needed; default to "don't
    // re-prompt within the same install."
    let done = false;
    try {
      done = localStorage.getItem(STORAGE_KEY) === "true";
    } catch {
      // localStorage might be unavailable in rare WebView edge cases — proceed.
    }
    if (done) return;

    ranRef.current = true;

    (async () => {
      // Run sequentially so the user sees one dialog at a time (not a stack).
      const micGranted = await requestMicrophone();
      if (!micGranted) {
        toast({
          title: "Microphone needed for calls",
          description: "Open Settings → Apps → UltraOffice → Permissions and enable the microphone, otherwise calls will not connect.",
          variant: "destructive",
        });
      }

      const locGranted = await requestLocation();
      if (!locGranted) {
        toast({
          title: "Location optional but recommended",
          description: "Used for tech ETA and on-my-way text accuracy. Enable later in Settings if you change your mind.",
        });
      }

      try {
        localStorage.setItem(STORAGE_KEY, "true");
      } catch {
        // Best-effort — if localStorage is unavailable we'll just re-prompt next launch.
      }
    })();
  }, [isNative, toast]);
}

/**
 * Manual re-trigger for the permission flow. Useful for an admin-side
 * "Re-grant permissions" button when something gets stuck. Resets the
 * stored completion flag so the bootstrap hook will re-run on next mount.
 */
export function resetNativePermissionsBootstrap() {
  try {
    localStorage.removeItem(STORAGE_KEY);
  } catch {
    // No-op if localStorage unavailable.
  }
}

import { Capacitor } from "@capacitor/core";

/**
 * useCapacitor.ts — Detect whether the app is running inside a Capacitor native shell.
 *
 * When Capacitor loads a remote `server.url`, `window.Capacitor` can be unreliable or
 * report `web`. We therefore combine the official API with a WebView user-agent fallback
 * AND direct checks for native bridge objects so Android/iOS app builds still select
 * the native telephony path.
 */

let _logged = false;

/** Broad Android WebView detection — catches "wv" marker and standard Android UA */
function isAndroidUA(ua: string): boolean {
  return /android/i.test(ua) || /\bwv\b/.test(ua);
}

export function useCapacitor() {
  const hasWindow = typeof window !== "undefined";
  const ua = hasWindow ? navigator.userAgent : "";

  const reportedPlatform = (() => {
    try {
      return Capacitor.getPlatform();
    } catch {
      return "web";
    }
  })();

  const uaPlatform: "android" | "ios" | "web" = isAndroidUA(ua)
    ? "android"
    : /iphone|ipad|ipod/i.test(ua)
      ? "ios"
      : "web";

  // Additional native bridge detection — catches cases where Capacitor reports
  // "web" but we're actually inside a native WebView (remote URL mode)
  const bridgeNative: boolean = hasWindow && !!(
    (window as any).Capacitor?.isNativePlatform?.() ||
    (window as any).AndroidBridge ||
    (window as any).webkit?.messageHandlers?.bridge
  );

  // PRIORITY ORDER:
  // 1. Capacitor.getPlatform() — authoritative when it returns "android" or "ios".
  // 2. Native bridge objects — catches remote-URL Capacitor mode where Capacitor
  //    reports "web" but window.AndroidBridge / webkit.messageHandlers exist.
  // 3. Otherwise we are in a browser (desktop OR mobile web) → "web".
  //
  // CRITICAL: We deliberately do NOT trust the UA string alone. A browser visiting
  // the web app from an Android phone has UA="...Android..." but is NOT a native
  // shell — routing it to the native Twilio Voice SDK breaks ringing entirely.
  const platform: "android" | "ios" | "web" =
    reportedPlatform === "android" || reportedPlatform === "ios"
      ? reportedPlatform
      : bridgeNative
        ? (isAndroidUA(ua) ? "android" : "ios")
        : "web";

  const isNative = platform !== "web";

  // Debug log once so we can diagnose detection issues on device
  if (!_logged && hasWindow) {
    _logged = true;
    console.warn("[useCapacitor] reported:", reportedPlatform, "| ua:", uaPlatform, "| bridge:", bridgeNative, "| final:", platform, "| full UA:", ua);
  }

  return { isNative, platform };
}

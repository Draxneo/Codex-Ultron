/**
 * useCallForegroundService.ts — Keeps Android from killing the app.
 *
 * TWO modes:
 * 1. "standby" — lightweight persistent notification while softphone is registered
 *    so Android doesn't kill the WebSocket that receives incoming calls.
 * 2. "active" — prominent notification while on a call.
 *
 * Uses @capawesome-team/capacitor-android-foreground-service.
 *
 * CRITICAL — Capacitor Proxy `.then()` trap (2026-05-03):
 *   Capacitor's registerPlugin() returns a Proxy. When you `return` that
 *   proxy from an async function, JS evaluating the awaited result calls
 *   `.then()` on it to check thenability. The Proxy intercepts that `.then()`
 *   call and routes it to the native bridge, which throws
 *   "ForegroundService.then() is not implemented on android".
 *
 *   Fix: split plugin loading from plugin retrieval. loadPlugin() returns
 *   void (loads + caches as a side effect). getPlugin() is a sync getter
 *   that returns the cached proxy. This is the same pattern documented in
 *   useNativeSoftphone.ts.
 */

import { useEffect, useRef } from "react";
import { useCapacitor } from "./useCapacitor";

let fgServicePlugin: any = null;
let loadPromise: Promise<void> | null = null;

/**
 * Asynchronously loads the foreground-service plugin module. Returns void
 * so the awaited result is never the Capacitor proxy itself (avoids the
 * `.then()` trap). Multiple concurrent callers share one in-flight import.
 */
async function loadPlugin(): Promise<void> {
  if (fgServicePlugin) return;
  if (loadPromise) { await loadPromise; return; }
  loadPromise = (async () => {
    try {
      const mod = await import("@capawesome-team/capacitor-android-foreground-service");
      fgServicePlugin = mod.ForegroundService ?? null;
    } catch {
      fgServicePlugin = null;
    }
  })();
  await loadPromise;
}

/** Synchronous getter — returns the cached plugin proxy or null. */
function getPlugin(): any {
  return fgServicePlugin ?? null;
}

type Mode = "standby" | "active" | "off";

export function useCallForegroundService(isRegistered: boolean, isOnCall: boolean) {
  const { isNative, platform } = useCapacitor();
  const currentModeRef = useRef<Mode>("off");

  useEffect(() => {
    if (!isNative || platform !== "android") return;

    const targetMode: Mode = isOnCall ? "active" : isRegistered ? "standby" : "off";

    if (targetMode === currentModeRef.current) return;

    const apply = async () => {
      await loadPlugin();
      const plugin = getPlugin();
      if (!plugin) return;

      // Stop existing service before changing mode
      if (currentModeRef.current !== "off") {
        try { await plugin.stopForegroundService(); } catch { /* noop */ }
      }

      if (targetMode === "off") {
        currentModeRef.current = "off";
        return;
      }

      try {
        await plugin.startForegroundService({
          id: targetMode === "active" ? 1001 : 1002,
          title: targetMode === "active" ? "Call in Progress" : "Phone Ready",
          body: targetMode === "active" ? "Your call is active" : "Listening for incoming calls",
          smallIcon: targetMode === "active" ? "ic_stat_phone_in_talk" : "ic_stat_phone",
        });
        currentModeRef.current = targetMode;
      } catch (e) {
        console.warn("Foreground service start failed:", e);
      }
    };

    apply();

    return () => {
      // Cleanup on unmount
      const stop = async () => {
        if (currentModeRef.current === "off") return;
        await loadPlugin();
        const plugin = getPlugin();
        if (!plugin) return;
        try { await plugin.stopForegroundService(); } catch { /* noop */ }
        currentModeRef.current = "off";
      };
      stop();
    };
  }, [isOnCall, isRegistered, isNative, platform]);
}

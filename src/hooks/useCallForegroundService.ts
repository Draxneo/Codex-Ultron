/**
 * useCallForegroundService.ts — Keeps Android from killing the app.
 *
 * TWO modes:
 * 1. "standby" — lightweight persistent notification while softphone is registered
 *    so Android doesn't kill the WebSocket that receives incoming calls.
 * 2. "active" — prominent notification while on a call.
 *
 * Uses @capawesome-team/capacitor-android-foreground-service.
 */

import { useEffect, useRef } from "react";
import { useCapacitor } from "./useCapacitor";

let fgServicePlugin: any = null;
async function getPlugin() {
  if (fgServicePlugin) return fgServicePlugin;
  try {
    const mod = await import("@capawesome-team/capacitor-android-foreground-service");
    fgServicePlugin = mod.ForegroundService;
    return fgServicePlugin;
  } catch {
    return null;
  }
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
      const plugin = await getPlugin();
      if (!plugin) return;

      // Stop existing service before changing mode
      if (currentModeRef.current !== "off") {
        try { await plugin.stopForegroundService(); } catch {}
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
        const plugin = await getPlugin();
        if (!plugin) return;
        try { await plugin.stopForegroundService(); } catch {}
        currentModeRef.current = "off";
      };
      stop();
    };
  }, [isOnCall, isRegistered, isNative, platform]);
}

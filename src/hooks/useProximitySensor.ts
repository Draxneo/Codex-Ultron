/**
 * useProximitySensor.ts — Turn screen off when phone is held to ear during calls.
 * Uses the native proximity sensor via the Web Sensor API (available in Android WebView).
 * Falls back gracefully on unsupported platforms.
 */

import { useEffect, useRef } from "react";
import { useCapacitor } from "./useCapacitor";

export function useProximitySensor(enabled: boolean) {
  const { isNative, platform } = useCapacitor();
  const wakeLockRef = useRef<any>(null);

  useEffect(() => {
    if (!enabled || !isNative || platform !== "android") return;

    // Use the Screen Wake Lock API to release/acquire based on proximity
    // Android WebView supports navigator.wakeLock
    let sensor: any = null;
    let active = true;

    const acquireWakeLock = async () => {
      try {
        if (!wakeLockRef.current && document.visibilityState === "visible") {
          wakeLockRef.current = await (navigator as any).wakeLock?.request("screen");
        }
      } catch {
        // Wake lock not supported or denied
      }
    };

    const releaseWakeLock = async () => {
      try {
        await wakeLockRef.current?.release();
        wakeLockRef.current = null;
      } catch { /* noop */ }
    };

    // Try ProximitySensor (Chromium Generic Sensor API)
    try {
      const ProximitySensor = (window as any).ProximitySensor;
      if (ProximitySensor) {
        sensor = new ProximitySensor();
        sensor.addEventListener("reading", () => {
          if (!active) return;
          if (sensor.near) {
            // Phone near face — release wake lock to dim/off screen
            releaseWakeLock();
          } else {
            // Phone away from face — acquire wake lock to keep screen on
            acquireWakeLock();
          }
        });
        sensor.start();
      }
    } catch (e) {
      console.warn("ProximitySensor not available:", e);
    }

    // Initially acquire wake lock so screen stays on while on call screen
    acquireWakeLock();

    return () => {
      active = false;
      try { sensor?.stop(); } catch { /* noop */ }
      releaseWakeLock();
    };
  }, [enabled, isNative, platform]);
}

/**
 * useKeepAwake — Prevent Android/iOS screen from sleeping while active.
 *
 * WHY THIS EXISTS:
 * Techs fill out job forms in the field. Android default screen timeout is
 * 30-60 seconds. Without this, the screen turns off mid-form, they have to
 * unlock, re-navigate, and lose focus. On a hot rooftop this is infuriating.
 *
 * USAGE:
 * Call useKeepAwake() inside any component that should keep the screen on.
 * The wake lock is automatically released when the component unmounts.
 *
 * Only active on native (Android/iOS). No-op on web.
 */
import { useEffect } from "react";
import { useCapacitor } from "@/hooks/useCapacitor";

export function useKeepAwake() {
  const { isNative } = useCapacitor();

  useEffect(() => {
    if (!isNative) return;

    let acquired = false;

    const acquire = async () => {
      try {
        const { KeepAwake } = await import("@capacitor-community/keep-awake");
        await KeepAwake.keepAwake();
        acquired = true;
      } catch (err) {
        // Plugin not installed or not supported — fail silently
        console.warn("[KeepAwake] Could not acquire wake lock:", err);
      }
    };

    acquire();

    return () => {
      if (!acquired) return;
      import("@capacitor-community/keep-awake")
        .then(({ KeepAwake }) => KeepAwake.allowSleep())
        .catch(() => {});
    };
  }, [isNative]);
}

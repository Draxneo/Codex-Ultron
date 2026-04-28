/**
 * useHaptics — Haptic feedback helpers for native Android/iOS.
 * No-op on web. Provides light, medium, heavy impact and selection feedback.
 */
import { useCallback } from "react";
import { useCapacitor } from "@/hooks/useCapacitor";

export function useHaptics() {
  const { isNative } = useCapacitor();

  const impact = useCallback(async (style: "light" | "medium" | "heavy" = "light") => {
    if (!isNative) return;
    try {
      const { Haptics, ImpactStyle } = await import("@capacitor/haptics");
      const map = { light: ImpactStyle.Light, medium: ImpactStyle.Medium, heavy: ImpactStyle.Heavy };
      await Haptics.impact({ style: map[style] });
    } catch { /* noop */ }
  }, [isNative]);

  const selection = useCallback(async () => {
    if (!isNative) return;
    try {
      const { Haptics } = await import("@capacitor/haptics");
      await Haptics.selectionStart();
      await Haptics.selectionChanged();
      await Haptics.selectionEnd();
    } catch { /* noop */ }
  }, [isNative]);

  const notification = useCallback(async (type: "success" | "warning" | "error" = "success") => {
    if (!isNative) return;
    try {
      const { Haptics, NotificationType } = await import("@capacitor/haptics");
      const map = { success: NotificationType.Success, warning: NotificationType.Warning, error: NotificationType.Error };
      await Haptics.notification({ type: map[type] });
    } catch { /* noop */ }
  }, [isNative]);

  return { impact, selection, notification };
}

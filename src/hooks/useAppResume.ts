/**
 * useAppResume — Invalidates all React Query caches when the app resumes
 * from background (Android/iOS Capacitor or browser tab switch).
 *
 * Listens to:
 * 1. `visibilitychange` — fires on browser tab switch & some native resumes
 * 2. Capacitor `App.addListener("appStateChange")` — fires reliably on native
 *
 * On resume: invalidates all queries so visible data refreshes automatically.
 */
import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

export function useAppResume() {
  const queryClient = useQueryClient();

  useEffect(() => {
    // Browser / WebView visibility change
    const handleVisibility = () => {
      if (document.visibilityState === "visible") {
        queryClient.invalidateQueries();
      }
    };
    document.addEventListener("visibilitychange", handleVisibility);

    // Capacitor native app state change (more reliable on Android)
    let removeNativeListener: (() => void) | null = null;
    import("@capacitor/app")
      .then(({ App }) => {
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) {
            queryClient.invalidateQueries();
          }
        }).then((handle) => {
          removeNativeListener = () => handle.remove();
        });
      })
      .catch(() => {
        // Not running in Capacitor — no-op
      });

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      removeNativeListener?.();
    };
  }, [queryClient]);
}

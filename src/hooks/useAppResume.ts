import { useEffect } from "react";
import { useQueryClient } from "@tanstack/react-query";

const RESUME_REFRESH_COOLDOWN_MS = 30_000;

export function useAppResume() {
  const queryClient = useQueryClient();

  useEffect(() => {
    let lastRefreshAt = 0;

    const refreshLiveQueries = () => {
      const now = Date.now();
      if (now - lastRefreshAt < RESUME_REFRESH_COOLDOWN_MS) return;
      lastRefreshAt = now;

      const liveQueryKeys = [
        ["sms_log"],
        ["unread_sms_count"],
        ["call_log"],
        ["jobs"],
        ["estimates"],
        ["customers"],
        ["action_items"],
        ["now_cards"],
        ["route_travel_cache_date"],
        ["route_travel_cache_week"],
      ];

      for (const queryKey of liveQueryKeys) {
        queryClient.invalidateQueries({ queryKey, exact: false });
      }
    };

    const handleVisibility = () => {
      if (document.visibilityState === "visible") refreshLiveQueries();
    };
    document.addEventListener("visibilitychange", handleVisibility);

    let removeNativeListener: (() => void) | null = null;
    import("@capacitor/app")
      .then(({ App }) => {
        App.addListener("appStateChange", ({ isActive }) => {
          if (isActive) refreshLiveQueries();
        }).then((handle) => {
          removeNativeListener = () => handle.remove();
        });
      })
      .catch(() => {
        // Not running in Capacitor.
      });

    return () => {
      document.removeEventListener("visibilitychange", handleVisibility);
      removeNativeListener?.();
    };
  }, [queryClient]);
}

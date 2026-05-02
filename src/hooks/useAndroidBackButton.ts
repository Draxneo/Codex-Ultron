/**
 * useAndroidBackButton — Handle hardware back button on Android via Capacitor.
 * Navigates back in React Router history, or minimizes the app if at root.
 */
import { useEffect } from "react";
import { useNavigate, useLocation } from "react-router-dom";
import { useCapacitor } from "@/hooks/useCapacitor";

export function useAndroidBackButton() {
  const { isNative } = useCapacitor();
  const navigate = useNavigate();
  const location = useLocation();

  useEffect(() => {
    if (!isNative) return;

    let cleanup: (() => void) | undefined;

    const setup = async () => {
      try {
        const { App } = await import("@capacitor/app");
        const listener = await App.addListener("backButton", ({ canGoBack }) => {
          // If at root pages, minimize the app instead of going back
          const rootPaths = [
            "/",
            "/tech",
            "/intake",
            "/now",
            "/dispatch",
            "/phone",
            "/sms",
            "/team",
            "/customers",
            "/quick-quote",
            "/admin",
            "/admin/hub",
          ];
          if (rootPaths.includes(location.pathname)) {
            App.minimizeApp();
          } else if (canGoBack) {
            navigate(-1);
          } else {
            App.minimizeApp();
          }
        });
        cleanup = () => listener.remove();
      } catch (err) {
        console.warn("[BackButton] Setup failed:", err);
      }
    };

    setup();
    return () => cleanup?.();
  }, [isNative, navigate, location.pathname]);
}

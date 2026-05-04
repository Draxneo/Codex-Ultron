/**
 * useStatusBar — Theme the Android/iOS status bar to match the app.
 * Sets dark content on light backgrounds, light content on dark nav bars.
 */
import { useEffect } from "react";
import { useCapacitor } from "@/hooks/useCapacitor";

export function useStatusBar() {
  const { isNative } = useCapacitor();

  useEffect(() => {
    if (!isNative) return;

    const setup = async () => {
      try {
        const { StatusBar, Style } = await import("@capacitor/status-bar");
        // Navy top bar = light text in status bar
        await StatusBar.setStyle({ style: Style.Dark });
        await StatusBar.setBackgroundColor({ color: "#152744" });
        await StatusBar.setOverlaysWebView({ overlay: false });
      } catch (err) {
        console.warn("[StatusBar] Setup failed:", err);
      }
    };

    setup();
  }, [isNative]);
}

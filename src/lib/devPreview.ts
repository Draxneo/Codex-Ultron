/**
 * devPreview — Detects when the app is running inside the Lovable dev
 * preview tab (id-preview--*.lovable.app or *.lovableproject.com).
 *
 * Used to silence the JARVIS announcer + desktop/toast notifications in the
 * dev preview so they don't race the Electron app or talk over the developer
 * while building. Production, Electron, and
 * Capacitor native all return false and stay fully active.
 */
export function isLovableDevPreview(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return /^id-preview--/.test(h) || h.endsWith(".lovableproject.com");
}

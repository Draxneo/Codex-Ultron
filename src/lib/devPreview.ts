/**
 * devPreview — Detects when the app is running inside the Legacy builder dev
 * hosted builder preview tab.
 *
 * Used to silence the JARVIS announcer + desktop/toast notifications in the
 * dev preview so they don't race the Electron app or talk over the developer
 * while building. Production, Electron, and
 * Capacitor native all return false and stay fully active.
 */
export function isHostedBuilderPreview(): boolean {
  if (typeof window === "undefined") return false;
  const h = window.location.hostname;
  return /^id-preview--/.test(h) || h.endsWith(".preview.local");
}

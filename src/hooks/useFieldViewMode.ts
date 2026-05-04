/**
 * useFieldViewMode.ts
 *
 * SYSTEM CONNECTIONS: writes localStorage `field_view_mode_v1`. Read by
 * src/components/ProtectedRoute.tsx (layout choice) and src/App.tsx
 * (RoleAwareHome landing route).
 *
 * SITS ON: any component that needs to know whether the current admin user
 * is in "field view" — a stripped-down tech-style mobile layout for admins
 * who are also out in the field. Behaves as a no-op for non-admin roles.
 *
 * Why a separate localStorage flag (not the existing ViewAsContext):
 *   ViewAsContext is for impersonating *another* employee — heavier feature
 *   used to debug what a tech sees. Field view mode keeps the user as
 *   themselves (full admin permissions, full data access) but renders the
 *   simpler tech-style mobile shell. Different intent, different storage.
 *
 * Behavior:
 *   - On a non-admin role → always returns false (toggle hidden)
 *   - On admin → reads localStorage on mount, exposes set/toggle to flip it
 *   - Cross-tab sync via storage event listener so opening the app on a
 *     second device picks up the same preference
 */
import { useCallback, useEffect, useState } from "react";

const STORAGE_KEY = "field_view_mode_v1";

function readStoredMode(): boolean {
  if (typeof window === "undefined") return false;
  try {
    return window.localStorage.getItem(STORAGE_KEY) === "true";
  } catch {
    return false;
  }
}

function writeStoredMode(value: boolean) {
  if (typeof window === "undefined") return;
  try {
    if (value) window.localStorage.setItem(STORAGE_KEY, "true");
    else window.localStorage.removeItem(STORAGE_KEY);
  } catch {
    // localStorage may be unavailable in rare WebView edge cases — ignore
  }
}

export function useFieldViewMode() {
  const [enabled, setEnabledState] = useState<boolean>(() => readStoredMode());

  // Cross-tab sync — if another tab toggles the flag, mirror it here
  useEffect(() => {
    if (typeof window === "undefined") return;
    const handler = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setEnabledState(e.newValue === "true");
    };
    window.addEventListener("storage", handler);
    return () => window.removeEventListener("storage", handler);
  }, []);

  const setEnabled = useCallback((value: boolean) => {
    writeStoredMode(value);
    setEnabledState(value);
  }, []);

  const toggle = useCallback(() => {
    setEnabled(!enabled);
  }, [enabled, setEnabled]);

  return { enabled, setEnabled, toggle };
}

/**
 * Synchronous read for non-React code paths (e.g. App.tsx's RoleAwareHome
 * landing logic) where we just need a one-shot read at render time.
 * Returns false on the server.
 */
export function readFieldViewModeSync(): boolean {
  return readStoredMode();
}

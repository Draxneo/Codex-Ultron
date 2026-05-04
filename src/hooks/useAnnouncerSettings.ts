/**
 * useAnnouncerSettings — Per-device JARVIS announcer preferences.
 *
 * Stored in localStorage (NOT user prefs) because announcements are a
 * per-machine UX concern — you'd want them on your office desktop but
 * not on a shared kiosk or laptop in a meeting.
 */
import { useCallback, useEffect, useState } from "react";

export interface AnnouncerSettings {
  /** Master on/off for all announcements on this device. */
  enabled: boolean;
  /** Output volume, 0..1. */
  volume: number;
  /** Prefix used in front of announcements (e.g. "Sir,"). Empty = no salutation. */
  salutation: string;
  /** Speech speed multiplier, 0.7..1.2. */
  speed: number;
  /** Per-event-type toggles. */
  events: {
    incomingCall: boolean;
    newSms: boolean;
    voicemail: boolean;
    jarvisAlert: boolean;
  };
}

const STORAGE_KEY = "jarvis-announcer-settings:v1";

const DEFAULTS: AnnouncerSettings = {
  enabled: false, // OFF by default — users must opt in per device.
  volume: 0.85,
  salutation: "Sir,",
  speed: 1.1,
  events: {
    incomingCall: true,
    newSms: true,
    voicemail: true,
    jarvisAlert: false,
  },
};

function load(): AnnouncerSettings {
  if (typeof window === "undefined") return DEFAULTS;
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return DEFAULTS;
    const parsed = JSON.parse(raw);
    return {
      ...DEFAULTS,
      ...parsed,
      events: { ...DEFAULTS.events, ...(parsed?.events ?? {}) },
    };
  } catch {
    return DEFAULTS;
  }
}

export function useAnnouncerSettings() {
  const [settings, setSettings] = useState<AnnouncerSettings>(load);

  // Cross-tab sync — if you toggle on one tab, all tabs follow.
  useEffect(() => {
    const onStorage = (e: StorageEvent) => {
      if (e.key === STORAGE_KEY) setSettings(load());
    };
    window.addEventListener("storage", onStorage);
    return () => window.removeEventListener("storage", onStorage);
  }, []);

  const update = useCallback((patch: Partial<AnnouncerSettings>) => {
    setSettings((prev) => {
      const next = {
        ...prev,
        ...patch,
        events: { ...prev.events, ...(patch.events ?? {}) },
      };
      try {
        localStorage.setItem(STORAGE_KEY, JSON.stringify(next));
      } catch {
        /* ignore quota errors */
      }
      return next;
    });
  }, []);

  const setEvent = useCallback(
    (key: keyof AnnouncerSettings["events"], value: boolean) =>
      update({ events: { [key]: value } as any }),
    [update],
  );

  return { settings, update, setEvent };
}

/**
 * useAnnouncer — Plays JARVIS-voice TTS announcements via the
 * elevenlabs-tts edge function. Queues messages so they don't overlap.
 *
 * Usage:
 *   const { announce, test, isPlaying } = useAnnouncer();
 *   announce("Incoming call from John Smith");
 */
import { useCallback, useEffect, useRef, useState } from "react";
import { supabase } from "@/integrations/supabase/client";
import { useAnnouncerSettings } from "@/hooks/useAnnouncerSettings";
import { isOnCall as isOnCallNow, subscribeOnCall } from "@/lib/callStateBus";

interface QueueItem {
  text: string;
  /** Skip the per-event check (used by the "test voice" button). */
  force?: boolean;
}

/**
 * Session-level in-memory cache: text+speed → Blob.
 * Module-scoped so all hook instances share it (one map per browser tab).
 * Survives until full page reload; storage-side cache (tts-cache bucket)
 * picks up after that, so we never re-pay for the same phrase.
 *
 * Capped at 80 entries (LRU-ish — oldest insertion deleted) to keep memory
 * bounded for long-running sessions.
 */
const MEMORY_CACHE = new Map<string, Blob>();
const MEMORY_CACHE_MAX = 80;
function cacheKey(text: string, speed: number) {
  return `${Math.round(speed * 100) / 100}::${text}`;
}
function memCacheGet(key: string): Blob | undefined {
  const b = MEMORY_CACHE.get(key);
  if (b) {
    // Bump LRU position
    MEMORY_CACHE.delete(key);
    MEMORY_CACHE.set(key, b);
  }
  return b;
}
function memCacheSet(key: string, blob: Blob) {
  if (MEMORY_CACHE.size >= MEMORY_CACHE_MAX) {
    const oldest = MEMORY_CACHE.keys().next().value;
    if (oldest) MEMORY_CACHE.delete(oldest);
  }
  MEMORY_CACHE.set(key, blob);
}

/**
 * Module-scoped recent-utterance log shared across ALL useAnnouncer()
 * instances in this tab. Prevents the same phrase from being spoken twice
 * within RECENT_WINDOW_MS, even when:
 *   • Two components each call announce() for the same event
 *   • Supabase Realtime delivers an INSERT twice
 *   • React StrictMode double-mounts AnnouncerProvider in dev
 */
const RECENT_WINDOW_MS = 8000;
const recentUtterances = new Map<string, number>();
function wasRecentlySpoken(text: string): boolean {
  const ts = recentUtterances.get(text);
  if (!ts) return false;
  if (Date.now() - ts > RECENT_WINDOW_MS) {
    recentUtterances.delete(text);
    return false;
  }
  return true;
}
function markRecentlySpoken(text: string) {
  recentUtterances.set(text, Date.now());
  // Periodic cleanup so the map doesn't grow unbounded over a long session
  if (recentUtterances.size > 200) {
    const cutoff = Date.now() - RECENT_WINDOW_MS;
    for (const [k, t] of recentUtterances) {
      if (t < cutoff) recentUtterances.delete(k);
    }
  }
}

export function useAnnouncer() {
  const { settings } = useAnnouncerSettings();
  const queueRef = useRef<QueueItem[]>([]);
  const playingRef = useRef(false);
  const audioRef = useRef<HTMLAudioElement | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);

  // Keep latest settings in a ref so the playback loop sees fresh values.
  const settingsRef = useRef(settings);
  useEffect(() => {
    settingsRef.current = settings;
    // Live volume update if currently playing
    if (audioRef.current) {
      audioRef.current.volume = settings.volume;
    }
  }, [settings]);

  // HARD KILL-SWITCH: when a call starts, immediately silence any
  // currently-playing announcement and clear the queue. Catches the race
  // where TTS audio is mid-sentence when the user answers.
  useEffect(() => {
    return subscribeOnCall((onCall) => {
      if (onCall) {
        queueRef.current = [];
        if (audioRef.current) {
          try {
            audioRef.current.pause();
            audioRef.current.currentTime = 0;
          } catch { /* ignore */ }
        }
      }
    });
  }, []);

  const playNext = useCallback(async () => {
    if (playingRef.current) return;
    // Hard gate: never start a new announcement while on a live call,
    // unless explicitly forced (e.g., voice-test button).
    if (queueRef.current[0] && !queueRef.current[0].force && isOnCallNow()) {
      // Drop everything that isn't forced — we don't want stale alerts
      // firing the moment the call ends. Post-call recap is handled
      // by AnnouncerProvider's hangup-detection effect.
      queueRef.current = queueRef.current.filter((q) => q.force);
      if (queueRef.current.length === 0) return;
    }
    const item = queueRef.current.shift();
    if (!item) return;

    playingRef.current = true;
    setIsPlaying(true);

    try {
      const { salutation, speed, volume } = settingsRef.current;
      const prefix = salutation?.trim() ? salutation.trim() + " " : "";
      // Avoid double-prefixing if caller already included the salutation.
      const finalText = item.text.toLowerCase().startsWith(salutation.trim().toLowerCase())
        ? item.text
        : prefix + item.text;

      const key = cacheKey(finalText, speed);
      let blob: Blob | undefined = memCacheGet(key);

      if (!blob) {
        // Fetch raw MP3 bytes directly — supabase.functions.invoke mangles binary responses
        const SUPABASE_URL = import.meta.env.VITE_SUPABASE_URL as string;
        const SUPABASE_KEY = import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY as string;
        const { data: sessionData } = await supabase.auth.getSession();
        const accessToken = sessionData.session?.access_token || SUPABASE_KEY;

        const resp = await fetch(`${SUPABASE_URL}/functions/v1/elevenlabs-tts`, {
          method: "POST",
          headers: {
            "Content-Type": "application/json",
            "Authorization": `Bearer ${accessToken}`,
            "apikey": SUPABASE_KEY,
          },
          body: JSON.stringify({ text: finalText, speed }),
        });

        if (!resp.ok) {
          const errText = await resp.text().catch(() => "");
          throw new Error(`TTS request failed (${resp.status}): ${errText}`);
        }

        const fetched = await resp.blob();
        if (!fetched.type.startsWith("audio/")) {
          // Server returned an error JSON disguised as binary
          const txt = await fetched.text();
          throw new Error(`TTS returned non-audio: ${txt.slice(0, 200)}`);
        }
        blob = fetched;
        memCacheSet(key, blob);
        // Optional: log cache origin for observability
        const origin = resp.headers.get("x-tts-cache");
        if (origin) console.log(`[Announcer] tts ${origin} (${finalText.slice(0, 40)})`);
      } else {
        console.log(`[Announcer] tts memory-hit (${finalText.slice(0, 40)})`);
      }

      const url = URL.createObjectURL(blob);

      const audio = new Audio(url);
      audio.volume = volume;
      // Assign the ref BEFORE play() so the kill-switch (subscribeOnCall)
      // can pause buffering audio if a call connects during this window.
      audioRef.current = audio;

      // Final pre-play gate: a call may have connected during the 500-1500ms
      // TTS fetch. Drop silently rather than start playing over a live call.
      if (!item.force && isOnCallNow()) {
        URL.revokeObjectURL(url);
        audioRef.current = null;
        console.log("[Announcer] dropped post-fetch (call active):", finalText.slice(0, 60));
        return;
      }

      await new Promise<void>((resolve) => {
        const cleanup = () => {
          URL.revokeObjectURL(url);
          audioRef.current = null;
          resolve();
        };
        audio.onended = cleanup;
        audio.onerror = cleanup;
        audio.play().catch((err) => {
          console.warn("[Announcer] play() blocked or failed:", err);
          cleanup();
        });
      });
    } catch (err) {
      console.error("[Announcer] failed:", err);
    } finally {
      playingRef.current = false;
      setIsPlaying(false);
      // Drain queue
      if (queueRef.current.length > 0) {
        // Small gap between announcements for natural feel
        setTimeout(() => playNext(), 250);
      }
    }
  }, []);

  const announce = useCallback(
    (text: string, opts?: { force?: boolean }) => {
      const cleanText = (text || "").trim();
      if (!cleanText) return;
      if (!settingsRef.current.enabled && !opts?.force) return;
      // Suppress at the source while on a live call — even direct callers
      // that bypassed AnnouncerProvider's gate (e.g., incoming-call alert,
      // TechJarvisPushToTalk replies) get silently dropped here.
      if (!opts?.force && isOnCallNow()) {
        console.log("[Announcer] dropped while on call:", cleanText.slice(0, 60));
        return;
      }
      // Dedupe consecutive identical messages already in queue
      const last = queueRef.current[queueRef.current.length - 1];
      if (last && last.text === cleanText) return;
      // Cross-instance + recent-history dedup: silently drop any identical
      // phrase spoken/queued in the last 8 seconds, regardless of which
      // useAnnouncer() instance enqueued it. Catches:
      //   • Realtime events delivered twice by Supabase
      //   • Two components both calling announce() for the same event
      //   • Multiple AnnouncerProvider mounts (StrictMode dev re-mount)
      if (!opts?.force && wasRecentlySpoken(cleanText)) {
        console.log("[Announcer] dedup recent:", cleanText.slice(0, 60));
        return;
      }
      markRecentlySpoken(cleanText);
      queueRef.current.push({ text: cleanText, force: opts?.force });
      playNext();
    },
    [playNext],
  );

  const test = useCallback(
    (sample = "All systems operational. Voice check complete.") => {
      announce(sample, { force: true });
    },
    [announce],
  );

  const stop = useCallback(() => {
    queueRef.current = [];
    if (audioRef.current) {
      audioRef.current.pause();
      audioRef.current = null;
    }
    playingRef.current = false;
    setIsPlaying(false);
  }, []);

  return { announce, test, stop, isPlaying };
}

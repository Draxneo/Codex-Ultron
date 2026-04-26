/**
 * useMediaPauseOnCall — Pauses external media (Spotify, etc.) during calls.
 *
 * On Android/WebView, Spotify resumes when audio focus is briefly released
 * between call state transitions. This hook maintains a persistent silent
 * AudioContext oscillator for the entire duration of a call, keeping Android
 * audio focus locked so other apps stay paused.
 *
 * Activates when status is "connecting", "ringing" (outbound), or "on-call".
 * Deactivates when the call ends (status returns to "ready"/"offline"/etc.).
 */

import { useEffect, useRef } from "react";

type CallStatus = string;

const ACTIVE_STATUSES = new Set(["connecting", "ringing", "on-call"]);

export function useMediaPauseOnCall(status: CallStatus) {
  const ctxRef = useRef<AudioContext | null>(null);
  const oscRef = useRef<OscillatorNode | null>(null);

  useEffect(() => {
    const shouldHoldFocus = ACTIVE_STATUSES.has(status);

    if (shouldHoldFocus && !ctxRef.current) {
      try {
        const ctx = new AudioContext();
        // Create a silent oscillator — gain = 0 so nothing is audible
        const osc = ctx.createOscillator();
        const gain = ctx.createGain();
        gain.gain.value = 0; // completely silent
        osc.connect(gain);
        gain.connect(ctx.destination);
        osc.start();

        ctxRef.current = ctx;
        oscRef.current = osc;
        console.log("[MediaPause] Audio focus acquired — external media paused");
      } catch (e) {
        console.warn("[MediaPause] Failed to acquire audio focus:", e);
      }
    } else if (!shouldHoldFocus && ctxRef.current) {
      // Release audio focus — allows Spotify etc. to resume
      try {
        oscRef.current?.stop();
        oscRef.current?.disconnect();
        ctxRef.current.close();
      } catch {}
      ctxRef.current = null;
      oscRef.current = null;
      console.log("[MediaPause] Audio focus released — external media can resume");
    }

    // Cleanup on unmount
    return () => {
      if (ctxRef.current) {
        try {
          oscRef.current?.stop();
          oscRef.current?.disconnect();
          ctxRef.current.close();
        } catch {}
        ctxRef.current = null;
        oscRef.current = null;
      }
    };
  }, [status]);
}

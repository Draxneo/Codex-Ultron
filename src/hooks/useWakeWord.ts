import { useState, useRef, useCallback, useEffect } from "react";

interface UseWakeWordOptions {
  wakeWord?: string;
  onWake: () => void;
  enabled?: boolean;
}

export function useWakeWord({ wakeWord = "jarvis", onWake, enabled = false }: UseWakeWordOptions) {
  const [listening, setListening] = useState(false);
  const [supported, setSupported] = useState(false);
  const recognitionRef = useRef<any>(null);
  const enabledRef = useRef(enabled);
  const cooldownRef = useRef(false);
  const restartRef = useRef<() => void>(() => {});

  useEffect(() => {
    enabledRef.current = enabled;
  }, [enabled]);

  useEffect(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    setSupported(!!SR);
  }, []);

  const createRecognition = useCallback(() => {
    const SR = (window as any).SpeechRecognition || (window as any).webkitSpeechRecognition;
    if (!SR) return null;

    const recognition = new SR();
    recognition.continuous = true;
    recognition.interimResults = true;
    recognition.lang = "en-US";

    recognition.onresult = (event: any) => {
      if (cooldownRef.current) return;
      for (let i = event.resultIndex; i < event.results.length; i++) {
        const text = event.results[i][0].transcript.toLowerCase();
        if (text.includes(wakeWord.toLowerCase())) {
          cooldownRef.current = true;

          // Play chime
          try {
            const ctx = new AudioContext();
            const osc = ctx.createOscillator();
            const gain = ctx.createGain();
            osc.connect(gain);
            gain.connect(ctx.destination);
            osc.frequency.value = 880;
            gain.gain.value = 0.15;
            osc.start();
            gain.gain.exponentialRampToValueAtTime(0.001, ctx.currentTime + 0.3);
            osc.stop(ctx.currentTime + 0.3);
          } catch { /* noop */ }

          // Stop current recognition before triggering mic recording
          try { recognition.stop(); } catch { /* noop */ }
          recognitionRef.current = null;

          onWake();

          // Resume listening after a cooldown (give mic recording time to start/finish)
          setTimeout(() => {
            cooldownRef.current = false;
            if (enabledRef.current) {
              restartRef.current();
            }
          }, 8000); // 8s cooldown for recording + transcription

          break;
        }
      }
    };

    recognition.onend = () => {
      // Only auto-restart if not in cooldown and still enabled
      if (!cooldownRef.current && enabledRef.current) {
        setTimeout(() => {
          if (enabledRef.current && !cooldownRef.current) {
            restartRef.current();
          }
        }, 500);
      } else if (!enabledRef.current) {
        setListening(false);
      }
    };

    recognition.onerror = (event: any) => {
      console.log("Wake word recognition error:", event.error);
      if (event.error === "not-allowed" || event.error === "service-not-allowed") {
        setListening(false);
        return;
      }
      // aborted is expected when we stop it ourselves
      if (event.error === "aborted") return;
      // For other errors, restart after delay
      if (enabledRef.current && !cooldownRef.current) {
        setTimeout(() => {
          if (enabledRef.current && !cooldownRef.current) {
            restartRef.current();
          }
        }, 2000);
      }
    };

    return recognition;
  }, [wakeWord, onWake]);

  const restart = useCallback(() => {
    // Always create a fresh instance
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* noop */ }
      recognitionRef.current = null;
    }
    const recognition = createRecognition();
    if (!recognition) return;
    try {
      recognition.start();
      recognitionRef.current = recognition;
      setListening(true);
    } catch (e) {
      console.log("Failed to start wake word recognition:", e);
    }
  }, [createRecognition]);

  useEffect(() => {
    restartRef.current = restart;
  }, [restart]);

  const stopListening = useCallback(() => {
    cooldownRef.current = false;
    if (recognitionRef.current) {
      try { recognitionRef.current.abort(); } catch { /* noop */ }
      recognitionRef.current = null;
    }
    setListening(false);
  }, []);

  // Start/stop based on enabled prop
  useEffect(() => {
    if (enabled && supported) {
      restart();
    } else {
      stopListening();
    }
    return () => stopListening();
  }, [enabled, supported, restart, stopListening]);

  return { listening, supported };
}

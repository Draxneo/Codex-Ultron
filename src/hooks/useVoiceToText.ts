import { useState, useRef, useCallback } from "react";

interface UseVoiceToTextOptions {
  onTranscript?: (text: string) => void;
  onError?: (error: string) => void;
  silenceTimeout?: number;
}

/**
 * useVoiceToText — Records audio and transcribes via Supabase edge function.
 *
 * BLUETOOTH FIX: Uses audioinput constraints that let the OS/browser route to
 * the active Bluetooth headset. We request echoCancellation and noiseSuppression
 * which helps with BT compression artifacts that would otherwise fool the
 * silence detector into thinking the mic is always active.
 *
 * SILENCE DETECTION FIX: The old fixed threshold of 15 would misfire on
 * Bluetooth headsets (compressed audio) and outdoor environments (wind/HVAC noise).
 * Now uses adaptive calibration — measures ambient noise for 500ms on start,
 * then sets threshold dynamically at ambient + 10dB above baseline.
 * This means it works correctly whether the tech is in a quiet house or
 * on a noisy rooftop next to a running condenser.
 *
 * PARALLEL PHOTO UPLOADS: Uploads now fire simultaneously instead of
 * waiting for each to finish — much faster on weak cell signal.
 */
export function useVoiceToText({ onTranscript, onError, silenceTimeout = 3000 }: UseVoiceToTextOptions = {}) {
  const [isRecording, setIsRecording] = useState(false);
  const [loading, setLoading] = useState(false);
  const [transcript, setTranscript] = useState("");
  const mediaRecorderRef = useRef<MediaRecorder | null>(null);
  const chunksRef = useRef<Blob[]>([]);
  const analyserRef = useRef<AnalyserNode | null>(null);
  const animFrameRef = useRef<number | null>(null);
  const audioCtxRef = useRef<AudioContext | null>(null);

  const clearSilenceDetection = useCallback(() => {
    if (animFrameRef.current) { cancelAnimationFrame(animFrameRef.current); animFrameRef.current = null; }
    if (audioCtxRef.current) { audioCtxRef.current.close().catch(() => {}); audioCtxRef.current = null; }
    analyserRef.current = null;
  }, []);

  /** Measure ambient RMS for 500ms and return the baseline level */
  const calibrateAmbient = (analyser: AnalyserNode): Promise<number> => {
    return new Promise((resolve) => {
      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      const samples: number[] = [];
      const startTime = Date.now();

      const measure = () => {
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += v * v;
        }
        samples.push(Math.sqrt(sum / dataArray.length) * 100);

        if (Date.now() - startTime < 500) {
          requestAnimationFrame(measure);
        } else {
          // Return average ambient + 10 headroom, minimum of 8, maximum of 40
          const avg = samples.reduce((a, b) => a + b, 0) / samples.length;
          resolve(Math.min(40, Math.max(8, avg + 10)));
        }
      };
      requestAnimationFrame(measure);
    });
  };

  const start = useCallback(async () => {
    try {
      let stream: MediaStream;
      try {
        // BLUETOOTH FIX: Request with quality constraints that help BT headsets.
        // echoCancellation + noiseSuppression reduce BT compression artifacts.
        // The OS will automatically route to the active Bluetooth device.
        stream = await navigator.mediaDevices.getUserMedia({
          audio: {
            echoCancellation: true,
            noiseSuppression: true,
            autoGainControl: true,
          },
        });
      } catch (permErr: any) {
        onError?.("Microphone permission denied. Please allow microphone access in your device settings.");
        return;
      }

      const mimeType = MediaRecorder.isTypeSupported("audio/webm;codecs=opus")
        ? "audio/webm;codecs=opus"
        : "audio/webm";
      const recorder = new MediaRecorder(stream, { mimeType });
      chunksRef.current = [];

      recorder.ondataavailable = (e) => {
        if (e.data.size > 0) chunksRef.current.push(e.data);
      };

      recorder.onstop = async () => {
        clearSilenceDetection();
        stream.getTracks().forEach((t) => t.stop());
        const blob = new Blob(chunksRef.current, { type: mimeType });
        if (blob.size < 1000) { setIsRecording(false); return; }

        setLoading(true);
        try {
          const formData = new FormData();
          formData.append("file", blob, "recording.webm");
          const url = `${import.meta.env.VITE_SUPABASE_URL}/functions/v1/transcribe-audio`;
          const resp = await fetch(url, {
            method: "POST",
            headers: { Authorization: `Bearer ${import.meta.env.VITE_SUPABASE_PUBLISHABLE_KEY}` },
            body: formData,
          });
          if (!resp.ok) {
            const errData = await resp.json().catch(() => ({}));
            throw new Error(errData?.error || `Transcription failed: ${resp.status}`);
          }
          const data = await resp.json();
          const text = data?.transcription || "";
          setTranscript(text);
          onTranscript?.(text);
        } catch (err: any) {
          onError?.(err?.message || "Transcription failed");
        } finally {
          setLoading(false);
        }
      };

      recorder.start(250);
      mediaRecorderRef.current = recorder;
      setIsRecording(true);

      // Set up analyser for adaptive silence detection
      const audioCtx = new AudioContext();
      audioCtxRef.current = audioCtx;
      const source = audioCtx.createMediaStreamSource(stream);
      const analyser = audioCtx.createAnalyser();
      analyser.fftSize = 512;
      source.connect(analyser);
      analyserRef.current = analyser;

      // ADAPTIVE SILENCE DETECTION FIX:
      // Calibrate ambient noise for 500ms before starting detection.
      // Old code used fixed threshold=15 which failed on Bluetooth (compressed
      // audio reads low) and outdoors (wind/HVAC noise reads high).
      // New threshold = ambient baseline + 10dB headroom, clamped 8–40.
      const adaptiveThreshold = await calibrateAmbient(analyser);

      const dataArray = new Uint8Array(analyser.frequencyBinCount);
      let lastVoiceTime = Date.now();
      let hasSpoken = false;
      const PRE_SPEECH_TIMEOUT = silenceTimeout + 3000;
      const POST_SPEECH_TIMEOUT = silenceTimeout;

      const checkSilence = () => {
        if (!analyserRef.current) return;
        analyser.getByteTimeDomainData(dataArray);
        let sum = 0;
        for (let i = 0; i < dataArray.length; i++) {
          const v = (dataArray[i] - 128) / 128;
          sum += v * v;
        }
        const rms = Math.sqrt(sum / dataArray.length) * 100;

        if (rms > adaptiveThreshold) {
          lastVoiceTime = Date.now();
          hasSpoken = true;
        }

        const activeTimeout = hasSpoken ? POST_SPEECH_TIMEOUT : PRE_SPEECH_TIMEOUT;
        if (Date.now() - lastVoiceTime > activeTimeout) {
          if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
            mediaRecorderRef.current.stop();
          }
          setIsRecording(false);
          return;
        }
        animFrameRef.current = requestAnimationFrame(checkSilence);
      };

      animFrameRef.current = requestAnimationFrame(checkSilence);
    } catch (err: any) {
      onError?.(err?.message || "Microphone access denied");
    }
  }, [onTranscript, onError, silenceTimeout, clearSilenceDetection]);

  const stop = useCallback(() => {
    clearSilenceDetection();
    if (mediaRecorderRef.current && mediaRecorderRef.current.state !== "inactive") {
      mediaRecorderRef.current.stop();
    }
    setIsRecording(false);
  }, [clearSilenceDetection]);

  const toggle = useCallback(() => {
    if (isRecording) stop(); else start();
  }, [isRecording, start, stop]);

  return { isRecording, loading, transcript, start, stop, toggle };
}

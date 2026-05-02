/**
 * Softphone audio utilities - DTMF dial tones + ringtone playback
 * Uses Web Audio API for low-latency, zero-asset DTMF generation.
 * Supports custom uploaded audio ringtones via URL.
 */

const DTMF_FREQS: Record<string, [number, number]> = {
  "1": [697, 1209], "2": [697, 1336], "3": [697, 1477],
  "4": [770, 1209], "5": [770, 1336], "6": [770, 1477],
  "7": [852, 1209], "8": [852, 1336], "9": [852, 1477],
  "*": [941, 1209], "0": [941, 1336], "#": [941, 1477],
};

let audioCtx: AudioContext | null = null;

function getAudioCtx(): AudioContext {
  if (!audioCtx) audioCtx = new AudioContext();
  if (audioCtx.state === "suspended") {
    audioCtx.resume().catch((error) => {
      console.warn("[softphoneAudio] Could not resume audio context.", error);
    });
  }
  return audioCtx;
}

/** Pre-warm the AudioContext on user gesture so ringtones work on Android WebView */
export function warmAudioContext() {
  const ctx = getAudioCtx();
  if (ctx.state === "suspended") {
    ctx.resume().catch((error) => {
      console.warn("[softphoneAudio] Could not warm audio context.", error);
    });
  }
  // Play a silent buffer to unlock audio on iOS/Android
  const buf = ctx.createBuffer(1, 1, 22050);
  const src = ctx.createBufferSource();
  src.buffer = buf;
  src.connect(ctx.destination);
  src.start(0);
}

/** Check if Web Audio is actually working (not suspended) */
function isAudioCtxRunning(): boolean {
  return audioCtx?.state === "running";
}

/** Play a short DTMF tone for a key press */
export function playDtmfTone(key: string, durationMs = 120) {
  const freqs = DTMF_FREQS[key];
  if (!freqs) return;

  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  const duration = durationMs / 1000;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.15, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + duration);
  gain.connect(ctx.destination);

  freqs.forEach((freq) => {
    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, now);
    osc.connect(gain);
    osc.start(now);
    osc.stop(now + duration);
  });
}

// Ringtone definitions

export interface RingtoneOption {
  id: string;
  label: string;
  /** Tone pattern: array of [freqHz, durationMs] with 0 freq = silence. Empty for silent or custom. */
  pattern: [number, number][];
  /** If true, this is a custom uploaded audio file */
  isCustom?: boolean;
}

export const RINGTONE_OPTIONS: RingtoneOption[] = [
  {
    id: "classic",
    label: "Classic Ring",
    pattern: [
      [440, 400], [480, 400], [0, 200],
      [440, 400], [480, 400], [0, 1600],
    ],
  },
  {
    id: "modern",
    label: "Modern Pulse",
    pattern: [
      [880, 150], [0, 100], [880, 150], [0, 100], [880, 150], [0, 2000],
    ],
  },
  {
    id: "gentle",
    label: "Gentle Chime",
    pattern: [
      [523, 200], [659, 200], [784, 300], [0, 2300],
    ],
  },
  {
    id: "urgent",
    label: "Urgent",
    pattern: [
      [1000, 200], [0, 100], [1000, 200], [0, 100], [1000, 200], [0, 100], [1000, 200], [0, 1600],
    ],
  },
  {
    id: "none",
    label: "Silent",
    pattern: [],
  },
];

let ringtoneInterval: ReturnType<typeof setInterval> | null = null;
let ringtoneAbort: AbortController | null = null;
let customAudioEl: HTMLAudioElement | null = null;

let fallbackAudioEl: HTMLAudioElement | null = null;

/** Generate a WAV data URI for a simple ringtone pattern (fallback for suspended AudioContext) */
function generateToneWav(freqs: number[], durationMs: number, sampleRate = 22050): string {
  const numSamples = Math.floor((durationMs / 1000) * sampleRate);
  const buffer = new ArrayBuffer(44 + numSamples * 2);
  const view = new DataView(buffer);

  // WAV header
  const writeStr = (offset: number, str: string) => { for (let i = 0; i < str.length; i++) view.setUint8(offset + i, str.charCodeAt(i)); };
  writeStr(0, "RIFF");
  view.setUint32(4, 36 + numSamples * 2, true);
  writeStr(8, "WAVE");
  writeStr(12, "fmt ");
  view.setUint32(16, 16, true);
  view.setUint16(20, 1, true);
  view.setUint16(22, 1, true);
  view.setUint32(24, sampleRate, true);
  view.setUint32(28, sampleRate * 2, true);
  view.setUint16(32, 2, true);
  view.setUint16(34, 16, true);
  writeStr(36, "data");
  view.setUint32(40, numSamples * 2, true);

  // Generate tone
  for (let i = 0; i < numSamples; i++) {
    let sample = 0;
    const t = i / sampleRate;
    for (const f of freqs) {
      sample += Math.sin(2 * Math.PI * f * t);
    }
    sample = (sample / freqs.length) * 0.12; // normalize + volume
    // Fade out last 10%
    const fadePos = i / numSamples;
    if (fadePos > 0.9) sample *= (1 - fadePos) / 0.1;
    view.setInt16(44 + i * 2, Math.max(-32768, Math.min(32767, sample * 32767)), true);
  }

  const bytes = new Uint8Array(buffer);
  let binary = "";
  for (let i = 0; i < bytes.length; i++) binary += String.fromCharCode(bytes[i]);
  return "data:audio/wav;base64," + btoa(binary);
}

/** Build a looping fallback ringtone as an HTMLAudioElement */
function buildFallbackRingtone(pattern: [number, number][]): HTMLAudioElement | null {
  if (pattern.length === 0) return null;
  // Use the first tone in the pattern for the fallback
  const firstTone = pattern.find(([f]) => f > 0);
  if (!firstTone) return null;

  const wavUri = generateToneWav([firstTone[0]], patternDuration(pattern));
  const audio = new Audio(wavUri);
  audio.loop = true;
  audio.volume = 0.4;
  return audio;
}

/** Play one cycle of a ringtone pattern */
function playRingtoneOnce(pattern: [number, number][]) {
  if (pattern.length === 0) return;
  const ctx = getAudioCtx();
  let offset = ctx.currentTime;

  pattern.forEach(([freq, ms]) => {
    const dur = ms / 1000;
    if (freq > 0) {
      const gain = ctx.createGain();
      gain.gain.setValueAtTime(0.12, offset);
      gain.gain.exponentialRampToValueAtTime(0.001, offset + dur);
      gain.connect(ctx.destination);

      const osc = ctx.createOscillator();
      osc.type = "sine";
      osc.frequency.setValueAtTime(freq, offset);
      osc.connect(gain);
      osc.start(offset);
      osc.stop(offset + dur);
    }
    offset += dur;
  });
}

/** Get total duration of a ringtone pattern in ms */
function patternDuration(pattern: [number, number][]): number {
  return pattern.reduce((sum, [, ms]) => sum + ms, 0);
}

/** Check if a ringtone ID refers to a custom uploaded file */
export function isCustomRingtone(id: string): boolean {
  return id.startsWith("custom:");
}

/** Start looping a ringtone; call stopRingtone() to end */
export function startRingtone(ringtoneId?: string, customUrl?: string) {
  stopRingtone();
  const id = ringtoneId || "classic";

  // Custom uploaded audio
  if (isCustomRingtone(id) && customUrl) {
    customAudioEl = new Audio(customUrl);
    customAudioEl.loop = true;
    customAudioEl.volume = 0.5;
    customAudioEl.play().catch(console.error);
    return;
  }

  const rt = RINGTONE_OPTIONS.find((r) => r.id === id) || RINGTONE_OPTIONS[0];
  if (rt.pattern.length === 0) return;

  // Try Web Audio first
  const ctx = getAudioCtx();
  if (isAudioCtxRunning()) {
    playRingtoneOnce(rt.pattern);
    const intervalMs = patternDuration(rt.pattern);
    ringtoneAbort = new AbortController();
    ringtoneInterval = setInterval(() => {
      playRingtoneOnce(rt.pattern);
    }, intervalMs);
    return;
  }

  // Fallback: Web Audio is suspended (common on Android WebView)
  // Generate a WAV-based HTMLAudioElement ringtone
  console.warn("AudioContext suspended — using HTMLAudioElement fallback for ringtone");
  fallbackAudioEl = buildFallbackRingtone(rt.pattern);
  if (fallbackAudioEl) {
    fallbackAudioEl.play().catch((err) => {
      console.error("Fallback ringtone play failed:", err);
    });
  }
}

/** Stop the current ringtone loop */
export function stopRingtone() {
  if (ringtoneInterval) {
    clearInterval(ringtoneInterval);
    ringtoneInterval = null;
  }
  ringtoneAbort?.abort();
  ringtoneAbort = null;
  if (customAudioEl) {
    customAudioEl.pause();
    customAudioEl.currentTime = 0;
    customAudioEl = null;
  }
  if (fallbackAudioEl) {
    fallbackAudioEl.pause();
    fallbackAudioEl.currentTime = 0;
    fallbackAudioEl = null;
  }
}

/** Play a single short call-waiting beep (440Hz, 200ms) */
export function playCallWaitingBeep() {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;
  const dur = 0.2;

  const gain = ctx.createGain();
  gain.gain.setValueAtTime(0.18, now);
  gain.gain.exponentialRampToValueAtTime(0.001, now + dur);
  gain.connect(ctx.destination);

  const osc = ctx.createOscillator();
  osc.type = "sine";
  osc.frequency.setValueAtTime(440, now);
  osc.connect(gain);
  osc.start(now);
  osc.stop(now + dur);
}

/** Play a short SMS alert chime — ascending C5→E5 two-tone */
export function playSmsAlert() {
  const ctx = getAudioCtx();
  const now = ctx.currentTime;

  const notes = [523, 659]; // C5, E5
  let offset = now;
  notes.forEach((freq) => {
    const dur = 0.12;
    const gain = ctx.createGain();
    gain.gain.setValueAtTime(0.18, offset);
    gain.gain.exponentialRampToValueAtTime(0.001, offset + dur);
    gain.connect(ctx.destination);

    const osc = ctx.createOscillator();
    osc.type = "sine";
    osc.frequency.setValueAtTime(freq, offset);
    osc.connect(gain);
    osc.start(offset);
    osc.stop(offset + dur);
    offset += dur;
  });
}

/** Play a short preview of a ringtone (one cycle for built-in, 4s for custom) */
export function previewRingtone(ringtoneId: string, customUrl?: string) {
  stopRingtone();

  if (isCustomRingtone(ringtoneId) && customUrl) {
    const audio = new Audio(customUrl);
    audio.volume = 0.5;
    audio.play().catch(console.error);
    // Stop after 4 seconds
    setTimeout(() => {
      audio.pause();
      audio.currentTime = 0;
    }, 4000);
    return;
  }

  const rt = RINGTONE_OPTIONS.find((r) => r.id === ringtoneId);
  if (rt && rt.pattern.length > 0) {
    playRingtoneOnce(rt.pattern);
  }
}

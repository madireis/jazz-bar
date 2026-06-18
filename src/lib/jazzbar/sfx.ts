/* eslint-disable @typescript-eslint/no-explicit-any */
// SFX player with pooled Audio elements for instant playback.
// Also exports a shared AudioContext + AnalyserNode for the music visualizer.

let audioCtx: AudioContext | null = null;
let analyser: AnalyserNode | null = null;
let freqData: Uint8Array | null = null;

export function getAudioContext(): AudioContext | null {
  return audioCtx;
}

export function getAnalyser(): AnalyserNode | null {
  return analyser;
}

/** Returns a 0..1 "energy" value from the analyser's low-frequency bins (bass). */
export function getBassEnergy(): number {
  if (!analyser || !freqData) return 0;
  try {
    analyser.getByteFrequencyData(freqData as Uint8Array<ArrayBuffer>);
    // Average the first 8 bins (roughly 0-350 Hz at 44100 sample rate)
    let sum = 0;
    const bins = Math.min(8, freqData.length);
    for (let i = 0; i < bins; i++) sum += freqData[i];
    return sum / (bins * 255);
  } catch {
    return 0;
  }
}

export function unlockAudio() {
  if (audioCtx) return;
  try {
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    audioCtx = new Ctx();

    // Set up the analyser node
    analyser = audioCtx.createAnalyser();
    analyser.fftSize = 256;
    analyser.smoothingTimeConstant = 0.8;
    freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.connect(audioCtx.destination);

    // Create and play a silent buffer to unlock on iOS/Safari
    const buf = audioCtx.createBuffer(1, 1, 22050);
    const src = audioCtx.createBufferSource();
    src.buffer = buf;
    src.connect(audioCtx.destination);
    src.start(0);
  } catch {
    /* noop */
  }
}

/**
 * Connect an HTMLAudioElement to the shared analyser node.
 * Returns the MediaElementSourceNode so the caller can disconnect later.
 * NOTE: Due to CORS restrictions on external streams, the analyser may
 * not receive data — but audio playback will still work fine.
 */
export function connectToAnalyser(audio: HTMLAudioElement): MediaElementAudioSourceNode | null {
  if (!audioCtx || !analyser) return null;
  try {
    const source = audioCtx.createMediaElementSource(audio);
    source.connect(analyser);
    // analyser is already connected to destination in unlockAudio
    return source;
  } catch {
    return null;
  }
}

/** Smoothly fade audio volume from current to target over durationMs. */
export function fadeVolume(
  audio: HTMLAudioElement,
  target: number,
  durationMs: number,
  onDone?: () => void,
): number {
  const start = audio.volume;
  const diff = target - start;
  if (Math.abs(diff) < 0.01) {
    audio.volume = target;
    onDone?.();
    return 0;
  }
  const startTime = performance.now();
  let raf = 0;
  const tick = () => {
    const elapsed = performance.now() - startTime;
    const t = Math.min(1, elapsed / durationMs);
    // Ease out cubic
    const eased = 1 - Math.pow(1 - t, 3);
    audio.volume = Math.max(0, Math.min(1, start + diff * eased));
    if (t < 1) {
      raf = requestAnimationFrame(tick);
    } else {
      audio.volume = target;
      onDone?.();
    }
  };
  raf = requestAnimationFrame(tick);
  return raf;
}

function createPool(url: string, size = 3): () => void {
  let pool: HTMLAudioElement[] | null = null;
  let cursor = 0;
  return () => {
    if (typeof Audio === "undefined") return;
    if (!pool) {
      pool = [];
      for (let i = 0; i < size; i++) {
        const a = new Audio(url);
        a.preload = "auto";
        pool.push(a);
      }
    }
    const a = pool[cursor];
    cursor = (cursor + 1) % pool.length;
    a.currentTime = 0;
    a.play().catch(() => {});
  };
}

export const sfx = {
  start: createPool("/timerstart.wav", 2),
  growth: createPool("/growth.wav", 2),
  alarm: createPool("/alarm.wav", 2),
};

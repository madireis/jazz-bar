// Synthesized SFX via WebAudio — no asset files required.
let ctx: AudioContext | null = null;

function getCtx(): AudioContext | null {
  if (typeof window === "undefined") return null;
  if (!ctx) {
    const AC = window.AudioContext || (window as unknown as { webkitAudioContext: typeof AudioContext }).webkitAudioContext;
    if (!AC) return null;
    ctx = new AC();
  }
  return ctx;
}

export function unlockAudio() {
  const c = getCtx();
  if (c && c.state === "suspended") void c.resume();
}

function tone(freq: number, duration: number, type: OscillatorType = "sine", gain = 0.15, delay = 0) {
  const c = getCtx();
  if (!c) return;
  const t0 = c.currentTime + delay;
  const osc = c.createOscillator();
  const g = c.createGain();
  osc.type = type;
  osc.frequency.setValueAtTime(freq, t0);
  g.gain.setValueAtTime(0, t0);
  g.gain.linearRampToValueAtTime(gain, t0 + 0.02);
  g.gain.exponentialRampToValueAtTime(0.0001, t0 + duration);
  osc.connect(g).connect(c.destination);
  osc.start(t0);
  osc.stop(t0 + duration + 0.05);
}

export const sfx = {
  start: () => {
    tone(523.25, 0.25, "sine", 0.18);
    tone(659.25, 0.35, "sine", 0.16, 0.08);
  },
  growth: () => {
    tone(880, 0.2, "triangle", 0.14);
    tone(1318.5, 0.35, "triangle", 0.1, 0.06);
  },
  alarm: () => {
    for (let i = 0; i < 4; i++) {
      tone(740, 0.2, "square", 0.16, i * 0.28);
      tone(880, 0.2, "square", 0.14, i * 0.28 + 0.14);
    }
  },
};

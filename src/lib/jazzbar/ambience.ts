// Procedural ambience engine using Web Audio API.
// Each "voice" is a synthesised loop (rain/fire/wind/mumbling/cafe/vinyl crackle).
// No external assets required — works offline, loads instantly.

export type AmbienceKey = "rain" | "fire" | "mumbling" | "wind" | "vinyl" | "cafe";

interface Voice {
  gain: GainNode;
  nodes: AudioNode[];
  stop?: () => void;
}

function makeNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  for (let i = 0; i < data.length; i++) data[i] = Math.random() * 2 - 1;
  return buf;
}

function makePinkNoiseBuffer(ctx: AudioContext, seconds = 2): AudioBuffer {
  const buf = ctx.createBuffer(1, ctx.sampleRate * seconds, ctx.sampleRate);
  const data = buf.getChannelData(0);
  let b0 = 0, b1 = 0, b2 = 0, b3 = 0, b4 = 0, b5 = 0, b6 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.96900 * b2 + white * 0.1538520;
    b3 = 0.86650 * b3 + white * 0.3104856;
    b4 = 0.55000 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.0168980;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buf;
}

export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: Partial<Record<AmbienceKey, Voice>> = {};
  private levels: Record<AmbienceKey, number> = { rain: 0, fire: 0, mumbling: 0, wind: 0, vinyl: 0, cafe: 0 };
  private muted = false;

  ensure() {
    if (this.ctx) return this.ctx;
    const Ctx = (window.AudioContext || (window as any).webkitAudioContext) as typeof AudioContext;
    this.ctx = new Ctx();
    this.master = this.ctx.createGain();
    this.master.gain.value = this.muted ? 0 : 1;
    this.master.connect(this.ctx.destination);
    return this.ctx;
  }

  resume() {
    this.ensure();
    if (this.ctx?.state === "suspended") this.ctx.resume().catch(() => {});
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx!.currentTime, 0.05);
  }

  setLevel(key: AmbienceKey, level0to100: number) {
    this.levels[key] = level0to100;
    const v = Math.max(0, Math.min(1, level0to100 / 100));
    if (v > 0) {
      this.ensure();
      if (!this.voices[key]) this.start(key);
      const voice = this.voices[key]!;
      voice.gain.gain.setTargetAtTime(v * voiceTrim(key), this.ctx!.currentTime, 0.15);
    } else if (this.voices[key]) {
      const voice = this.voices[key]!;
      voice.gain.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.3);
      // keep node alive for fast re-enable
    }
  }

  private start(key: AmbienceKey) {
    const ctx = this.ensure();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    gain.connect(this.master!);

    const nodes: AudioNode[] = [];
    let stop: (() => void) | undefined;

    if (key === "rain") {
      const src = ctx.createBufferSource();
      src.buffer = makePinkNoiseBuffer(ctx, 4);
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass"; hp.frequency.value = 600;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 5200;
      src.connect(hp).connect(lp).connect(gain);
      src.start();
      nodes.push(src, hp, lp);
      stop = () => src.stop();
    } else if (key === "fire") {
      // Low rumble + occasional crackles
      const src = ctx.createBufferSource();
      src.buffer = makePinkNoiseBuffer(ctx, 4);
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 480;
      src.connect(lp).connect(gain);
      src.start();
      nodes.push(src, lp);
      // Crackles
      const crackleInt = window.setInterval(() => {
        if (gain.gain.value <= 0.001) return;
        const c = ctx.createBufferSource();
        c.buffer = makeNoiseBuffer(ctx, 0.12);
        const cf = ctx.createBiquadFilter();
        cf.type = "bandpass"; cf.frequency.value = 1800 + Math.random() * 1800; cf.Q.value = 4;
        const cg = ctx.createGain();
        cg.gain.value = 0;
        const now = ctx.currentTime;
        cg.gain.linearRampToValueAtTime(0.6 * Math.random(), now + 0.005);
        cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.18);
        c.connect(cf).connect(cg).connect(gain);
        c.start(now);
        c.stop(now + 0.2);
      }, 180);
      stop = () => { src.stop(); window.clearInterval(crackleInt); };
    } else if (key === "wind") {
      const src = ctx.createBufferSource();
      src.buffer = makePinkNoiseBuffer(ctx, 6);
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 800;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.08;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 500;
      lfo.connect(lfoGain).connect(lp.frequency);
      lfo.start();
      src.connect(lp).connect(gain);
      src.start();
      nodes.push(src, lp, lfo, lfoGain);
      stop = () => { src.stop(); lfo.stop(); };
    } else if (key === "mumbling") {
      // Filtered babble — low frequency murmur of a crowd
      const src = ctx.createBufferSource();
      src.buffer = makePinkNoiseBuffer(ctx, 5);
      src.loop = true;
      const bp = ctx.createBiquadFilter();
      bp.type = "bandpass"; bp.frequency.value = 380; bp.Q.value = 1.4;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 900;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.6;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 220;
      lfo.connect(lfoGain).connect(bp.frequency);
      lfo.start();
      src.connect(bp).connect(lp).connect(gain);
      src.start();
      nodes.push(src, bp, lp, lfo, lfoGain);
      stop = () => { src.stop(); lfo.stop(); };
    } else if (key === "cafe") {
      // Brighter wash: cups, hiss
      const src = ctx.createBufferSource();
      src.buffer = makePinkNoiseBuffer(ctx, 4);
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass"; hp.frequency.value = 300;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass"; lp.frequency.value = 3200;
      src.connect(hp).connect(lp).connect(gain);
      src.start();
      nodes.push(src, hp, lp);
      // Occasional cup/clink
      const clinkInt = window.setInterval(() => {
        if (gain.gain.value <= 0.001) return;
        if (Math.random() > 0.35) return;
        const o = ctx.createOscillator();
        o.type = "triangle";
        o.frequency.value = 1400 + Math.random() * 2200;
        const og = ctx.createGain();
        og.gain.value = 0;
        const now = ctx.currentTime;
        og.gain.linearRampToValueAtTime(0.18, now + 0.005);
        og.gain.exponentialRampToValueAtTime(0.0001, now + 0.4);
        o.connect(og).connect(gain);
        o.start(now);
        o.stop(now + 0.45);
      }, 1400);
      stop = () => { src.stop(); window.clearInterval(clinkInt); };
    } else if (key === "vinyl") {
      // Vinyl crackle: hiss + random pops
      const src = ctx.createBufferSource();
      src.buffer = makeNoiseBuffer(ctx, 3);
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass"; hp.frequency.value = 4000;
      src.connect(hp).connect(gain);
      src.start();
      nodes.push(src, hp);
      const popInt = window.setInterval(() => {
        if (gain.gain.value <= 0.001) return;
        const c = ctx.createBufferSource();
        c.buffer = makeNoiseBuffer(ctx, 0.04);
        const cg = ctx.createGain();
        cg.gain.value = 0;
        const now = ctx.currentTime;
        cg.gain.linearRampToValueAtTime(0.5, now + 0.002);
        cg.gain.exponentialRampToValueAtTime(0.0001, now + 0.06);
        c.connect(cg).connect(gain);
        c.start(now);
        c.stop(now + 0.08);
      }, 220);
      stop = () => { src.stop(); window.clearInterval(popInt); };
    }

    this.voices[key] = { gain, nodes, stop };
  }

  destroy() {
    Object.values(this.voices).forEach((v) => v?.stop?.());
    this.voices = {};
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

function voiceTrim(key: AmbienceKey): number {
  // Per-voice headroom so sliders feel balanced
  switch (key) {
    case "rain": return 0.55;
    case "fire": return 0.7;
    case "wind": return 0.5;
    case "mumbling": return 0.45;
    case "cafe": return 0.4;
    case "vinyl": return 0.3;
  }
}

let singleton: Ambience | null = null;
export function getAmbience(): Ambience {
  if (!singleton) singleton = new Ambience();
  return singleton;
}

export const AMBIENCE_LIST: { key: AmbienceKey; label: string; emoji: string }[] = [
  { key: "rain", label: "Rain", emoji: "☔" },
  { key: "fire", label: "Fireplace", emoji: "🔥" },
  { key: "mumbling", label: "Crowd Mumble", emoji: "🗣" },
  { key: "wind", label: "Night Wind", emoji: "🌬" },
  { key: "cafe", label: "Café", emoji: "☕" },
  { key: "vinyl", label: "Vinyl Crackle", emoji: "💿" },
];

/* eslint-disable @typescript-eslint/no-explicit-any */
// Procedural ambience engine using Web Audio API + HTMLAudioElement for original files.
// Each "voice" is either an original audio file or a synthesised loop.

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
  let b0 = 0,
    b1 = 0,
    b2 = 0,
    b3 = 0,
    b4 = 0,
    b5 = 0,
    b6 = 0;
  for (let i = 0; i < data.length; i++) {
    const white = Math.random() * 2 - 1;
    b0 = 0.99886 * b0 + white * 0.0555179;
    b1 = 0.99332 * b1 + white * 0.0750759;
    b2 = 0.969 * b2 + white * 0.153852;
    b3 = 0.8665 * b3 + white * 0.3104856;
    b4 = 0.55 * b4 + white * 0.5329522;
    b5 = -0.7616 * b5 - white * 0.016898;
    data[i] = (b0 + b1 + b2 + b3 + b4 + b5 + b6 + white * 0.5362) * 0.11;
    b6 = white * 0.115926;
  }
  return buf;
}

export class Ambience {
  private ctx: AudioContext | null = null;
  private master: GainNode | null = null;
  private voices: Partial<Record<AmbienceKey, Voice>> = {};
  private audioTags: Partial<Record<AmbienceKey, HTMLAudioElement>> = {};
  private mediaNodes: Partial<Record<AmbienceKey, MediaElementAudioSourceNode>> = {};
  private panners: Partial<Record<AmbienceKey, StereoPannerNode>> = {};
  private levels: Record<AmbienceKey, number> = {
    rain: 0,
    fire: 0,
    mumbling: 0,
    wind: 0,
    vinyl: 0,
    cafe: 0,
  };
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
    (Object.keys(this.audioTags) as AmbienceKey[]).forEach((k) => {
      const a = this.audioTags[k]!;
      if (a.volume > 0 && a.paused) a.play().catch(() => {});
    });
  }

  setMuted(m: boolean) {
    this.muted = m;
    if (this.master) this.master.gain.setTargetAtTime(m ? 0 : 1, this.ctx!.currentTime, 0.05);
    (Object.keys(this.audioTags) as AmbienceKey[]).forEach((k) => {
      const a = this.audioTags[k]!;
      const v = Math.max(0, Math.min(1, this.levels[k] / 100)) * voiceTrim(k) * (m ? 0 : 1);
      a.volume = v;
      if (v === 0 && !a.paused) a.pause();
      else if (v > 0 && a.paused) a.play().catch(() => {});
    });
  }

  private getPanValue(key: AmbienceKey): number {
    switch (key) {
      case "rain": return -0.8;
      case "fire": return 0.8;
      case "wind": return -0.3;
      default: return 0;
    }
  }

  setLevel(key: AmbienceKey, level0to100: number) {
    this.levels[key] = level0to100;
    const v = Math.max(0, Math.min(1, level0to100 / 100));

    // Prefer original TUI audio files if available
    let fileUrl: string | null = null;
    if (key === "rain") fileUrl = "/rain.ogg";
    if (key === "fire") fileUrl = "/fireplace.ogg";
    if (key === "mumbling") fileUrl = "/bar_murmur.ogg";

    if (fileUrl && typeof Audio !== "undefined") {
      const ctx = this.ensure();
      if (!this.audioTags[key]) {
        const a = new Audio(fileUrl);
        a.loop = true;
        a.crossOrigin = "anonymous";
        this.audioTags[key] = a;

        // Route through Web Audio API for panning
        const source = ctx.createMediaElementSource(a);
        const panner = ctx.createStereoPanner();
        panner.pan.value = this.getPanValue(key);
        source.connect(panner).connect(this.master!);

        this.mediaNodes[key] = source;
        this.panners[key] = panner;
      }
      const a = this.audioTags[key]!;
      const actualV = v * voiceTrim(key) * (this.muted ? 0 : 1);
      a.volume = actualV;
      if (actualV > 0 && a.paused) a.play().catch(() => {});
      else if (actualV === 0 && !a.paused) a.pause();
      return;
    }

    if (v > 0) {
      this.ensure();
      if (!this.voices[key]) this.startProcedural(key);
      const voice = this.voices[key]!;
      voice.gain.gain.setTargetAtTime(v * voiceTrim(key), this.ctx!.currentTime, 0.15);
    } else if (this.voices[key]) {
      const voice = this.voices[key]!;
      voice.gain.gain.setTargetAtTime(0, this.ctx!.currentTime, 0.3);
    }
  }

  private startProcedural(key: AmbienceKey) {
    const ctx = this.ensure();
    const gain = ctx.createGain();
    gain.gain.value = 0;
    
    const panner = ctx.createStereoPanner();
    panner.pan.value = this.getPanValue(key);
    
    gain.connect(panner).connect(this.master!);

    const nodes: AudioNode[] = [panner];
    let stop: (() => void) | undefined;

    if (key === "wind") {
      const src = ctx.createBufferSource();
      src.buffer = makePinkNoiseBuffer(ctx, 6);
      src.loop = true;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 800;
      const lfo = ctx.createOscillator();
      lfo.frequency.value = 0.08;
      const lfoGain = ctx.createGain();
      lfoGain.gain.value = 500;
      lfo.connect(lfoGain).connect(lp.frequency);
      lfo.start();
      src.connect(lp).connect(gain);
      src.start();
      nodes.push(src, lp, lfo, lfoGain);
      stop = () => {
        src.stop();
        lfo.stop();
      };
    } else if (key === "cafe") {
      const src = ctx.createBufferSource();
      src.buffer = makePinkNoiseBuffer(ctx, 4);
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 300;
      const lp = ctx.createBiquadFilter();
      lp.type = "lowpass";
      lp.frequency.value = 3200;
      src.connect(hp).connect(lp).connect(gain);
      src.start();
      nodes.push(src, hp, lp);
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
      stop = () => {
        src.stop();
        window.clearInterval(clinkInt);
      };
    } else if (key === "vinyl") {
      const src = ctx.createBufferSource();
      src.buffer = makeNoiseBuffer(ctx, 3);
      src.loop = true;
      const hp = ctx.createBiquadFilter();
      hp.type = "highpass";
      hp.frequency.value = 4000;
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
      stop = () => {
        src.stop();
        window.clearInterval(popInt);
      };
    }

    this.voices[key] = { gain, nodes, stop };
  }

  destroy() {
    Object.values(this.voices).forEach((v) => v?.stop?.());
    this.voices = {};
    Object.values(this.audioTags).forEach((a) => {
      if (a) {
        a.pause();
        a.src = "";
      }
    });
    this.audioTags = {};
    this.mediaNodes = {};
    this.panners = {};
    this.ctx?.close().catch(() => {});
    this.ctx = null;
  }
}

function voiceTrim(key: AmbienceKey): number {
  switch (key) {
    case "rain":
      return 1.0;
    case "fire":
      return 1.0;
    case "wind":
      return 0.5;
    case "mumbling":
      return 1.0;
    case "cafe":
      return 0.4;
    case "vinyl":
      return 0.3;
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

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { SCENE_STAGES, STAGE_COUNT, stageForElapsed } from "@/lib/jazzbar/scene";
import { QUOTES, randomQuote as pickQuote } from "@/lib/jazzbar/quotes";
import {
  DEFAULT_SETTINGS,
  loadGroove,
  loadSettings,
  saveGroove,
  saveSettings,
  type JazzbarSettings,
} from "@/lib/jazzbar/storage";
import { sfx, unlockAudio } from "@/lib/jazzbar/sfx";
import { createParticleSystem } from "@/lib/jazzbar/particles";

type Phase = "idle" | "work" | "break" | "paused";

interface Preset {
  label: string;
  work: number; // minutes
  rest: number;
}
const PRESETS: Preset[] = [
  { label: "25 + 5", work: 25, rest: 5 },
  { label: "45 + 15", work: 45, rest: 15 },
  { label: "50 + 10", work: 50, rest: 10 },
  { label: "90 + 20", work: 90, rest: 20 },
];

function fmt(s: number) {
  s = Math.max(0, Math.floor(s));
  const m = Math.floor(s / 60);
  const r = s % 60;
  return `${String(m).padStart(2, "0")}:${String(r).padStart(2, "0")}`;
}

export default function JazzBar() {
  const [entered, setEntered] = useState(false);
  const [settings, setSettings] = useState<JazzbarSettings>(DEFAULT_SETTINGS);
  const [groove, setGroove] = useState(0);

  const [phase, setPhase] = useState<Phase>("idle");
  const [preset, setPreset] = useState<Preset>(PRESETS[0]);
  const [remaining, setRemaining] = useState(PRESETS[0].work * 60);
  const [sessionElapsed, setSessionElapsed] = useState(0); // ms, drives stages
  const [stage, setStage] = useState(0);
  const [quote, setQuote] = useState(QUOTES[0]);
  const [typed, setTyped] = useState("");
  const [controlsVisible, setControlsVisible] = useState(true);
  const [rainActive] = useState(() => Math.random() < 0.05);
  const [pulseKey, setPulseKey] = useState(0);

  const lastTickRef = useRef<number>(0);
  const idleTimerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const reducedMotion = useMemo(
    () => typeof window !== "undefined" && window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // Init from storage
  useEffect(() => {
    setSettings(loadSettings());
    setGroove(loadGroove());
    setQuote(pickQuote());
  }, []);

  // Persist settings
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Typewriter
  useEffect(() => {
    setTyped("");
    let i = 0;
    const full = `"${quote.text}" — ${quote.author}`;
    const id = window.setInterval(() => {
      i++;
      setTyped(full.slice(0, i));
      if (i >= full.length) window.clearInterval(id);
    }, 28);
    return () => window.clearInterval(id);
  }, [quote]);

  // Main timer loop
  useEffect(() => {
    if (phase !== "work" && phase !== "break") return;
    lastTickRef.current = performance.now();
    const id = window.setInterval(() => {
      const now = performance.now();
      const dt = now - lastTickRef.current;
      lastTickRef.current = now;

      setRemaining((r) => {
        const nr = r - dt / 1000;
        if (nr <= 0) {
          if (phase === "work") {
            sfx.alarm();
            setGroove((g) => {
              const ng = g + 1;
              saveGroove(ng);
              return ng;
            });
            setPhase("break");
            return preset.rest * 60;
          } else {
            sfx.alarm();
            setPhase("idle");
            return preset.work * 60;
          }
        }
        return nr;
      });

      if (phase === "work") {
        setSessionElapsed((e) => {
          const ne = e + dt;
          const newStage = stageForElapsed(ne);
          setStage((s) => {
            if (newStage !== s) {
              sfx.growth();
              setQuote((q) => pickQuote(q.text));
            }
            return newStage;
          });
          return ne;
        });
      }
      setPulseKey((k) => k + 1);
    }, 250);
    return () => window.clearInterval(id);
  }, [phase, preset]);

  // Particles
  useEffect(() => {
    if (!canvasRef.current || !settings.effectsEnabled) return;
    const sys = createParticleSystem(canvasRef.current, () => ({
      stage,
      rainActive,
      reducedMotion: !!reducedMotion,
    }));
    return () => sys.stop();
  }, [settings.effectsEnabled, stage, rainActive, reducedMotion]);

  // Idle controls fade
  const bumpActivity = useCallback(() => {
    setControlsVisible(true);
    if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    idleTimerRef.current = window.setTimeout(() => setControlsVisible(false), 5000);
  }, []);
  useEffect(() => {
    if (!entered) return;
    bumpActivity();
    const handler = () => bumpActivity();
    window.addEventListener("mousemove", handler);
    window.addEventListener("keydown", handler);
    return () => {
      window.removeEventListener("mousemove", handler);
      window.removeEventListener("keydown", handler);
      if (idleTimerRef.current) window.clearTimeout(idleTimerRef.current);
    };
  }, [entered, bumpActivity]);

  const startSession = useCallback(
    (p: Preset = preset) => {
      unlockAudio();
      setPreset(p);
      setRemaining(p.work * 60);
      setSessionElapsed(0);
      setStage(0);
      setPhase("work");
      sfx.start();
      setQuote(pickQuote());
    },
    [preset],
  );
  const endSession = useCallback(() => {
    setPhase("idle");
    setRemaining(preset.work * 60);
  }, [preset]);
  const togglePause = useCallback(() => {
    setPhase((p) => (p === "work" || p === "break" ? "paused" : p === "paused" ? "work" : p));
  }, []);

  // Keyboard
  useEffect(() => {
    if (!entered) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.code === "Space") {
        e.preventDefault();
        if (phase === "idle") startSession();
        else togglePause();
      } else if (e.key === "Escape") {
        endSession();
      } else if (e.key === "m") {
        setSettings((s) => ({ ...s, musicMuted: !s.musicMuted }));
      } else if (e.key === "a") {
        setSettings((s) => ({ ...s, ambientMuted: !s.ambientMuted }));
      }
    };
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, [entered, phase, startSession, togglePause, endSession]);

  const progress = phase === "break"
    ? 1 - remaining / (preset.rest * 60)
    : phase === "work" || phase === "paused"
      ? 1 - remaining / (preset.work * 60)
      : 0;

  if (!entered) {
    return (
      <button
        onClick={() => {
          unlockAudio();
          setEntered(true);
        }}
        className="fixed inset-0 z-50 flex flex-col items-center justify-center gap-6 bg-background text-foreground transition hover:bg-[oklch(0.16_0.018_50)]"
      >
        <div className="font-mono text-sm uppercase tracking-[0.4em] text-amber/70">jazz bar</div>
        <div className="font-mono text-2xl text-cream md:text-4xl">click to enter the lounge</div>
        <div className="max-w-md text-center text-sm text-dim">
          A cozy focus room. Press Space to start a session. The scene builds the longer you stay.
        </div>
        <div className="mt-6 text-xs uppercase tracking-widest text-amber neon-glow">~ * jazz bar * ~</div>
      </button>
    );
  }

  return (
    <div className="relative h-screen w-screen overflow-hidden">
      {/* Top bar */}
      <header
        className={`pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between px-6 pt-5 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="pointer-events-auto glass rounded-xl px-4 py-2 font-mono text-sm text-cream">
          {phase === "idle" ? "ready" : phase === "paused" ? "paused" : phase === "break" ? "break" : "focus"}
          <span className="ml-3 text-amber">{fmt(remaining)}</span>
        </div>
        <div className="pointer-events-auto glass rounded-xl px-4 py-2 text-xs uppercase tracking-widest text-gold">
          groove · {groove}
        </div>
      </header>

      {/* Center scene */}
      <main className="relative flex h-full w-full flex-col items-center justify-center">
        <pre key={stage} className="scene-art fade-in select-none">
          {SCENE_STAGES[stage]}
        </pre>

        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

        <div className="relative z-10 mt-6 max-w-2xl px-6 text-center">
          <p className="font-sans text-base italic text-cream/90 md:text-lg">
            {typed}
            <span className="ml-0.5 inline-block w-2 animate-pulse text-amber">▍</span>
          </p>
        </div>

        <div
          key={pulseKey}
          className="tick-pulse mt-4 font-mono text-5xl font-bold text-amber md:text-6xl"
          style={{ textShadow: "0 0 20px rgba(212,165,116,0.25)" }}
        >
          {fmt(remaining)}
        </div>

        <div className="mt-2 h-1 w-64 overflow-hidden rounded-full bg-[oklch(0.22_0.014_50)]">
          <div
            className="h-full bg-amber transition-all duration-300"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>

        <div className="mt-2 text-xs uppercase tracking-[0.3em] text-dim">
          stage {stage + 1} / {STAGE_COUNT}
        </div>
      </main>

      {/* Break overlay */}
      {phase === "break" && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[oklch(0.1_0.012_50/0.55)] backdrop-blur-sm">
          <div className="text-center">
            <div className="font-mono text-sm uppercase tracking-[0.5em] text-fire">break</div>
            <div className="mt-3 font-mono text-7xl font-bold text-cream">{fmt(remaining)}</div>
            <div className="mt-3 text-sm text-dim">stretch, breathe, sip something warm</div>
          </div>
        </div>
      )}
      {phase === "paused" && (
        <div className="pointer-events-none absolute inset-0 z-20 flex items-center justify-center bg-[oklch(0.1_0.012_50/0.45)] backdrop-blur-sm">
          <div className="font-mono text-3xl uppercase tracking-[0.4em] text-amber">paused</div>
        </div>
      )}

      {/* Bottom controls */}
      <footer
        className={`fixed inset-x-0 bottom-0 z-30 flex justify-center px-6 pb-5 transition-opacity duration-300 ${
          controlsVisible ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="glass flex flex-wrap items-center justify-center gap-3 rounded-2xl px-5 py-3 text-xs uppercase tracking-widest">
          <span className="text-dim">jazz session</span>
          {PRESETS.map((p) => (
            <button
              key={p.label}
              onClick={() => startSession(p)}
              className={`rounded-md px-3 py-1.5 font-mono transition ${
                preset.label === p.label
                  ? "bg-amber/20 text-amber"
                  : "text-cream/80 hover:bg-amber/10 hover:text-amber"
              }`}
            >
              {p.label}
            </button>
          ))}
          <span className="mx-2 h-4 w-px bg-dim" />
          {phase === "idle" ? (
            <button
              onClick={() => startSession()}
              className="rounded-md bg-amber px-4 py-1.5 font-mono text-bg-deep text-[oklch(0.12_0.012_50)] transition hover:brightness-110"
            >
              start
            </button>
          ) : (
            <>
              <button
                onClick={togglePause}
                className="rounded-md border border-amber/40 px-3 py-1.5 font-mono text-amber hover:bg-amber/10"
              >
                {phase === "paused" ? "resume" : "pause"}
              </button>
              <button
                onClick={endSession}
                className="rounded-md px-3 py-1.5 font-mono text-cream/70 hover:text-destructive"
              >
                end
              </button>
            </>
          )}
          <span className="mx-2 h-4 w-px bg-dim" />
          <button
            onClick={() => setSettings((s) => ({ ...s, ambientMuted: !s.ambientMuted }))}
            className={`rounded-md px-3 py-1.5 font-mono ${settings.ambientMuted ? "text-dim" : "text-gold"}`}
            title="Toggle ambience (A)"
          >
            ambience {settings.ambientMuted ? "off" : "on"}
          </button>
          <button
            onClick={() => setSettings((s) => ({ ...s, effectsEnabled: !s.effectsEnabled }))}
            className={`rounded-md px-3 py-1.5 font-mono ${settings.effectsEnabled ? "text-gold" : "text-dim"}`}
          >
            effects {settings.effectsEnabled ? "on" : "off"}
          </button>
          {rainActive && <span className="font-mono text-rain">· rain tonight ·</span>}
        </div>
      </footer>

      <div className="pointer-events-none fixed bottom-2 right-3 z-30 font-mono text-[10px] uppercase tracking-widest text-dim">
        space · start/pause &nbsp; m · music &nbsp; a · ambience &nbsp; esc · end
      </div>
    </div>
  );
}

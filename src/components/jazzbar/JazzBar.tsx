import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { STAGE_COUNT, stageForElapsed } from "@/lib/jazzbar/scene";
import { QUOTES, randomQuote as pickQuote } from "@/lib/jazzbar/quotes";
import {
  DEFAULT_SETTINGS,
  loadGroove,
  loadHistory,
  loadSession,
  loadSettings,
  saveGroove,
  saveSession,
  saveSettings,
  clearSession,
  type JazzbarSettings,
  type SessionState,
  type SessionLog,
} from "@/lib/jazzbar/storage";
import { sfx, unlockAudio } from "@/lib/jazzbar/sfx";
import { createParticleSystem } from "@/lib/jazzbar/particles";
import MusicPicker from "@/components/jazzbar/MusicPicker";
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
  const [newTaskText, setNewTaskText] = useState("");
  const [controlsVisible, setControlsVisible] = useState(true);
  const [musicOpen, setMusicOpen] = useState(false);
  const [isFullscreen, setIsFullscreen] = useState(false);
  const [zenMode, setZenMode] = useState(false);
  const [statsOpen, setStatsOpen] = useState(false);
  const [history, setHistory] = useState<SessionLog[]>([]);

  // Derived state: rain particles appear if rain audio is active
  const rainActive = settings.ambience.rain > 0 && !settings.ambientMuted;

  const lastTickRef = useRef<number>(0);
  const idleTimerRef = useRef<number | null>(null);
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const phaseRef = useRef<Phase>(phase);
  phaseRef.current = phase;

  const reducedMotion = useMemo(
    () =>
      typeof window !== "undefined" &&
      window.matchMedia?.("(prefers-reduced-motion: reduce)").matches,
    [],
  );

  // Init from storage (including session restore)
  useEffect(() => {
    setSettings(loadSettings());
    setGroove(loadGroove());
    setQuote(pickQuote());
    setHistory(loadHistory());

    // Restore persisted session
    const saved = loadSession();
    if (saved) {
      const matchedPreset = PRESETS.find((p) => p.label === saved.presetLabel) || {
        label: "Custom",
        work: settings.customPreset?.work ?? 25,
        rest: settings.customPreset?.rest ?? 5,
      };
      setPreset(matchedPreset);
      setPhase(saved.phase);
      setRemaining(saved.remaining);
      setSessionElapsed(saved.sessionElapsed);
      setStage(saved.stage);
    }

    // Auto-sync dynamic time and weather (run once on load)
    const syncEnvironment = async () => {
      try {
        // 1. Time sync
        const hour = new Date().getHours();
        const isNight = hour >= 19 || hour <= 5;
        
        // 2. Weather sync (silent IP geolocation -> open-meteo)
        const ipRes = await fetch("https://ipapi.co/json/");
        if (!ipRes.ok) throw new Error("IP API failed");
        const loc = await ipRes.json();
        
        const weatherRes = await fetch(
          `https://api.open-meteo.com/v1/forecast?latitude=${loc.latitude}&longitude=${loc.longitude}&current=precipitation`
        );
        if (!weatherRes.ok) throw new Error("Weather API failed");
        const weather = await weatherRes.json();
        const isRaining = weather.current?.precipitation > 0;

        setSettings((s) => {
          const updates = { ...s };
          // Only switch to midnight if they are still on classic
          if (isNight && s.theme === "classic") updates.theme = "midnight";
          // If it's raining outside, turn on rain audio automatically
          if (isRaining && s.ambience.rain === 0) {
            updates.ambience = { ...s.ambience, rain: 60 };
            updates.ambientMuted = false;
          }
          return updates;
        });
      } catch (err) {
        console.warn("Failed to sync environment:", err);
      }
    };
    syncEnvironment();
  }, []);

  // Persist settings
  useEffect(() => {
    saveSettings(settings);
  }, [settings]);

  // Persist session state every 2 seconds while active
  useEffect(() => {
    if (phase === "idle") {
      clearSession();
      return;
    }
    const id = window.setInterval(() => {
      const state: SessionState = {
        phase: phase as "work" | "break" | "paused",
        remaining,
        sessionElapsed,
        presetLabel: preset.label,
        stage,
        savedAt: Date.now(),
      };
      saveSession(state);
    }, 2000);
    return () => window.clearInterval(id);
  }, [phase, remaining, sessionElapsed, preset, stage]);

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
          if (phaseRef.current === "work") {
            sfx.alarm();
            setGroove((g) => {
              const ng = g + 1;
              saveGroove(ng);
              return ng;
            });
            // Log completed session
            import("@/lib/jazzbar/storage").then(({ saveSessionLog, loadHistory }) => {
              saveSessionLog({
                timestamp: Date.now(),
                durationMinutes: preset.work,
                task: settings.tasks.find(t => !t.done)?.text || "Deep Work",
              });
              setHistory(loadHistory());
            });
            setPhase("break");
            return preset.rest * 60;
          } else {
            sfx.alarm();
            if (settings.autoStart) {
              setPhase("work");
              return preset.work * 60;
            } else {
              setPhase("idle");
              return preset.work * 60;
            }
          }
        }
        return nr;
      });

      if (phaseRef.current === "work") {
        setSessionElapsed((e) => {
          const ne = e + dt;
          const newStage = stageForElapsed(ne);
          setStage((s) => {
            if (newStage !== s) {
              setQuote((q) => pickQuote(q.text));
            }
            return newStage;
          });
          return ne;
        });
      }
    }, 1000);
    return () => window.clearInterval(id);
  }, [phase, preset]);

  // Particles
  useEffect(() => {
    if (!canvasRef.current || !settings.effects.particles) return;
    const sys = createParticleSystem(canvasRef.current, () => ({
      stage,
      rainActive,
      reducedMotion: !!reducedMotion,
      visualizerEnabled: settings.effects.visualizer,
    }));
    return () => sys.stop();
  }, [settings.effects.particles, settings.effects.visualizer, stage, rainActive, reducedMotion]);

  // Fullscreen change listener
  useEffect(() => {
    const handler = () => setIsFullscreen(!!document.fullscreenElement);
    document.addEventListener("fullscreenchange", handler);
    return () => document.removeEventListener("fullscreenchange", handler);
  }, []);

  const toggleFullscreen = useCallback(() => {
    if (document.fullscreenElement) {
      document.exitFullscreen().catch(() => {});
    } else {
      document.documentElement.requestFullscreen().catch(() => {});
    }
  }, []);

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
    clearSession();
  }, [preset]);
  const togglePause = useCallback(() => {
    setPhase((p) => (p === "work" || p === "break" ? "paused" : p === "paused" ? "work" : p));
  }, []);

  // Keyboard shortcuts
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      // Don't trigger if user is typing in an input
      if (
        document.activeElement?.tagName === "INPUT" ||
        document.activeElement?.tagName === "TEXTAREA"
      ) {
        return;
      }
      if (e.code === "Space") {
        e.preventDefault();
        if (phase === "idle") startSession();
        else togglePause();
      } else if (e.key === "Escape") {
        endSession();
      } else if (e.key === "m") {
        setMusicOpen((o) => !o);
      } else if (e.key === "a") {
        setSettings((s) => ({ ...s, ambientMuted: !s.ambientMuted }));
      } else if (e.key === "f") {
        toggleFullscreen();
      } else if (e.key === "z") {
        setZenMode((z) => !z);
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [entered, phase, startSession, togglePause, endSession, toggleFullscreen]);

  const progress =
    phase === "break"
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
        <div className="font-mono text-sm uppercase tracking-[0.4em] text-amber/70 float-up">
          jazz bar
        </div>
        <div className="font-mono text-2xl text-cream md:text-4xl float-up-delay-1">
          click to enter the lounge
        </div>
        <div className="max-w-md text-center text-sm text-dim float-up-delay-2">
          A cozy focus room. Press Space to start a session. The scene builds the longer you stay.
        </div>
        <div className="mt-6 text-xs uppercase tracking-widest text-amber neon-glow enter-breathe float-up-delay-3">
          ~ * jazz bar * ~
        </div>
      </button>
    );
  }

  return (
    <div className={`theme-${settings.theme} relative h-screen w-screen overflow-hidden`}>
      {/* Top bar */}
      <header
        className={`pointer-events-none fixed inset-x-0 top-0 z-30 flex items-start justify-between px-6 pt-5 transition-opacity duration-300 ${
          controlsVisible && !zenMode ? "opacity-100" : "opacity-0"
        }`}
      >
        <div className="pointer-events-auto glass rounded-xl px-4 py-2 font-mono text-sm text-cream flex items-center gap-2">
          {phase === "idle"
            ? "ready"
            : phase === "paused"
              ? "paused"
              : phase === "break"
                ? "break"
                : "focus"}
          <span className="ml-3 text-amber">{fmt(remaining)}</span>
        </div>
        <div className="pointer-events-auto glass rounded-xl px-4 py-2 text-xs uppercase tracking-widest text-gold">
          groove · {groove}
        </div>
      </header>

      {/* Full-bleed pixel-art looping video scene */}
      <div className="absolute inset-0 z-0 overflow-hidden bg-[oklch(0.08_0.012_50)]">
        <video
          src="/bg-loop-smooth.mp4"
          poster="/bar-bg.jpeg"
          autoPlay
          loop
          muted
          playsInline
          className="bg-video"
        />
        {settings.effects.glow && <div className="warm-glow" />}
        {settings.effects.crt && <div className="crt-overlay" />}
      </div>

      {/* Center scene */}
      <main className="relative z-10 flex h-full w-full flex-col items-center justify-end pb-32">
        <canvas ref={canvasRef} className="pointer-events-none absolute inset-0 h-full w-full" />

        <div className="relative z-10 mt-6 max-w-2xl px-6 text-center">
          <p className="font-sans text-base italic text-cream/95 drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)] md:text-lg">
            {typed}
            <span className="ml-0.5 inline-block w-2 animate-pulse text-amber">▍</span>
          </p>
        </div>

        <div
          className="tick-pulse mt-4 font-mono text-6xl font-bold text-amber md:text-7xl"
          style={{ textShadow: "0 0 24px rgba(212,165,116,0.45), 0 2px 12px rgba(0,0,0,0.7)" }}
        >
          {fmt(remaining)}
        </div>

        <div className="mt-3 h-1 w-64 overflow-hidden rounded-full bg-black/40 backdrop-blur-sm">
          <div
            className="h-full bg-amber transition-all duration-300"
            style={{ width: `${Math.min(100, progress * 100)}%` }}
          />
        </div>

        <div className={`mt-5 min-h-[4rem] w-full max-w-sm rounded-lg bg-black/20 backdrop-blur-md p-3 border border-amber/10 shadow-lg pointer-events-auto transition-opacity duration-300 ${zenMode ? "opacity-0 pointer-events-none" : "opacity-100"}`}>
          {phase === "idle" && (
            <form
              onSubmit={(e) => {
                e.preventDefault();
                if (!newTaskText.trim()) return;
                setSettings((s) => ({
                  ...s,
                  tasks: [
                    ...s.tasks,
                    { id: Date.now().toString(), text: newTaskText.trim(), done: false },
                  ],
                }));
                setNewTaskText("");
              }}
              className="flex gap-2 mb-3"
            >
              <input
                type="text"
                placeholder="Add a task..."
                value={newTaskText}
                onChange={(e) => setNewTaskText(e.target.value)}
                className="flex-1 rounded border border-amber/20 bg-black/30 px-3 py-1 font-sans text-sm text-cream outline-none transition placeholder:text-dim hover:border-amber/40 focus:border-amber focus:bg-black/40"
                maxLength={60}
              />
              <button
                type="submit"
                disabled={!newTaskText.trim()}
                className="rounded bg-amber/20 px-3 py-1 font-mono text-xs text-amber transition hover:bg-amber hover:text-[oklch(0.12_0.012_50)] disabled:opacity-50"
              >
                add
              </button>
            </form>
          )}
          
          <ul className="flex max-h-32 flex-col gap-2 overflow-y-auto pr-1">
            {!settings.tasks || settings.tasks.length === 0 ? (
              <li className="text-center font-sans text-xs italic text-dim">No tasks added</li>
            ) : (
              settings.tasks.map((task) => (
                <li key={task.id} className="flex items-start gap-3 group">
                  <button
                    onClick={() => {
                      setSettings((s) => ({
                        ...s,
                        tasks: s.tasks.map((t) => (t.id === task.id ? { ...t, done: !t.done } : t)),
                      }));
                    }}
                    className={`mt-0.5 flex h-4 w-4 shrink-0 items-center justify-center rounded-sm border ${
                      task.done ? "border-amber bg-amber text-black" : "border-amber/40 bg-transparent hover:border-amber"
                    } transition-colors`}
                  >
                    {task.done && <span className="text-[10px] leading-none">✓</span>}
                  </button>
                  <span
                    className={`flex-1 text-left font-sans text-sm transition-all ${
                      task.done ? "text-dim line-through" : "text-cream/90"
                    }`}
                  >
                    {task.text}
                  </span>
                  {phase === "idle" && (
                    <button
                      onClick={() => {
                        setSettings((s) => ({
                          ...s,
                          tasks: s.tasks.filter((t) => t.id !== task.id),
                        }));
                      }}
                      className="opacity-0 group-hover:opacity-100 px-1 text-dim hover:text-fire transition-colors"
                      title="Delete task"
                    >
                      ✕
                    </button>
                  )}
                </li>
              ))
            )}
          </ul>
        </div>

        <div className="mt-2 text-xs uppercase tracking-[0.3em] text-cream/70 drop-shadow-[0_1px_4px_rgba(0,0,0,0.9)]">
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
          {[...PRESETS, { label: "Custom", work: settings.customPreset?.work ?? 25, rest: settings.customPreset?.rest ?? 5 }].map((p) => (
            <button
              key={p.label}
              onClick={() => {
                setPreset(p);
                if (phase === "idle") setRemaining(p.work * 60);
              }}
              className={`rounded-md px-3 py-1.5 font-mono transition ${
                preset.label === p.label
                  ? "bg-amber/20 text-amber"
                  : "text-cream/80 hover:bg-amber/10 hover:text-amber"
              }`}
            >
              {p.label}
            </button>
          ))}

          {preset.label === "Custom" && phase === "idle" && (
            <div className="flex items-center gap-2 border-l border-amber/20 pl-3">
              <input
                type="number"
                min={1}
                max={120}
                value={settings.customPreset?.work ?? 25}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 25;
                  setSettings(s => ({ ...s, customPreset: { ...(s.customPreset ?? {work: 25, rest: 5}), work: val } }));
                  setPreset({ label: "Custom", work: val, rest: settings.customPreset?.rest ?? 5 });
                  setRemaining(val * 60);
                }}
                className="w-12 rounded border border-amber/20 bg-black/30 text-center font-mono text-cream outline-none focus:border-amber py-1"
              />
              <span className="text-dim lowercase">work</span>
              <input
                type="number"
                min={1}
                max={60}
                value={settings.customPreset?.rest ?? 5}
                onChange={(e) => {
                  const val = parseInt(e.target.value) || 5;
                  setSettings(s => ({ ...s, customPreset: { ...(s.customPreset ?? {work: 25, rest: 5}), rest: val } }));
                  setPreset({ label: "Custom", work: settings.customPreset?.work ?? 25, rest: val });
                }}
                className="w-12 rounded border border-amber/20 bg-black/30 text-center font-mono text-cream outline-none focus:border-amber py-1"
              />
              <span className="text-dim lowercase">rest</span>
            </div>
          )}

          <span className="mx-2 h-4 w-px bg-dim" />
          {phase === "idle" ? (
            <button
              onClick={() => startSession()}
              className="rounded-md bg-amber px-4 py-1.5 font-mono text-[oklch(0.12_0.012_50)] transition hover:brightness-110 btn-glow"
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
            onClick={() => setSettings(s => ({ ...s, autoStart: !s.autoStart }))}
            className={`flex items-center gap-1.5 rounded-md px-3 py-1.5 font-mono transition ${
              settings.autoStart ? "bg-amber/20 text-amber" : "text-cream/60 hover:bg-amber/10 hover:text-cream"
            }`}
            title="Auto-Flow: automatically start next phase"
          >
            <span className="text-lg leading-none">∞</span> flow
          </button>

          <span className="mx-2 h-4 w-px bg-dim" />
          <button
            onClick={() => setStatsOpen(true)}
            className="rounded-md border border-amber/40 px-3 py-1.5 font-mono text-amber hover:bg-amber/10 transition-colors"
          >
            receipt
          </button>

          <span className="mx-2 h-4 w-px bg-dim" />
          <button
            onClick={() => setMusicOpen((o) => !o)}
            className={`rounded-md px-3 py-1.5 font-mono ${musicOpen ? "bg-amber/20 text-amber" : "text-gold hover:bg-amber/10"}`}
            title="Open music picker (M)"
          >
            ♪ music
          </button>
          <button
            onClick={() => setSettings((s) => ({ ...s, ambientMuted: !s.ambientMuted }))}
            className={`rounded-md px-3 py-1.5 font-mono ${settings.ambientMuted ? "text-dim" : "text-gold"}`}
            title="Toggle ambience (A)"
          >
            ambience {settings.ambientMuted ? "off" : "on"}
          </button>
          <button
            onClick={toggleFullscreen}
            className={`rounded-md px-3 py-1.5 font-mono ${isFullscreen ? "bg-amber/20 text-amber" : "text-gold hover:bg-amber/10"}`}
            title="Fullscreen (F)"
          >
            {isFullscreen ? "⊡ exit" : "⊞ full"}
          </button>
          {rainActive && <span className="font-mono text-rain">· rain tonight ·</span>}
        </div>
      </footer>

      <div className="pointer-events-none fixed bottom-2 right-3 z-30 font-mono text-[10px] uppercase tracking-widest text-dim">
        space · start/pause &nbsp; m · music &nbsp; a · ambience &nbsp; f · fullscreen &nbsp; esc ·
        end
      </div>

      <MusicPicker
        open={musicOpen}
        onClose={() => setMusicOpen(false)}
        settings={settings}
        setSettings={setSettings}
      />

      {/* Stats Receipt Modal */}
      {statsOpen && (
        <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/60 backdrop-blur-sm p-4 pointer-events-auto">
          <div className="relative max-h-[85vh] w-full max-w-sm overflow-hidden rounded-xl border border-amber/20 bg-[#120e0b] shadow-2xl flex flex-col">
            <button
              onClick={() => setStatsOpen(false)}
              className="absolute right-4 top-4 text-cream/50 hover:text-amber z-10"
            >
              ✕
            </button>
            <div className="border-b border-amber/10 p-6 pb-4 text-center shrink-0">
              <h2 className="font-mono text-xl text-amber tracking-[0.2em] uppercase">Session Receipt</h2>
              <p className="mt-1 text-xs text-dim">Thank you for visiting</p>
            </div>
            
            <div className="overflow-y-auto p-6 font-mono text-sm text-cream/90 flex-1">
              {history.length === 0 ? (
                <p className="text-center italic text-dim">No sessions on record yet.</p>
              ) : (
                <table className="w-full text-left">
                  <thead>
                    <tr className="border-b border-amber/10 text-xs text-dim">
                      <th className="pb-2 font-normal">Date</th>
                      <th className="pb-2 font-normal">Task</th>
                      <th className="pb-2 text-right font-normal">Time</th>
                    </tr>
                  </thead>
                  <tbody>
                    {history.map((log, i) => (
                      <tr key={i} className="border-b border-amber/5 last:border-0 group">
                        <td className="py-3 text-xs text-dim group-hover:text-cream/70 transition-colors whitespace-nowrap">
                          {new Date(log.timestamp).toLocaleDateString(undefined, { month: 'short', day: 'numeric' })}
                        </td>
                        <td className="py-3 pr-4 truncate max-w-[120px] group-hover:text-amber transition-colors" title={log.task}>{log.task}</td>
                        <td className="py-3 text-right text-amber group-hover:brightness-125 transition-colors">{log.durationMinutes}m</td>
                      </tr>
                    ))}
                  </tbody>
                </table>
              )}
            </div>
            
            <div className="bg-[#0a0806] p-4 font-mono text-xs border-t border-amber/10 flex justify-between items-center shrink-0">
              <div className="text-dim">
                <div className="uppercase tracking-wider">Total Sessions</div>
                <div className="text-cream text-sm mt-0.5">{history.length}</div>
              </div>
              <div className="text-right text-dim">
                <div className="uppercase tracking-wider">Deep Work</div>
                <div className="text-amber text-sm mt-0.5">{history.reduce((a, b) => a + b.durationMinutes, 0)}m</div>
              </div>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}

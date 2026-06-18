import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { TRACKS } from "@/lib/jazzbar/playlist";
import { AMBIENCE_LIST, getAmbience, type AmbienceKey } from "@/lib/jazzbar/ambience";
import { fadeVolume } from "@/lib/jazzbar/sfx";
import { loadHistory, type JazzbarSettings, type EffectToggles, type SessionLog } from "@/lib/jazzbar/storage";

type Playing = { kind: "none" } | { kind: "track"; trackIndex: number };

interface Props {
  open: boolean;
  onClose: () => void;
  settings: JazzbarSettings;
  setSettings: (updater: (s: JazzbarSettings) => JazzbarSettings) => void;
}

type TabKey = "music" | "ambience" | "effects" | "stats";

const EFFECT_ITEMS: { key: keyof EffectToggles; label: string; emoji: string; desc: string }[] = [
  { key: "crt", label: "CRT Filter", emoji: "📺", desc: "Retro scanlines & vignette" },
  { key: "glow", label: "Warm Glow", emoji: "💡", desc: "Ambient light bleed" },
  { key: "particles", label: "Particles", emoji: "✨", desc: "Smoke, fire, rain & notes" },
  { key: "visualizer", label: "Visualizer", emoji: "🎵", desc: "Music-reactive particles" },
];

export default function MusicPicker({ open, onClose, settings, setSettings }: Props) {
  const [tab, setTab] = useState<TabKey>("music");
  const [playing, setPlaying] = useState<Playing>({ kind: "none" });
  const [streamError, setStreamError] = useState<string | null>(null);
  const [isPlaying, setIsPlaying] = useState(false);
  const [loading, setLoading] = useState(false);
  const [history, setHistory] = useState<SessionLog[]>([]);
  const [, setVinylRate] = useState(1);
  const [newChannelUrl, setNewChannelUrl] = useState("");

  const allTracks = useMemo(() => {
    return [...TRACKS, ...(settings.customChannels || [])];
  }, [settings.customChannels]);

  const audioRef = useRef<HTMLAudioElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const restoredRef = useRef(false);
  const sourceNodeRef = useRef<MediaElementAudioSourceNode | null>(null);
  const fadeRafRef = useRef(0);

  const ambience = useMemo(() => getAmbience(), []);

  // Restore last selection ONCE when the picker is first opened
  useEffect(() => {
    if (!open) return;
    if (!restoredRef.current) {
      restoredRef.current = true;
      if (settings.lastTrackId) {
        const idx = allTracks.findIndex((t) => t.id === settings.lastTrackId);
        if (idx >= 0) setPlaying({ kind: "track", trackIndex: idx });
      }
    }
    // Load history whenever we open the picker to ensure it's fresh
    setHistory(loadHistory());
  }, [open, settings.lastTrackId, allTracks]);

  // Removed connectToAnalyser because routing external radio streams into Web Audio API without CORS headers causes the browser to output silence.

  // Persist selection
  useEffect(() => {
    if (playing.kind === "track" && playing.trackIndex < allTracks.length) {
      const id = allTracks[playing.trackIndex].id;
      setSettings((s) => ({ ...s, lastTrackId: id, lastWasPlaylist: false }));
    }
  }, [playing, setSettings, allTracks]);

  const goToTrack = useCallback((index: number) => {
    setStreamError(null);
    setPlaying({ kind: "track", trackIndex: index });
  }, []);

  const next = useCallback(() => {
    if (playing.kind !== "track") return;
    goToTrack((playing.trackIndex + 1) % allTracks.length);
  }, [playing, goToTrack, allTracks.length]);

  const prev = useCallback(() => {
    if (playing.kind !== "track") return;
    goToTrack((playing.trackIndex - 1 + allTracks.length) % allTracks.length);
  }, [playing, goToTrack, allTracks.length]);

  // Apply volume / mute
  useEffect(() => {
    const a = audioRef.current;
    if (!a) return;
    a.volume = settings.musicVolume / 100;
    a.muted = settings.musicMuted;
  }, [settings.musicVolume, settings.musicMuted]);

  // Drive vinyl rate with slow stop
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;

    let raf = 0;
    let lastPoll = 0;

    const tick = (ts: number) => {
      try {
        if (isPlaying) {
          if (ts - lastPoll > 250) {
            lastPoll = ts;
            const rate = 0.94 + 0.12 * (0.5 + 0.5 * Math.sin(ts / 2000));
            setVinylRate(rate);
            v.playbackRate = rate;
          }
          if (v.paused) v.play().catch(() => {});
        } else {
          // Slow down and stop (browsers clamp playbackRate to ~0.06, so we stop at 0.1)
          if (v.playbackRate > 0.1) {
            v.playbackRate -= 0.01;
          } else if (!v.paused) {
            v.pause();
          }
        }
      } catch {
        /* noop */
      }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  // Ambience: apply current levels & mute to engine
  useEffect(() => {
    if (!open) return;
    ambience.resume();
    ambience.setMuted(settings.ambientMuted);
    (Object.keys(settings.ambience) as AmbienceKey[]).forEach((k) => {
      ambience.setLevel(k, settings.ambience[k]);
    });
  }, [open, settings.ambience, settings.ambientMuted, ambience]);

  const stopMusic = () => {
    const a = audioRef.current;
    if (a) {
      // Cancel any existing fade
      cancelAnimationFrame(fadeRafRef.current);
      fadeRafRef.current = fadeVolume(a, 0, 400, () => {
        a.pause();
        a.currentTime = 0;
        a.volume = settings.musicVolume / 100;
      });
    }
    setPlaying({ kind: "none" });
    setIsPlaying(false);
  };

  const togglePlay = () => {
    const a = audioRef.current;
    if (!a) return;
    cancelAnimationFrame(fadeRafRef.current);
    if (isPlaying) {
      // Fade out then pause
      fadeRafRef.current = fadeVolume(a, 0, 500, () => {
        a.pause();
        a.volume = settings.musicVolume / 100;
      });
    } else {
      // Start quiet and fade in
      a.volume = 0;
      a.play().catch(() => {});
      fadeRafRef.current = fadeVolume(a, settings.musicVolume / 100, 500);
    }
  };

  // Listen for N key to switch tracks
  useEffect(() => {
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return;
      if (e.key === "n" && playing.kind === "track") {
        next();
      }
    };
    window.addEventListener("keydown", handler);
    return () => window.removeEventListener("keydown", handler);
  }, [playing, next]);

  const headerTitle =
    playing.kind === "track" && playing.trackIndex < allTracks.length ? allTracks[playing.trackIndex].title : "Pick a station";

  return (
    <aside
      className={`fixed right-0 top-0 z-40 flex h-full w-[400px] max-w-[94vw] flex-col border-l border-amber/20 bg-[oklch(0.09_0.014_50/0.94)] backdrop-blur-xl transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <header className="flex items-start justify-between border-b border-amber/15 px-5 py-4">
        <div className="min-w-0 flex-1 pr-3">
          <div className="font-mono text-xs uppercase tracking-[0.4em] text-amber/70">
            now streaming
          </div>
          <div className="mt-1 truncate font-sans text-lg text-cream" title={headerTitle}>
            {headerTitle}
          </div>
          {loading && (
            <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-dim">
              buffering…
            </div>
          )}
          {streamError && (
            <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-fire">
              {streamError}
            </div>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-md px-2 py-1 font-mono text-sm text-cream/70 transition-colors hover:text-amber"
          aria-label="Close music picker"
        >
          ✕
        </button>
      </header>

      <audio
        ref={audioRef}
        src={playing.kind === "track" && playing.trackIndex < allTracks.length ? allTracks[playing.trackIndex].url : ""}
        autoPlay
        onPlay={() => setIsPlaying(true)}
        onPause={() => setIsPlaying(false)}
        onWaiting={() => setLoading(true)}
        onPlaying={() => setLoading(false)}
        onError={(e) => {
          setLoading(false);
          const err = e.currentTarget.error;
          // Ignore abort errors which happen during src change
          if (err && err.code !== 20) {
            setStreamError("Stream failed to load.");
          }
        }}
      />

      {/* Tabs */}
      <div className="flex border-b border-amber/15 px-3">
        {(["music", "ambience", "effects", "stats"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`relative flex-1 py-2 font-mono text-[10px] uppercase tracking-[0.25em] transition-colors ${
              tab === k ? "text-amber" : "text-dim hover:text-cream"
            }`}
          >
            {k}
            {tab === k && <span className="absolute inset-x-2 -bottom-px h-px bg-amber" />}
          </button>
        ))}
      </div>

      {tab === "music" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Vinyl */}
          <div className="relative mx-auto mt-4 aspect-square w-[48%] overflow-hidden rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
            <video
              ref={videoRef}
              src="/vinyl.mp4"
              autoPlay
              loop
              muted
              playsInline
              className="h-full w-full object-cover"
              style={{
                imageRendering: "pixelated",
              }}
            />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber/30 border-t-amber" />
              </div>
            )}
          </div>

          {/* Transport controls */}
          <div className="mx-5 mt-6 space-y-2">
            <div className="flex items-center justify-center gap-3">
              <button
                onClick={prev}
                disabled={playing.kind !== "track"}
                className="rounded-md px-3 py-1 text-cream/80 transition-colors hover:text-amber disabled:opacity-30"
                aria-label="Previous"
              >
                ⏮
              </button>
              <button
                onClick={togglePlay}
                disabled={playing.kind === "none"}
                className="rounded-full bg-amber px-4 py-1.5 text-[oklch(0.12_0.012_50)] transition hover:brightness-110 disabled:opacity-30"
                aria-label={isPlaying ? "Pause" : "Play"}
              >
                {isPlaying ? "⏸" : "▶"}
              </button>
              <button
                onClick={next}
                disabled={playing.kind !== "track"}
                className="rounded-md px-3 py-1 text-cream/80 transition-colors hover:text-amber disabled:opacity-30"
                aria-label="Next (N)"
              >
                ⏭
              </button>
              <button
                onClick={stopMusic}
                disabled={playing.kind === "none"}
                className="rounded-md px-2 py-1 font-mono text-xs text-cream/70 transition-colors hover:text-fire disabled:opacity-30"
                title="Stop"
              >
                ⏹
              </button>
            </div>

            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setSettings((s) => ({ ...s, musicMuted: !s.musicMuted }))}
                className="w-6 text-center text-cream/80 transition-colors hover:text-amber"
                title={settings.musicMuted ? "Unmute" : "Mute"}
              >
                {settings.musicMuted || settings.musicVolume === 0
                  ? "🔇"
                  : settings.musicVolume < 40
                    ? "🔈"
                    : "🔊"}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={settings.musicVolume}
                onChange={(e) =>
                  setSettings((s) => ({ ...s, musicVolume: parseInt(e.target.value, 10) }))
                }
                className="flex-1 accent-amber"
                aria-label="Music volume"
              />
              <span className="w-8 text-right font-mono text-[10px] text-dim">
                {settings.musicVolume}
              </span>
            </div>
          </div>

          {/* Live Stations */}
          <div className="mt-5 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            <div className="px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-dim">
              live stations
            </div>
            <ul className="flex flex-col gap-1">
              {allTracks.map((t, i) => {
                const active = playing.kind === "track" && playing.trackIndex === i;
                const isCustom = i >= TRACKS.length;
                return (
                  <li key={t.id} className="relative group">
                    <button
                      onClick={() => goToTrack(i)}
                      className={`flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors ${
                        active
                          ? "bg-amber/15 text-amber"
                          : "text-cream/85 hover:bg-amber/10 hover:text-amber"
                      }`}
                    >
                      <div className="flex h-10 w-10 flex-shrink-0 items-center justify-center rounded bg-black/40 font-mono text-lg text-dim">
                        📻
                      </div>
                      <span className="min-w-0 flex-1 pr-6">
                        <span className="block truncate font-sans text-sm">{t.title}</span>
                        <span className="block truncate font-mono text-[10px] uppercase tracking-widest text-dim">
                          {t.artist}
                        </span>
                      </span>
                      {active && isPlaying && (
                        <span className="font-mono text-xs text-amber">♪</span>
                      )}
                    </button>
                    {isCustom && (
                      <button
                        onClick={(e) => {
                          e.stopPropagation();
                          if (playing.kind === "track" && playing.trackIndex === i) {
                            stopMusic();
                          } else if (playing.kind === "track" && playing.trackIndex > i) {
                            setPlaying({ kind: "track", trackIndex: playing.trackIndex - 1 });
                          }
                          setSettings(s => ({
                            ...s,
                            customChannels: (s.customChannels || []).filter(c => c.id !== t.id)
                          }));
                        }}
                        className="absolute right-2 top-1/2 -translate-y-1/2 opacity-0 group-hover:opacity-100 p-1 text-dim hover:text-fire transition-colors"
                        title="Remove custom station"
                      >
                        ✕
                      </button>
                    )}
                  </li>
                );
              })}
            </ul>

            <div className="mt-4 px-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim mb-2">
                add custom station
              </div>
              <form 
                onSubmit={(e) => {
                  e.preventDefault();
                  if (!newChannelUrl.trim()) return;
                  const newId = "custom-" + Date.now();
                  setSettings(s => ({
                    ...s,
                    customChannels: [
                      ...(s.customChannels || []),
                      {
                        id: newId,
                        title: "Custom Station " + ((s.customChannels?.length || 0) + 1),
                        artist: "User Added",
                        url: newChannelUrl.trim()
                      }
                    ]
                  }));
                  setNewChannelUrl("");
                }}
                className="flex gap-2"
              >
                <input
                  type="url"
                  placeholder="Paste audio URL (.mp3, stream, etc)"
                  value={newChannelUrl}
                  onChange={(e) => setNewChannelUrl(e.target.value)}
                  className="flex-1 rounded-md border border-amber/10 bg-black/20 px-3 py-1.5 font-sans text-xs text-cream outline-none transition placeholder:text-dim hover:border-amber/30 focus:border-amber focus:bg-black/40"
                />
                <button
                  type="submit"
                  disabled={!newChannelUrl.trim()}
                  className="rounded-md bg-amber/10 px-3 py-1.5 font-mono text-xs text-amber transition hover:bg-amber hover:text-[oklch(0.12_0.012_50)] disabled:opacity-50 disabled:hover:bg-amber/10 disabled:hover:text-amber"
                >
                  +
                </button>
              </form>
            </div>
          </div>
        </div>
      ) : tab === "ambience" ? (
        // Ambience tab
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-5 pt-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">
              ambience mixer
            </div>
            <button
              onClick={() => setSettings((s) => ({ ...s, ambientMuted: !s.ambientMuted }))}
              className={`rounded-md px-2 py-1 font-mono text-xs transition-colors ${settings.ambientMuted ? "text-dim" : "text-amber"}`}
            >
              {settings.ambientMuted ? "muted" : "live"}
            </button>
          </div>
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-5 pb-4">
            <ul className="flex flex-col gap-4 pt-2">
              {AMBIENCE_LIST.map(({ key, label, emoji }) => {
                const level = settings.ambience[key];
                return (
                  <li key={key} className="rounded-lg border border-amber/10 bg-black/20 px-3 py-2">
                    <div className="flex items-center justify-between">
                      <div className="flex items-center gap-2">
                        <span className="text-lg">{emoji}</span>
                        <span className="font-sans text-sm text-cream">{label}</span>
                      </div>
                      <span className="font-mono text-[10px] text-dim">{level}</span>
                    </div>
                    <div className="mt-1.5 flex items-center gap-2">
                      <button
                        onClick={() =>
                          setSettings((s) => ({
                            ...s,
                            ambience: { ...s.ambience, [key]: level > 0 ? 0 : 40 },
                          }))
                        }
                        className="w-6 text-center text-cream/80 transition-colors hover:text-amber"
                      >
                        {level === 0 ? "🔇" : "🔊"}
                      </button>
                      <input
                        type="range"
                        min={0}
                        max={100}
                        value={level}
                        onChange={(e) =>
                          setSettings((s) => ({
                            ...s,
                            ambience: { ...s.ambience, [key]: parseInt(e.target.value, 10) },
                          }))
                        }
                        className="flex-1 accent-amber"
                        aria-label={`${label} volume`}
                      />
                    </div>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : tab === "effects" ? (
        // Effects tab
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-5 pt-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">
              visual effects & theme
            </div>
          </div>
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-5 pb-4">
            
            {/* Theme Selector */}
            <div className="mt-2 mb-4 rounded-lg border border-amber/10 bg-black/20 p-3">
              <div className="mb-2 font-mono text-[10px] uppercase tracking-widest text-dim">color theme</div>
              <div className="grid grid-cols-2 gap-2">
                {(["classic", "midnight", "matcha", "neon"] as const).map((t) => (
                  <button
                    key={t}
                    onClick={() => setSettings(s => ({ ...s, theme: t }))}
                    className={`rounded text-xs font-mono py-1.5 transition-colors ${
                      settings.theme === t 
                        ? "bg-amber/20 text-amber border border-amber/30" 
                        : "bg-black/30 text-cream/60 border border-transparent hover:text-cream hover:bg-black/50"
                    }`}
                  >
                    {t}
                  </button>
                ))}
              </div>
            </div>

            <div className="flex items-center justify-between mt-2 mb-2">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">
                toggles
              </div>
              <button
                onClick={() => {
                  const allOn = Object.values(settings.effects).every(Boolean);
                  const val = !allOn;
                  setSettings((s) => ({
                    ...s,
                    effects: { crt: val, glow: val, particles: val, visualizer: val },
                  }));
                }}
                className={`rounded-md px-2 py-1 font-mono text-[10px] transition-colors ${
                  Object.values(settings.effects).every(Boolean) ? "text-amber" : "text-dim"
                }`}
              >
                {Object.values(settings.effects).every(Boolean) ? "all on" : "all off"}
              </button>
            </div>

            <ul className="flex flex-col gap-3">
              {EFFECT_ITEMS.map(({ key, label, emoji, desc }) => {
                const enabled = settings.effects[key];
                return (
                  <li key={key} className="rounded-lg border border-amber/10 bg-black/20 px-4 py-3">
                    <button
                      onClick={() =>
                        setSettings((s) => ({
                          ...s,
                          effects: { ...s.effects, [key]: !enabled },
                        }))
                      }
                      className="flex w-full items-center justify-between text-left"
                    >
                      <div className="flex items-center gap-3">
                        <span className="text-xl">{emoji}</span>
                        <div>
                          <div className="font-sans text-sm text-cream">{label}</div>
                          <div className="font-mono text-[10px] text-dim">{desc}</div>
                        </div>
                      </div>
                      {/* Toggle switch */}
                      <div
                        className={`relative h-6 w-11 rounded-full transition-colors ${
                          enabled ? "bg-amber/50" : "bg-dim/30"
                        }`}
                      >
                        <div
                          className={`absolute top-0.5 h-5 w-5 rounded-full shadow transition-all ${
                            enabled ? "left-[22px] bg-amber" : "left-0.5 bg-cream/60"
                          }`}
                        />
                      </div>
                    </button>
                  </li>
                );
              })}
            </ul>

            {/* Shortcuts hint */}
            <div className="mt-6 rounded-lg border border-amber/8 bg-black/15 px-4 py-3">
              <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">
                keyboard shortcuts
              </div>
              <div className="mt-2 space-y-1 font-mono text-[11px] text-cream/70">
                <div>
                  <span className="inline-block w-16 text-amber">Space</span> Start / Pause timer
                </div>
                <div>
                  <span className="inline-block w-16 text-amber">M</span> Toggle music panel
                </div>
                <div>
                  <span className="inline-block w-16 text-amber">N</span> Next station
                </div>
                <div>
                  <span className="inline-block w-16 text-amber">A</span> Toggle ambience
                </div>
                <div>
                  <span className="inline-block w-16 text-amber">F</span> Fullscreen
                </div>
                <div>
                  <span className="inline-block w-16 text-amber">Esc</span> End session
                </div>
              </div>
            </div>
          </div>
        </div>
      ) : (
        // Stats tab
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-5 pt-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">
              productivity analytics
            </div>
          </div>
          <div className="mt-2 min-h-0 flex-1 overflow-y-auto px-5 pb-4">
            <div className="grid grid-cols-2 gap-3 pt-2">
              <div className="rounded-lg border border-amber/10 bg-black/20 p-4 text-center">
                <div className="font-sans text-3xl font-bold text-amber">
                  {history.length}
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-dim">
                  Total Sessions
                </div>
              </div>
              <div className="rounded-lg border border-amber/10 bg-black/20 p-4 text-center">
                <div className="font-sans text-3xl font-bold text-amber">
                  {Math.round(history.reduce((acc, l) => acc + l.durationMinutes, 0) / 60 * 10) / 10}h
                </div>
                <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-dim">
                  Deep Work
                </div>
              </div>
            </div>

            <div className="mt-6 font-mono text-[10px] uppercase tracking-[0.3em] text-dim">
              recent sessions
            </div>
            {history.length === 0 ? (
              <div className="mt-4 text-center font-sans text-sm text-dim">
                No sessions completed yet.
              </div>
            ) : (
              <ul className="mt-3 flex flex-col gap-2">
                {history.slice(0, 20).map((log, i) => (
                  <li key={i} className="rounded-lg border border-amber/5 bg-black/10 px-3 py-2">
                    <div className="flex items-start justify-between">
                      <div className="flex-1 pr-2">
                        <div className="font-sans text-sm text-cream">{log.task}</div>
                        <div className="font-mono text-[10px] text-dim">
                          {new Date(log.timestamp).toLocaleDateString()} at {new Date(log.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </div>
                      </div>
                      <div className="font-mono text-xs text-amber">{log.durationMinutes}m</div>
                    </div>
                  </li>
                ))}
              </ul>
            )}
          </div>
        </div>
      )}
    </aside>
  );
}

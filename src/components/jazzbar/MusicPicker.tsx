import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import vinylAsset from "@/assets/jazzbar/vinyl-player.mp4.asset.json";
import { JAZZ_PLAYLIST_ID, JAZZ_PLAYLIST_LABEL, TRACKS, type Track } from "@/lib/jazzbar/playlist";
import { loadYouTubeAPI, thumbUrl } from "@/lib/jazzbar/youtube";
import { AMBIENCE_LIST, getAmbience, type AmbienceKey } from "@/lib/jazzbar/ambience";
import type { JazzbarSettings } from "@/lib/jazzbar/storage";

type Playing =
  | { kind: "none" }
  | { kind: "track"; trackIndex: number }
  | { kind: "playlist" };

interface Props {
  open: boolean;
  onClose: () => void;
  settings: JazzbarSettings;
  setSettings: (updater: (s: JazzbarSettings) => JazzbarSettings) => void;
}

function fmtTime(s: number) {
  if (!isFinite(s) || s < 0) s = 0;
  const m = Math.floor(s / 60);
  const r = Math.floor(s % 60);
  return `${m}:${String(r).padStart(2, "0")}`;
}

export default function MusicPicker({ open, onClose, settings, setSettings }: Props) {
  const [tab, setTab] = useState<"music" | "ambience">("music");
  const [playing, setPlaying] = useState<Playing>({ kind: "none" });
  const [apiReady, setApiReady] = useState(false);
  const [apiError, setApiError] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [nowTitle, setNowTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [duration, setDuration] = useState(0);
  const [position, setPosition] = useState(0);
  const [vinylRate, setVinylRate] = useState(1);
  const [shuffleOrder, setShuffleOrder] = useState<number[]>([]);
  const [shuffleCursor, setShuffleCursor] = useState(0);

  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);
  const restoredRef = useRef(false);

  const ambience = useMemo(() => getAmbience(), []);

  // Preload YT API + warm thumbs
  useEffect(() => {
    let cancelled = false;
    loadYouTubeAPI()
      .then(() => !cancelled && setApiReady(true))
      .catch(() => !cancelled && setApiError(true));
    TRACKS.forEach((t) => {
      const img = new Image();
      img.src = thumbUrl(t.id);
    });
    return () => { cancelled = true; };
  }, []);

  // Restore last selection ONCE when the picker is first opened
  useEffect(() => {
    if (!open || restoredRef.current) return;
    restoredRef.current = true;
    if (settings.lastWasPlaylist) {
      setPlaying({ kind: "playlist" });
    } else if (settings.lastTrackId) {
      const idx = TRACKS.findIndex((t) => t.id === settings.lastTrackId);
      if (idx >= 0) setPlaying({ kind: "track", trackIndex: idx });
    }
  }, [open, settings.lastTrackId, settings.lastWasPlaylist]);

  // Persist selection
  useEffect(() => {
    if (playing.kind === "track") {
      const id = TRACKS[playing.trackIndex].id;
      setSettings((s) => ({ ...s, lastTrackId: id, lastWasPlaylist: false }));
    } else if (playing.kind === "playlist") {
      setSettings((s) => ({ ...s, lastWasPlaylist: true }));
    }
  }, [playing, setSettings]);

  // Build/refresh shuffle order whenever shuffle is toggled on
  useEffect(() => {
    if (!settings.shuffle) return;
    const order = TRACKS.map((_, i) => i).sort(() => Math.random() - 0.5);
    setShuffleOrder(order);
    setShuffleCursor(0);
  }, [settings.shuffle]);

  const goToTrack = useCallback((index: number) => {
    setPlaying({ kind: "track", trackIndex: index });
  }, []);

  const next = useCallback(() => {
    if (playing.kind !== "track") return;
    if (settings.shuffle && shuffleOrder.length) {
      const nc = (shuffleCursor + 1) % shuffleOrder.length;
      setShuffleCursor(nc);
      goToTrack(shuffleOrder[nc]);
    } else {
      goToTrack((playing.trackIndex + 1) % TRACKS.length);
    }
  }, [playing, settings.shuffle, shuffleOrder, shuffleCursor, goToTrack]);

  const prev = useCallback(() => {
    if (playing.kind !== "track") return;
    if (settings.shuffle && shuffleOrder.length) {
      const nc = (shuffleCursor - 1 + shuffleOrder.length) % shuffleOrder.length;
      setShuffleCursor(nc);
      goToTrack(shuffleOrder[nc]);
    } else {
      goToTrack((playing.trackIndex - 1 + TRACKS.length) % TRACKS.length);
    }
  }, [playing, settings.shuffle, shuffleOrder, shuffleCursor, goToTrack]);

  // Create / update player when API ready & a selection is made
  useEffect(() => {
    if (!apiReady || playing.kind === "none" || !containerRef.current) return;
    setLoading(true);

    const opts: any = {
      height: "100%",
      width: "100%",
      playerVars: {
        autoplay: 1,
        modestbranding: 1,
        rel: 0,
        playsinline: 1,
        mute: settings.musicMuted ? 1 : 0,
      },
      events: {
        onReady: (e: any) => {
          setLoading(false);
          try {
            e.target.setVolume(settings.musicVolume);
            if (settings.musicMuted) e.target.mute(); else e.target.unMute();
            e.target.playVideo();
            setDuration(e.target.getDuration?.() ?? 0);
            const d = e.target.getVideoData?.();
            if (d?.title) setNowTitle(d.title);
          } catch { /* noop */ }
        },
        onStateChange: (e: any) => {
          // -1 unstarted, 0 ended, 1 playing, 2 paused, 3 buffering, 5 cued
          setIsPlaying(e.data === 1);
          if (e.data === 3) setLoading(true);
          if (e.data === 1) {
            setLoading(false);
            try {
              setDuration(e.target.getDuration?.() ?? 0);
              const d = e.target.getVideoData?.();
              if (d?.title) setNowTitle(d.title);
            } catch { /* noop */ }
          }
          if (e.data === 0) {
            // auto-next when a single track ends
            if (playing.kind === "track") next();
          }
        },
        onError: () => { setLoading(false); setApiError(true); },
      },
    };

    if (playing.kind === "playlist") {
      opts.playerVars.listType = "playlist";
      opts.playerVars.list = JAZZ_PLAYLIST_ID;
    } else {
      opts.videoId = TRACKS[playing.trackIndex].id;
    }

    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch { /* noop */ }
      playerRef.current = null;
    }

    const mount = document.createElement("div");
    mount.className = "h-full w-full";
    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(mount);

    playerRef.current = new window.YT.Player(mount, opts);

    return () => {
      try { playerRef.current?.destroy(); } catch { /* noop */ }
      playerRef.current = null;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [apiReady, playing]);

  // Apply volume / mute changes live without rebuilding the player
  useEffect(() => {
    const p = playerRef.current;
    if (!p) return;
    try {
      p.setVolume(settings.musicVolume);
      if (settings.musicMuted) p.mute(); else p.unMute();
    } catch { /* noop */ }
  }, [settings.musicVolume, settings.musicMuted]);

  // Drive vinyl & poll seek position
  useEffect(() => {
    if (!isPlaying) return;
    const v = videoRef.current;
    let raf = 0;
    let lastPoll = 0;
    const tick = (ts: number) => {
      try {
        if (ts - lastPoll > 250) {
          lastPoll = ts;
          const t = playerRef.current?.getCurrentTime?.() ?? 0;
          const d = playerRef.current?.getDuration?.() ?? 0;
          setPosition(t);
          if (d && d !== duration) setDuration(d);
          const rate = 0.94 + 0.12 * (0.5 + 0.5 * Math.sin(t * 0.5));
          setVinylRate(rate);
          if (v) v.playbackRate = rate;
        }
      } catch { /* noop */ }
      raf = requestAnimationFrame(tick);
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying, duration]);

  // Pause/resume decorative vinyl video with playback
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) v.play().catch(() => {});
    else v.pause();
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
    try { playerRef.current?.stopVideo(); } catch { /* noop */ }
    setPlaying({ kind: "none" });
    setIsPlaying(false);
    setNowTitle(null);
    setPosition(0);
    setDuration(0);
  };

  const togglePlay = () => {
    const p = playerRef.current;
    if (!p) return;
    try {
      const state = p.getPlayerState?.();
      if (state === 1) p.pauseVideo(); else p.playVideo();
    } catch { /* noop */ }
  };

  const seekTo = (pct: number) => {
    const p = playerRef.current;
    if (!p || !duration) return;
    try {
      const target = (pct / 100) * duration;
      p.seekTo(target, true);
      setPosition(target);
    } catch { /* noop */ }
  };

  const retry = () => {
    setApiError(false);
    setApiReady(false);
    loadYouTubeAPI().then(() => setApiReady(true)).catch(() => setApiError(true));
  };

  const headerTitle =
    nowTitle ??
    (playing.kind === "track"
      ? TRACKS[playing.trackIndex].title
      : playing.kind === "playlist"
        ? JAZZ_PLAYLIST_LABEL
        : "Pick a record");

  const progressPct = duration > 0 ? Math.min(100, (position / duration) * 100) : 0;

  return (
    <aside
      className={`fixed right-0 top-0 z-40 flex h-full w-[400px] max-w-[94vw] flex-col border-l border-amber/20 bg-[oklch(0.09_0.014_50/0.94)] backdrop-blur-xl transition-transform duration-500 ease-[cubic-bezier(0.22,1,0.36,1)] ${
        open ? "translate-x-0" : "translate-x-full"
      }`}
    >
      <header className="flex items-start justify-between border-b border-amber/15 px-5 py-4">
        <div className="min-w-0 flex-1 pr-3">
          <div className="font-mono text-xs uppercase tracking-[0.4em] text-amber/70">now spinning</div>
          <div className="mt-1 truncate font-sans text-lg text-cream" title={headerTitle}>
            {headerTitle}
          </div>
          {loading && (
            <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-dim">
              buffering…
            </div>
          )}
          {apiError && (
            <button
              onClick={retry}
              className="mt-1 font-mono text-[10px] uppercase tracking-widest text-fire underline"
            >
              connection issue — retry
            </button>
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

      {/* Tabs */}
      <div className="flex border-b border-amber/15 px-3">
        {(["music", "ambience"] as const).map((k) => (
          <button
            key={k}
            onClick={() => setTab(k)}
            className={`relative flex-1 py-2 font-mono text-[11px] uppercase tracking-[0.35em] transition-colors ${
              tab === k ? "text-amber" : "text-dim hover:text-cream"
            }`}
          >
            {k}
            {tab === k && (
              <span className="absolute inset-x-3 -bottom-px h-px bg-amber" />
            )}
          </button>
        ))}
      </div>

      {tab === "music" ? (
        <div className="flex min-h-0 flex-1 flex-col">
          {/* Vinyl */}
          <div className="relative mx-auto mt-4 aspect-square w-[48%] overflow-hidden rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
            <video
              ref={videoRef}
              src={vinylAsset.url}
              autoPlay
              loop
              muted
              playsInline
              className={`h-full w-full object-cover ${isPlaying ? "vinyl-spin" : ""}`}
              style={{
                imageRendering: "pixelated",
                animationDuration: isPlaying ? `${(6 / vinylRate).toFixed(2)}s` : undefined,
              }}
            />
            {loading && (
              <div className="absolute inset-0 flex items-center justify-center bg-black/40 backdrop-blur-sm">
                <div className="h-8 w-8 animate-spin rounded-full border-2 border-amber/30 border-t-amber" />
              </div>
            )}
          </div>

          {/* Embedded player (kept mounted but tiny — controls live below) */}
          <div className="mx-5 mt-4 h-0 overflow-hidden">
            <div ref={containerRef} className="h-full w-full" />
          </div>

          {/* Transport controls */}
          <div className="mx-5 mt-3 space-y-2">
            <div className="flex items-center gap-2">
              <span className="w-10 font-mono text-[10px] text-dim">{fmtTime(position)}</span>
              <input
                type="range"
                min={0}
                max={100}
                step={0.1}
                value={progressPct}
                onChange={(e) => seekTo(parseFloat(e.target.value))}
                disabled={!duration || playing.kind === "none"}
                className="flex-1 accent-amber"
                aria-label="Seek"
              />
              <span className="w-10 text-right font-mono text-[10px] text-dim">{fmtTime(duration)}</span>
            </div>

            <div className="flex items-center justify-center gap-3">
              <button
                onClick={() => setSettings((s) => ({ ...s, shuffle: !s.shuffle }))}
                className={`rounded-md px-2 py-1 font-mono text-xs transition-colors ${settings.shuffle ? "bg-amber/20 text-amber" : "text-cream/70 hover:text-amber"}`}
                title="Shuffle"
              >
                🔀
              </button>
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
                aria-label="Next"
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

            <div className="flex items-center gap-2">
              <button
                onClick={() => setSettings((s) => ({ ...s, musicMuted: !s.musicMuted }))}
                className="w-6 text-center text-cream/80 transition-colors hover:text-amber"
                title={settings.musicMuted ? "Unmute" : "Mute"}
              >
                {settings.musicMuted || settings.musicVolume === 0 ? "🔇" : settings.musicVolume < 40 ? "🔈" : "🔊"}
              </button>
              <input
                type="range"
                min={0}
                max={100}
                value={settings.musicVolume}
                onChange={(e) => setSettings((s) => ({ ...s, musicVolume: parseInt(e.target.value, 10) }))}
                className="flex-1 accent-amber"
                aria-label="Music volume"
              />
              <span className="w-8 text-right font-mono text-[10px] text-dim">{settings.musicVolume}</span>
            </div>
          </div>

          {/* Playlist button */}
          <button
            onClick={() => setPlaying({ kind: "playlist" })}
            className={`mx-5 mt-3 rounded-lg border px-4 py-2.5 text-left transition-colors ${
              playing.kind === "playlist"
                ? "border-amber bg-amber/15 text-amber"
                : "border-amber/30 text-cream hover:bg-amber/10"
            }`}
          >
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-gold/80">playlist</div>
            <div className="mt-0.5 font-sans text-sm">▶ {JAZZ_PLAYLIST_LABEL}</div>
          </button>

          {/* Tracks */}
          <div className="mt-3 min-h-0 flex-1 overflow-y-auto px-3 pb-4">
            <div className="px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-dim">tracks</div>
            <ul className="flex flex-col gap-1">
              {TRACKS.map((t, i) => {
                const active = playing.kind === "track" && playing.trackIndex === i;
                return (
                  <li key={t.id}>
                    <button
                      onClick={() => goToTrack(i)}
                      className={`flex w-full items-center gap-3 rounded-md p-2 text-left transition-colors ${
                        active ? "bg-amber/15 text-amber" : "text-cream/85 hover:bg-amber/10 hover:text-amber"
                      }`}
                    >
                      <img
                        src={thumbUrl(t.id)}
                        alt=""
                        loading="lazy"
                        width={80}
                        height={45}
                        className="h-12 w-20 flex-shrink-0 rounded object-cover"
                      />
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-sans text-sm">{t.title}</span>
                        <span className="block truncate font-mono text-[10px] uppercase tracking-widest text-dim">
                          {t.artist}
                        </span>
                      </span>
                      {active && isPlaying && <span className="font-mono text-xs text-amber">♪</span>}
                    </button>
                  </li>
                );
              })}
            </ul>
          </div>
        </div>
      ) : (
        // Ambience tab
        <div className="flex min-h-0 flex-1 flex-col">
          <div className="flex items-center justify-between px-5 pt-4">
            <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-dim">ambience mixer</div>
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
            <button
              onClick={() =>
                setSettings((s) => ({
                  ...s,
                  ambience: { rain: 0, fire: 0, mumbling: 0, wind: 0, vinyl: 0, cafe: 0 },
                }))
              }
              className="mt-4 w-full rounded-md border border-amber/20 px-3 py-2 font-mono text-[11px] uppercase tracking-widest text-cream/70 transition-colors hover:bg-amber/10 hover:text-amber"
            >
              reset mix
            </button>
          </div>
        </div>
      )}
    </aside>
  );
}

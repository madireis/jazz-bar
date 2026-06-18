import { useEffect, useRef, useState } from "react";
import vinylAsset from "@/assets/jazzbar/vinyl-player.mp4.asset.json";
import { JAZZ_PLAYLIST_ID, JAZZ_PLAYLIST_LABEL, TRACKS, type Track } from "@/lib/jazzbar/playlist";
import { loadYouTubeAPI, thumbUrl } from "@/lib/jazzbar/youtube";

type Playing =
  | { kind: "none" }
  | { kind: "track"; track: Track }
  | { kind: "playlist" };

interface Props {
  open: boolean;
  onClose: () => void;
  muted: boolean;
}

export default function MusicPicker({ open, onClose, muted }: Props) {
  const [playing, setPlaying] = useState<Playing>({ kind: "none" });
  const [apiReady, setApiReady] = useState(false);
  const [isPlaying, setIsPlaying] = useState(false);
  const [nowTitle, setNowTitle] = useState<string | null>(null);
  const [loading, setLoading] = useState(false);
  const [vinylRate, setVinylRate] = useState(1);

  const playerRef = useRef<any>(null);
  const containerRef = useRef<HTMLDivElement>(null);
  const videoRef = useRef<HTMLVideoElement>(null);

  // Preload YT API + warm image cache as soon as picker mounts
  useEffect(() => {
    loadYouTubeAPI().then(() => setApiReady(true));
    TRACKS.forEach((t) => {
      const img = new Image();
      img.src = thumbUrl(t.id);
    });
  }, []);

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
        mute: muted ? 1 : 0,
      },
      events: {
        onReady: (e: any) => {
          setLoading(false);
          e.target.playVideo();
          const d = e.target.getVideoData?.();
          if (d?.title) setNowTitle(d.title);
        },
        onStateChange: (e: any) => {
          // 1 = playing, 2 = paused, 0 = ended, 3 = buffering
          setIsPlaying(e.data === 1);
          if (e.data === 3) setLoading(true);
          if (e.data === 1) setLoading(false);
          const d = e.target.getVideoData?.();
          if (d?.title) setNowTitle(d.title);
        },
      },
    };

    if (playing.kind === "playlist") {
      opts.playerVars.listType = "playlist";
      opts.playerVars.list = JAZZ_PLAYLIST_ID;
    } else {
      opts.videoId = playing.track.id;
    }

    // Destroy previous
    if (playerRef.current) {
      try { playerRef.current.destroy(); } catch { /* noop */ }
      playerRef.current = null;
    }

    // Fresh mount node
    const mount = document.createElement("div");
    mount.className = "h-full w-full";
    containerRef.current.innerHTML = "";
    containerRef.current.appendChild(mount);

    playerRef.current = new window.YT.Player(mount, opts);

    return () => {
      try { playerRef.current?.destroy(); } catch { /* noop */ }
      playerRef.current = null;
    };
  }, [apiReady, playing, muted]);

  // Drive vinyl spin rate from playback time so it feels alive
  useEffect(() => {
    if (!isPlaying) return;
    const v = videoRef.current;
    let raf = 0;
    let last = performance.now();
    const tick = () => {
      const now = performance.now();
      const dt = (now - last) / 1000;
      last = now;
      // Subtle wobble around 1x based on elapsed playback
      try {
        const t = playerRef.current?.getCurrentTime?.() ?? 0;
        const rate = 0.92 + 0.16 * (0.5 + 0.5 * Math.sin(t * 0.6));
        setVinylRate(rate);
        if (v) v.playbackRate = rate;
      } catch { /* noop */ }
      raf = requestAnimationFrame(tick);
      void dt;
    };
    raf = requestAnimationFrame(tick);
    return () => cancelAnimationFrame(raf);
  }, [isPlaying]);

  // Pause the decorative vinyl video when nothing is playing
  useEffect(() => {
    const v = videoRef.current;
    if (!v) return;
    if (isPlaying) v.play().catch(() => {});
    else v.pause();
  }, [isPlaying]);

  const stop = () => {
    try { playerRef.current?.stopVideo(); } catch { /* noop */ }
    setPlaying({ kind: "none" });
    setIsPlaying(false);
    setNowTitle(null);
  };

  const headerTitle =
    nowTitle ??
    (playing.kind === "track"
      ? playing.track.title
      : playing.kind === "playlist"
        ? JAZZ_PLAYLIST_LABEL
        : "Pick a record");

  return (
    <aside
      className={`fixed right-0 top-0 z-40 flex h-full w-[380px] max-w-[92vw] flex-col border-l border-amber/20 bg-[oklch(0.09_0.014_50/0.94)] backdrop-blur-xl transition-transform duration-500 ease-out ${
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
            <div className="mt-1 font-mono text-[10px] uppercase tracking-widest text-dim">loading…</div>
          )}
        </div>
        <button
          onClick={onClose}
          className="rounded-md px-2 py-1 font-mono text-sm text-cream/70 hover:text-amber"
          aria-label="Close music picker"
        >
          ✕
        </button>
      </header>

      {/* Vinyl */}
      <div className="relative mx-auto mt-4 aspect-square w-[55%] overflow-hidden rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
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
      </div>

      {/* Embedded YouTube player */}
      <div className="mx-5 mt-4 aspect-video overflow-hidden rounded-lg border border-amber/20 bg-black">
        {playing.kind === "none" ? (
          <div className="flex h-full items-center justify-center font-mono text-xs uppercase tracking-widest text-dim">
            select a record below
          </div>
        ) : (
          <div ref={containerRef} className="h-full w-full" />
        )}
      </div>

      {/* Playlist button */}
      <button
        onClick={() => setPlaying({ kind: "playlist" })}
        className={`mx-5 mt-4 rounded-lg border px-4 py-3 text-left transition ${
          playing.kind === "playlist"
            ? "border-amber bg-amber/15 text-amber"
            : "border-amber/30 text-cream hover:bg-amber/10"
        }`}
      >
        <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-gold/80">playlist</div>
        <div className="mt-1 font-sans text-base">▶ {JAZZ_PLAYLIST_LABEL}</div>
      </button>

      {/* Tracks with thumbnails */}
      <div className="mt-4 flex-1 overflow-y-auto px-3 pb-4">
        <div className="px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-dim">tracks</div>
        <ul className="flex flex-col gap-1">
          {TRACKS.map((t) => {
            const active = playing.kind === "track" && playing.track.id === t.id;
            return (
              <li key={t.id}>
                <button
                  onClick={() => setPlaying({ kind: "track", track: t })}
                  className={`flex w-full items-center gap-3 rounded-md p-2 text-left transition ${
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

      {playing.kind !== "none" && (
        <div className="border-t border-amber/15 px-5 py-3">
          <button
            onClick={stop}
            className="w-full rounded-md border border-amber/30 px-3 py-2 font-mono text-xs uppercase tracking-widest text-cream/80 hover:bg-amber/10 hover:text-amber"
          >
            stop record
          </button>
        </div>
      )}
    </aside>
  );
}

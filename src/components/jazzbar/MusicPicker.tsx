import { useState } from "react";
import vinylAsset from "@/assets/jazzbar/vinyl-player.mp4.asset.json";
import { JAZZ_PLAYLIST_ID, JAZZ_PLAYLIST_LABEL, TRACKS, type Track } from "@/lib/jazzbar/playlist";

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

  const src =
    playing.kind === "track"
      ? `https://www.youtube-nocookie.com/embed/${playing.track.id}?autoplay=1&modestbranding=1&rel=0&playsinline=1${muted ? "&mute=1" : ""}`
      : playing.kind === "playlist"
        ? `https://www.youtube-nocookie.com/embed/videoseries?list=${JAZZ_PLAYLIST_ID}&autoplay=1&modestbranding=1&rel=0&playsinline=1${muted ? "&mute=1" : ""}`
        : null;

  return (
    <>
      {/* Hidden audio iframe persists across open/close */}
      {src && (
        <iframe
          key={src}
          src={src}
          title="Jazz player"
          allow="autoplay; encrypted-media"
          className="pointer-events-none fixed bottom-0 right-0 h-px w-px opacity-0"
        />
      )}

      {/* Slide-in panel */}
      <aside
        className={`fixed right-0 top-0 z-40 flex h-full w-[360px] max-w-[90vw] flex-col border-l border-amber/20 bg-[oklch(0.09_0.014_50/0.92)] backdrop-blur-xl transition-transform duration-500 ease-out ${
          open ? "translate-x-0" : "translate-x-full"
        }`}
      >
        <header className="flex items-center justify-between border-b border-amber/15 px-5 py-4">
          <div>
            <div className="font-mono text-xs uppercase tracking-[0.4em] text-amber/70">now spinning</div>
            <div className="mt-1 font-sans text-lg text-cream">
              {playing.kind === "track"
                ? playing.track.title
                : playing.kind === "playlist"
                  ? JAZZ_PLAYLIST_LABEL
                  : "Pick a record"}
            </div>
          </div>
          <button
            onClick={onClose}
            className="rounded-md px-2 py-1 font-mono text-sm text-cream/70 hover:text-amber"
            aria-label="Close music picker"
          >
            ✕
          </button>
        </header>

        {/* Vinyl video */}
        <div className="relative mx-auto mt-4 aspect-square w-[80%] overflow-hidden rounded-full shadow-[0_10px_40px_rgba(0,0,0,0.6)]">
          <video
            src={vinylAsset.url}
            autoPlay
            loop
            muted
            playsInline
            className={`h-full w-full object-cover ${playing.kind === "none" ? "" : "vinyl-spin"}`}
            style={{ imageRendering: "pixelated" }}
          />
        </div>

        {/* Playlist button */}
        <button
          onClick={() => setPlaying({ kind: "playlist" })}
          className={`mx-5 mt-5 rounded-lg border px-4 py-3 text-left transition ${
            playing.kind === "playlist"
              ? "border-amber bg-amber/15 text-amber"
              : "border-amber/30 text-cream hover:bg-amber/10"
          }`}
        >
          <div className="font-mono text-[10px] uppercase tracking-[0.3em] text-gold/80">playlist</div>
          <div className="mt-1 font-sans text-base">▶ {JAZZ_PLAYLIST_LABEL}</div>
        </button>

        {/* Tracks */}
        <div className="mt-4 flex-1 overflow-y-auto px-3 pb-6">
          <div className="px-2 pb-2 font-mono text-[10px] uppercase tracking-[0.3em] text-dim">tracks</div>
          <ul className="flex flex-col gap-1">
            {TRACKS.map((t) => {
              const active = playing.kind === "track" && playing.track.id === t.id;
              return (
                <li key={t.id}>
                  <button
                    onClick={() => setPlaying({ kind: "track", track: t })}
                    className={`flex w-full items-center gap-3 rounded-md px-3 py-2 text-left transition ${
                      active ? "bg-amber/15 text-amber" : "text-cream/85 hover:bg-amber/10 hover:text-amber"
                    }`}
                  >
                    <span className="font-mono text-xs text-amber/70">{active ? "♪" : "·"}</span>
                    <span className="flex-1">
                      <span className="block font-sans text-sm">{t.title}</span>
                      <span className="block font-mono text-[10px] uppercase tracking-widest text-dim">
                        {t.artist}
                      </span>
                    </span>
                  </button>
                </li>
              );
            })}
          </ul>
        </div>

        {playing.kind !== "none" && (
          <div className="border-t border-amber/15 px-5 py-3">
            <button
              onClick={() => setPlaying({ kind: "none" })}
              className="w-full rounded-md border border-amber/30 px-3 py-2 font-mono text-xs uppercase tracking-widest text-cream/80 hover:bg-amber/10 hover:text-amber"
            >
              stop record
            </button>
          </div>
        )}
      </aside>
    </>
  );
}

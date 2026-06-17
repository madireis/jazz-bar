## Jazz Bar Web — Build Plan

A browser-based focus app themed as a cozy jazz lounge. ASCII art bar scene that progressively builds as you focus, layered ambient audio, particle effects, and a Pomodoro timer.

Note: The PRD specifies vanilla HTML/CSS/JS with no framework. This project is on TanStack Start + React + Tailwind v4. I'll implement it as a single full-bleed React route that achieves the same look, feel, and behavior — bundle size and "no framework" goals will not be met, but every user-visible requirement will be.

### Phase 1 — Foundation (this turn)
- Design system in `src/styles.css`: dark warm palette (`--bg-deep #0d0a07`, `--amber`, `--gold`, `--cream`, `--smoke`, `--fire-orange`, `--rain-blue`), JetBrains Mono + Outfit via `<link>` in `__root.tsx`.
- Route `src/routes/index.tsx` as the full experience (page metadata + canvas mount).
- Modules under `src/lib/jazzbar/`:
  - `scene.ts` — 9 stages of ASCII art (bar counter → full lounge with neon, fireplace, vinyl, barman, guitar).
  - `timer.ts` — Pomodoro state machine (presets 25+5, 45+15, 50+10, 90+20, custom, pause/resume, break).
  - `quotes.ts` — ~60 curated quotes, typewriter rotation on stage advance.
  - `storage.ts` — localStorage for groove count + settings.
- Components: `JazzBar` (orchestrator), `SceneStage`, `TimerDisplay`, `QuoteLine`, `ControlBar`, `EnterLoungeSplash`.

### Phase 2 — Audio
- `audio.ts` engine: HTML5 `<audio>` for 3 ambient loops (fireplace, rain, bar murmur) + main music layer, WebAudio for SFX (start chime, alarm, growth chime).
- "Click to enter the lounge" splash unlocks audio context.
- Per-layer volume sliders, master ambient toggle, mute-music toggle.
- YouTube: hidden iframe player with search/paste URL for main music layer (IFrame API).
- Pause sync: spacebar pauses timer + all audio.

### Phase 3 — Particles
- `particles.ts` canvas overlay with `requestAnimationFrame`:
  - Smoke (stage 4+), fireplace flicker (stage 6+), musical notes (stage 5+), rare rain (5% roll).
- Respect `prefers-reduced-motion`; toggle in settings.

### Phase 4 — Polish
- Controls auto-fade after 5s idle, return on mousemove/keypress.
- Keyboard shortcuts: Space, m, a, ]/[, }/{, =/-, r, 0–9, Esc.
- Stage crossfade (800ms), neon sign glow keyframes, timer pulse, break/pause overlays.
- Groove counter persists; increments on completed work phase.

### Technical notes
- All audio sound files (`.ogg`/`.wav`) need to be supplied — I'll wire the engine with placeholder URLs and a clear `src/lib/jazzbar/assets.ts` map; you can drop files into `public/audio/` or I can source royalty-free ones.
- YouTube uses iframe embed (default jazz radio stream from PRD).
- No backend / Lovable Cloud — pure client-side per PRD.

### Open PRD questions — my defaults (override anytime)
1. YouTube → iframe embed (simpler, matches PRD default).
2. Audio assets → placeholder paths in `public/audio/`; you upload or I'll fetch royalty-free.
3. Mobile → desktop-first; basic responsive fallback, not a priority.
4. Deployment → Lovable hosting (publish from preview).
5. Name → "Jazz Bar" branding.

I'll start with Phase 1 (design system, scene, timer, quotes, layout) so you see a working scene immediately, then layer audio and particles.
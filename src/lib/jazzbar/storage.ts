const GROOVE_KEY = "jazzbar_groove";
const SETTINGS_KEY = "jazzbar_settings";
const SESSION_KEY = "jazzbar_session";
const HISTORY_KEY = "jazzbar_history";

export interface AmbienceLevels {
  rain: number;
  fire: number;
  mumbling: number;
  wind: number;
  vinyl: number;
  cafe: number;
}

export interface EffectToggles {
  crt: boolean;
  glow: boolean;
  particles: boolean;
  visualizer: boolean;
}

export interface CustomChannel {
  id: string;
  title: string;
  artist: string;
  url: string;
}

export interface TaskItem {
  id: string;
  text: string;
  done: boolean;
}

export interface JazzbarSettings {
  mainVolume: number;
  musicVolume: number; // 0..100
  musicMuted: boolean;
  ambientMuted: boolean;
  ambience: AmbienceLevels;
  effects: EffectToggles;
  theme: "classic" | "midnight" | "matcha" | "neon";
  shuffle: boolean;
  lastTrackId: string | null;
  lastWasPlaylist: boolean;
  customChannels: CustomChannel[];
  tasks: TaskItem[];
  autoStart: boolean;
  customPreset: { work: number; rest: number };
}

export interface SessionState {
  phase: "work" | "break" | "paused";
  remaining: number; // seconds
  sessionElapsed: number; // ms
  presetLabel: string;
  stage: number;
  savedAt: number; // Date.now() timestamp
}

export interface SessionLog {
  timestamp: number;
  durationMinutes: number;
  task: string;
}

export const DEFAULT_EFFECTS: EffectToggles = {
  crt: true,
  glow: true,
  particles: true,
  visualizer: true,
};

export const DEFAULT_SETTINGS: JazzbarSettings = {
  mainVolume: 60,
  musicVolume: 70,
  musicMuted: false,
  ambientMuted: false,
  ambience: { rain: 0, fire: 0, mumbling: 0, wind: 0, vinyl: 0, cafe: 0 },
  effects: { ...DEFAULT_EFFECTS },
  theme: "classic",
  shuffle: false,
  lastTrackId: null,
  lastWasPlaylist: false,
  customChannels: [],
  tasks: [],
  autoStart: false,
  customPreset: { work: 25, rest: 5 },
};

const isBrowser = () => typeof window !== "undefined";

export function loadGroove(): number {
  if (!isBrowser()) return 0;
  const v = window.localStorage.getItem(GROOVE_KEY);
  return v ? parseInt(v, 10) || 0 : 0;
}
export function saveGroove(n: number) {
  if (!isBrowser()) return;
  window.localStorage.setItem(GROOVE_KEY, String(n));
}

export function loadSettings(): JazzbarSettings {
  if (!isBrowser()) return DEFAULT_SETTINGS;
  try {
    const v = window.localStorage.getItem(SETTINGS_KEY);
    if (!v) return DEFAULT_SETTINGS;
    const parsed = JSON.parse(v);
    let effects = { ...DEFAULT_EFFECTS, ...(parsed.effects ?? {}) };
    if (typeof parsed.effectsEnabled === "boolean") {
      effects = {
        crt: parsed.effectsEnabled,
        glow: parsed.effectsEnabled,
        particles: parsed.effectsEnabled,
        visualizer: parsed.effectsEnabled,
      };
    }
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      ambience: { ...DEFAULT_SETTINGS.ambience, ...(parsed.ambience ?? {}) },
      effects,
      theme: parsed.theme || "classic",
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
export function saveSettings(s: JazzbarSettings) {
  if (!isBrowser()) return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

export function loadSession(): SessionState | null {
  if (!isBrowser()) return null;
  try {
    const v = window.localStorage.getItem(SESSION_KEY);
    if (!v) return null;
    const parsed = JSON.parse(v) as SessionState;
    if (Date.now() - parsed.savedAt > 4 * 60 * 60 * 1000) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    const elapsed = (Date.now() - parsed.savedAt) / 1000;
    if (parsed.phase === "paused") {
      return parsed;
    }
    const adjusted = parsed.remaining - elapsed;
    if (adjusted <= 0) {
      window.localStorage.removeItem(SESSION_KEY);
      return null;
    }
    return { ...parsed, remaining: adjusted };
  } catch {
    return null;
  }
}
export function saveSession(s: SessionState | null) {
  if (!isBrowser()) return;
  if (!s) {
    window.localStorage.removeItem(SESSION_KEY);
    return;
  }
  window.localStorage.setItem(SESSION_KEY, JSON.stringify({ ...s, savedAt: Date.now() }));
}
export function clearSession() {
  if (!isBrowser()) return;
  window.localStorage.removeItem(SESSION_KEY);
}

export function loadHistory(): SessionLog[] {
  if (!isBrowser()) return [];
  try {
    const v = window.localStorage.getItem(HISTORY_KEY);
    return v ? JSON.parse(v) : [];
  } catch {
    return [];
  }
}
export function saveSessionLog(log: SessionLog) {
  if (!isBrowser()) return;
  const history = loadHistory();
  history.unshift(log); // Add to beginning
  // Keep only last 100 sessions to prevent localStorage bloat
  if (history.length > 100) history.pop();
  window.localStorage.setItem(HISTORY_KEY, JSON.stringify(history));
}

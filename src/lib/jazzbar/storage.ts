const GROOVE_KEY = "jazzbar_groove";
const SETTINGS_KEY = "jazzbar_settings";

export interface AmbienceLevels {
  rain: number;
  fire: number;
  mumbling: number;
  wind: number;
  vinyl: number;
  cafe: number;
}

export interface JazzbarSettings {
  mainVolume: number;
  musicVolume: number; // 0..100
  musicMuted: boolean;
  ambientMuted: boolean;
  ambience: AmbienceLevels;
  effectsEnabled: boolean;
  shuffle: boolean;
  lastTrackId: string | null;
  lastWasPlaylist: boolean;
}

export const DEFAULT_SETTINGS: JazzbarSettings = {
  mainVolume: 60,
  musicVolume: 70,
  musicMuted: false,
  ambientMuted: false,
  ambience: { rain: 0, fire: 0, mumbling: 0, wind: 0, vinyl: 0, cafe: 0 },
  effectsEnabled: true,
  shuffle: false,
  lastTrackId: null,
  lastWasPlaylist: false,
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
    return {
      ...DEFAULT_SETTINGS,
      ...parsed,
      ambience: { ...DEFAULT_SETTINGS.ambience, ...(parsed.ambience ?? {}) },
    };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
export function saveSettings(s: JazzbarSettings) {
  if (!isBrowser()) return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

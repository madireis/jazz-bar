const GROOVE_KEY = "jazzbar_groove";
const SETTINGS_KEY = "jazzbar_settings";

export interface JazzbarSettings {
  mainVolume: number;
  fireplaceVolume: number;
  rainVolume: number;
  barMurmurVolume: number;
  effectsEnabled: boolean;
  musicMuted: boolean;
  ambientMuted: boolean;
}

export const DEFAULT_SETTINGS: JazzbarSettings = {
  mainVolume: 60,
  fireplaceVolume: 40,
  rainVolume: 30,
  barMurmurVolume: 25,
  effectsEnabled: true,
  musicMuted: false,
  ambientMuted: false,
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
    return { ...DEFAULT_SETTINGS, ...JSON.parse(v) };
  } catch {
    return DEFAULT_SETTINGS;
  }
}
export function saveSettings(s: JazzbarSettings) {
  if (!isBrowser()) return;
  window.localStorage.setItem(SETTINGS_KEY, JSON.stringify(s));
}

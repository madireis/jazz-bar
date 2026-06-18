// Curated jazz from YouTube. `id` is a video ID; `playlist` (optional) is a playlist ID.
export interface Track {
  id: string;
  title: string;
  artist: string;
  playlist?: string;
}

export const JAZZ_PLAYLIST_ID = "PLw-VjHDlEOgs658kAHR_LAaILBXb-s6Q5"; // Smooth Jazz mix
export const JAZZ_PLAYLIST_LABEL = "Smooth Jazz · Late Night";

export const TRACKS: Track[] = [
  { id: "Dx_fKPBPYUI", title: "Relaxing Jazz Bar", artist: "Cozy Lounge" },
  { id: "neV3EPgvZ3g", title: "Coffee Shop Jazz", artist: "Slow Cafe" },
  { id: "RZJ0gA0V3F8", title: "Whiskey Jazz", artist: "Midnight Bar" },
  { id: "fEvM-OUbaKs", title: "New York Jazz Lounge", artist: "After Hours" },
  { id: "qH3fETPsqXU", title: "Rainy Night Jazz", artist: "Blue Mood" },
  { id: "tNvh2w8lTes", title: "Smooth Saxophone", artist: "Velvet Sax" },
  { id: "kgx4WGa0wuU", title: "Slow Piano Jazz", artist: "Quiet Keys" },
  { id: "rnDqaVDXOnY", title: "Bourbon & Blues", artist: "Speakeasy" },
];

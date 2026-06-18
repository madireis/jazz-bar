// Scene stage progression.
// The background is a looping video (/bg-loop.mp4) — these stages only drive
// the timer display, particle intensity, and quote rotation.
export const STAGE_COUNT = 5;
export const STAGE_INTERVAL_MS = 8 * 60 * 1000; // advance every 8 min

export function stageForElapsed(elapsedMs: number): number {
  return Math.min(STAGE_COUNT - 1, Math.floor(elapsedMs / STAGE_INTERVAL_MS));
}

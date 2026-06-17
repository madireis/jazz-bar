// Pixel-art jazz bar scenes. 5 progressive stages, crossfaded full-bleed.
import stage0 from "@/assets/jazzbar/stage-0.jpg";
import stage1 from "@/assets/jazzbar/stage-1.jpg";
import stage2 from "@/assets/jazzbar/stage-2.jpg";
import stage3 from "@/assets/jazzbar/stage-3.jpg";
import stage4 from "@/assets/jazzbar/stage-4.jpg";

export const SCENE_STAGES: string[] = [stage0, stage1, stage2, stage3, stage4];
export const STAGE_COUNT = SCENE_STAGES.length;
export const STAGE_INTERVAL_MS = 8 * 60 * 1000; // advance every 8 min

export function stageForElapsed(elapsedMs: number): number {
  return Math.min(STAGE_COUNT - 1, Math.floor(elapsedMs / STAGE_INTERVAL_MS));
}

export type LessonProgress = {
  positionMs: number;
  speed: number;
  ranges: readonly { startMs: number; endMs: number; sessionAt: number }[];
  jumps: readonly { id: string; fromMs: number; toMs: number }[];
  notes: readonly { id: string; positionMs: number; text: string; tags: string }[];
};

/**
 * Playback progress only. Speed, notes, and every other field on the lesson stay.
 * Heard percentage is derived from `ranges`, so an empty list is 0%.
 */
export function clearedLessonProgress<T extends LessonProgress>(lesson: T): T {
  return {
    ...lesson,
    positionMs: 0,
    ranges: [],
    jumps: [],
  };
}

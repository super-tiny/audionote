export const SEEK_GAP_MS = 4000;
export const MIN_RANGE_MS = 500;

export type ListenRange = {
  startMs: number;
  endMs: number;
};

export type OpenListenRange = ListenRange & {
  itemId: string;
  sessionAt: number;
};

export function mergeRanges(ranges: readonly ListenRange[]): ListenRange[] {
  const sorted = ranges
    .filter((range) => range.endMs > range.startMs)
    .map((range) => ({ startMs: range.startMs, endMs: range.endMs }))
    .sort((left, right) => left.startMs - right.startMs || left.endMs - right.endMs);
  const merged: ListenRange[] = [];
  for (const range of sorted) {
    const last = merged[merged.length - 1];
    if (!last || range.startMs > last.endMs) {
      merged.push(range);
    } else {
      last.endMs = Math.max(last.endMs, range.endMs);
    }
  }
  return merged;
}

export function coveredMs(ranges: readonly ListenRange[]): number {
  return mergeRanges(ranges).reduce((total, range) => total + (range.endMs - range.startMs), 0);
}

export function listenedFraction(ranges: readonly ListenRange[], durationMs: number | null): number {
  if (!durationMs || durationMs <= 0) {
    return 0;
  }
  return Math.min(1, coveredMs(ranges) / durationMs);
}

/**
 * Extends the open listened interval while playback moves forward.
 * A backward jump or a gap larger than a few seconds closes the interval so a seek is not counted as listening.
 */
export function nextListenRange(
  open: OpenListenRange | null,
  itemId: string | null,
  positionMs: number,
  playing: boolean,
  now: number,
): { open: OpenListenRange | null; closed: OpenListenRange | null } {
  const closable = open && open.endMs - open.startMs >= MIN_RANGE_MS ? open : null;
  if (!playing || !itemId) {
    return { open: null, closed: open ? closable : null };
  }
  if (!open || open.itemId !== itemId) {
    return {
      closed: open ? closable : null,
      open: { itemId, startMs: positionMs, endMs: positionMs, sessionAt: now },
    };
  }
  const gap = positionMs - open.endMs;
  if (gap < 0 || gap > SEEK_GAP_MS) {
    return {
      closed: closable,
      open: { itemId, startMs: positionMs, endMs: positionMs, sessionAt: now },
    };
  }
  return {
    closed: null,
    open: { ...open, endMs: Math.max(open.endMs, positionMs) },
  };
}

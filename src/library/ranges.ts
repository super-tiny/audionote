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

function closableRange(open: OpenListenRange | null): OpenListenRange | null {
  if (!open || open.endMs - open.startMs < MIN_RANGE_MS) {
    return null;
  }
  return open;
}

/**
 * Extends the open listened interval while playback moves forward.
 * A backward jump or a gap larger than a few seconds closes the interval so a seek is not counted as listening.
 * Pausing includes the latest position when it still belongs to the open interval, so the tail is not dropped.
 */
export function nextListenRange(
  open: OpenListenRange | null,
  itemId: string | null,
  positionMs: number,
  playing: boolean,
  now: number,
): { open: OpenListenRange | null; closed: OpenListenRange | null } {
  const closable = closableRange(open);
  if (!itemId) {
    return { open: null, closed: closable };
  }
  if (!open || open.itemId !== itemId) {
    if (!playing) {
      return { open: null, closed: closable };
    }
    return {
      closed: closable,
      open: { itemId, startMs: positionMs, endMs: positionMs, sessionAt: now },
    };
  }
  const gap = positionMs - open.endMs;
  if (gap < 0 || gap > SEEK_GAP_MS) {
    if (!playing) {
      return { open: null, closed: closable };
    }
    return {
      closed: closable,
      open: { itemId, startMs: positionMs, endMs: positionMs, sessionAt: now },
    };
  }
  const extended: OpenListenRange = { ...open, endMs: Math.max(open.endMs, positionMs) };
  if (!playing) {
    return { open: null, closed: closableRange(extended) };
  }
  return { closed: null, open: extended };
}

/**
 * Position to credit when playback finishes on its own.
 * The playhead is often at the duration, but some players reset it to the start first.
 * A reset still counts through the end when the open interval was already within a seek gap of it.
 */
export function endedListenPositionMs(
  open: OpenListenRange | null,
  itemId: string | null,
  positionMs: number,
  durationMs: number,
): number {
  if (durationMs <= 0) {
    return Math.max(0, positionMs);
  }
  if (positionMs >= durationMs - SEEK_GAP_MS) {
    return durationMs;
  }
  if (
    open &&
    open.itemId === itemId &&
    positionMs <= MIN_RANGE_MS &&
    open.endMs <= durationMs &&
    durationMs - open.endMs <= SEEK_GAP_MS
  ) {
    return durationMs;
  }
  return Math.max(0, positionMs);
}

/**
 * Heard intervals for display. While playback is moving forward, the playhead extends the
 * active interval so the listened percentage can move between saved samples.
 */
export function projectHeardRanges(
  stored: readonly ListenRange[],
  open: ListenRange | null,
  positionMs: number,
  playing: boolean,
): ListenRange[] {
  const ranges = open ? [...stored, open] : [...stored];
  if (!playing) {
    return mergeRanges(ranges);
  }
  let bestIndex = -1;
  let bestGap = SEEK_GAP_MS + 1;
  ranges.forEach((range, index) => {
    const gap = positionMs - range.endMs;
    if (gap >= 0 && gap <= SEEK_GAP_MS && positionMs >= range.startMs && gap <= bestGap) {
      bestGap = gap;
      bestIndex = index;
    }
  });
  if (bestIndex < 0) {
    return mergeRanges(ranges);
  }
  const projected = ranges.map((range) => ({ startMs: range.startMs, endMs: range.endMs }));
  const active = projected[bestIndex];
  if (active) {
    active.endMs = Math.max(active.endMs, positionMs);
  }
  return mergeRanges(projected);
}

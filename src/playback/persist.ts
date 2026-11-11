import TrackPlayer, { PlaybackState } from '@rntp/player';

import {
  extendListenMarks,
  rangeGrowthBounds,
  saveListenRange,
  savePlayback,
  setDurationMs,
  syncListenMarks,
  updateListenRangeEnd,
} from '../db/library';
import {
  endedListenPositionMs,
  MIN_RANGE_MS,
  nextListenRange,
  playbackGapLimitMs,
  SEEK_GAP_MS,
  type ListenRange,
  type OpenListenRange,
} from '../library/ranges';

type ListenListener = (update: { itemId: string; open: ListenRange | null }) => void;

type TrackedRange = {
  rowId: number;
  itemId: string;
  startMs: number;
  endMs: number;
  sessionAt: number;
  /** Latest end of another row this pass already overlaps. Null when it is not a replay. */
  overlapCapMs: number | null;
  /** Media time where the next stored row starts. Crossing it changes important spans. */
  nextRangeStartMs: number;
  /** End time already reflected in the saved important spans. */
  marksEndMs: number;
};

let openRange: OpenListenRange | null = null;
let tracked: TrackedRange | null = null;
let lastClosed: TrackedRange | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let ticks = 0;
let ignoredItemId: string | null = null;
let ignoreUntil = 0;
let lastProgressAt: number | null = null;
const listeners = new Set<ListenListener>();

function ignoring(itemId: string | null): boolean {
  if (ignoredItemId == null || itemId !== ignoredItemId) {
    return false;
  }
  if (Date.now() >= ignoreUntil) {
    ignoredItemId = null;
    return false;
  }
  return true;
}

/**
 * Drop the in-memory range and ignore playhead samples briefly.
 * A seek back to the start can report the old position for a moment, and that
 * sample must not recreate the ranges that were just deleted.
 */
export function beginProgressReset(itemId: string, holdMs = 2500): void {
  ignoredItemId = itemId;
  ignoreUntil = Date.now() + holdMs;
  if (openRange?.itemId === itemId) {
    openRange = null;
  }
  if (tracked?.itemId === itemId) {
    tracked = null;
  }
  if (lastClosed?.itemId === itemId) {
    lastClosed = null;
  }
  lastProgressAt = null;
  publish(itemId);
}

export function subscribeListenProgress(listener: ListenListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function currentOpenListen(): { itemId: string; sessionAt: number; range: ListenRange } | null {
  if (!openRange || ignoring(openRange.itemId)) {
    return null;
  }
  return {
    itemId: openRange.itemId,
    sessionAt: openRange.sessionAt,
    range: { startMs: openRange.startMs, endMs: openRange.endMs },
  };
}

function publish(itemId: string): void {
  const open =
    openRange && openRange.itemId === itemId && !ignoring(itemId)
      ? { startMs: openRange.startMs, endMs: openRange.endMs }
      : null;
  for (const listener of listeners) {
    listener({ itemId, open });
  }
}

function activeItemId(): string | null {
  try {
    return TrackPlayer.getActiveMediaItem()?.mediaId ?? null;
  } catch {
    return null;
  }
}

type Clock = {
  itemId: string | null;
  positionMs: number;
  durationMs: number;
  playing: boolean;
  ended: boolean;
};

function readClock(): Clock | null {
  try {
    const progress = TrackPlayer.getProgress();
    return {
      itemId: activeItemId(),
      positionMs: progress.position * 1000,
      durationMs: progress.duration * 1000,
      playing: TrackPlayer.isPlaying(),
      ended: TrackPlayer.getPlaybackState() === PlaybackState.Ended,
    };
  } catch {
    return null;
  }
}

function sameSpan(range: OpenListenRange, row: TrackedRange): boolean {
  return row.itemId === range.itemId && row.sessionAt === range.sessionAt && row.startMs === range.startMs;
}

function withBounds(row: TrackedRange): TrackedRange {
  const bounds = rangeGrowthBounds(row.itemId, row.rowId, row.startMs, row.endMs);
  return {
    ...row,
    overlapCapMs: bounds.overlapCapMs,
    nextRangeStartMs: bounds.nextRangeStartMs,
    marksEndMs: row.endMs,
  };
}

function commitEnd(row: TrackedRange, endMs: number): TrackedRange {
  updateListenRangeEnd(row.rowId, endMs, row.itemId);
  if (endMs > row.nextRangeStartMs) {
    syncListenMarks(row.itemId);
    return withBounds({ ...row, endMs });
  }
  let next: TrackedRange = { ...row, endMs };
  if (row.overlapCapMs != null && endMs > row.marksEndMs) {
    const limit = Math.min(endMs, row.overlapCapMs);
    if (limit > row.marksEndMs) {
      extendListenMarks(row.itemId, row.marksEndMs, limit);
      next = { ...next, marksEndMs: limit };
    }
    if (endMs >= row.overlapCapMs) {
      next = { ...next, overlapCapMs: null };
    }
  }
  return next;
}

function writeRange(range: OpenListenRange, closing: boolean): void {
  if (ignoring(range.itemId)) {
    return;
  }
  if (range.endMs - range.startMs < MIN_RANGE_MS) {
    if (closing && tracked && sameSpan(range, tracked)) {
      tracked = null;
    }
    return;
  }
  if (tracked && sameSpan(range, tracked)) {
    tracked = commitEnd(tracked, range.endMs);
  } else {
    const rowId = saveListenRange(range.itemId, range.startMs, range.endMs, range.sessionAt);
    syncListenMarks(range.itemId);
    tracked = withBounds({
      rowId,
      itemId: range.itemId,
      startMs: range.startMs,
      endMs: range.endMs,
      sessionAt: range.sessionAt,
      overlapCapMs: null,
      nextRangeStartMs: Number.POSITIVE_INFINITY,
      marksEndMs: range.endMs,
    });
  }
  if (closing) {
    lastClosed = tracked;
    tracked = null;
  }
}

function applyStep(step: { open: OpenListenRange | null; closed: OpenListenRange | null }): void {
  if (step.closed) {
    writeRange(step.closed, true);
  }
  openRange = step.open;
  if (step.open) {
    writeRange(step.open, false);
  }
  if (step.closed && step.closed.itemId !== step.open?.itemId) {
    publish(step.closed.itemId);
  }
  const itemId = step.open?.itemId ?? step.closed?.itemId;
  if (itemId) {
    publish(itemId);
  }
}

/** Extends a range that was closed a moment early, such as when the playhead resets at the end. */
function creditTail(itemId: string, endMs: number): boolean {
  if (ignoring(itemId)) {
    return false;
  }
  const target = tracked?.itemId === itemId ? tracked : lastClosed?.itemId === itemId ? lastClosed : null;
  if (!target || endMs <= target.endMs || endMs - target.endMs > SEEK_GAP_MS) {
    return false;
  }
  const extended = commitEnd(target, endMs);
  if (tracked?.rowId === target.rowId) {
    tracked = extended;
  }
  if (lastClosed?.rowId === target.rowId) {
    lastClosed = extended;
  }
  if (
    openRange &&
    openRange.itemId === itemId &&
    openRange.sessionAt === target.sessionAt &&
    openRange.startMs === target.startMs
  ) {
    openRange = { ...openRange, endMs };
  }
  return true;
}

function dropOpen(): void {
  if (!openRange) {
    return;
  }
  if (ignoring(openRange.itemId)) {
    const itemId = openRange.itemId;
    openRange = null;
    if (tracked?.itemId === itemId) {
      tracked = null;
    }
    publish(itemId);
    return;
  }
  const dangling = openRange;
  openRange = null;
  writeRange(dangling, true);
  publish(dangling.itemId);
}

function readSpeed(): number {
  try {
    const speed = TrackPlayer.getPlaybackSpeed();
    return Number.isFinite(speed) && speed > 0 ? speed : 1;
  } catch {
    return 1;
  }
}

function recordListen(clock: Clock, forceEnded: boolean, sampledAt = Date.now()): string | null {
  const ended = forceEnded || clock.ended;
  const itemId = clock.itemId ?? (ended ? openRange?.itemId ?? lastClosed?.itemId ?? null : null);
  if (ignoring(itemId)) {
    return null;
  }
  const elapsed = lastProgressAt == null ? 0 : Math.max(0, sampledAt - lastProgressAt);
  if (lastProgressAt == null || sampledAt >= lastProgressAt) {
    lastProgressAt = sampledAt;
  }
  const positionMs = ended
    ? endedListenPositionMs(openRange, itemId, clock.positionMs, clock.durationMs)
    : clock.positionMs;
  const step = nextListenRange(
    openRange,
    itemId,
    positionMs,
    ended ? false : clock.playing,
    sampledAt,
    playbackGapLimitMs(elapsed, readSpeed()),
  );
  applyStep(step);
  if (ended && itemId) {
    const endMs = clock.durationMs > 0 ? clock.durationMs : positionMs;
    if (creditTail(itemId, endMs)) {
      publish(itemId);
    }
  }
  return itemId;
}

function saveResume(itemId: string, clock: Clock, forceEnded: boolean): void {
  if (ignoring(itemId)) {
    return;
  }
  const ended = forceEnded || clock.ended;
  const positionMs = ended && clock.durationMs > 0 ? clock.durationMs : clock.positionMs;
  try {
    savePlayback(itemId, positionMs, TrackPlayer.getPlaybackSpeed());
    if (clock.durationMs > 1000) {
      setDurationMs(itemId, clock.durationMs);
    }
  } catch {
    // Getters throw while the native session is tearing down.
  }
}

/**
 * Native playback clock. It keeps firing while the app is minimized or the
 * screen is locked, which is when the JavaScript timer is suspended.
 * `position` and `duration` are seconds.
 */
export function recordSyncedProgress(event: {
  mediaId: string;
  position: number;
  duration: number;
  timestamp: number;
}): void {
  const sampledAt = Number.isFinite(event.timestamp) && event.timestamp > 0 ? event.timestamp : Date.now();
  const clock: Clock = {
    itemId: event.mediaId,
    positionMs: event.position * 1000,
    durationMs: event.duration * 1000,
    playing: true,
    ended: false,
  };
  if (clock.itemId != null && ignoring(clock.itemId)) {
    if (openRange?.itemId === clock.itemId) {
      openRange = null;
    }
    lastProgressAt = sampledAt;
    publish(clock.itemId);
    return;
  }
  const itemId = recordListen(clock, false, sampledAt);
  if (itemId) {
    saveResume(itemId, clock, false);
  }
}

export function flushProgress(options?: { ended?: boolean }): void {
  const clock = readClock();
  if (!clock) {
    dropOpen();
    return;
  }
  if (clock.itemId != null && ignoring(clock.itemId)) {
    if (openRange?.itemId === clock.itemId) {
      openRange = null;
    }
    publish(clock.itemId);
    return;
  }
  const itemId = recordListen(clock, options?.ended ?? false);
  if (itemId) {
    saveResume(itemId, clock, options?.ended ?? false);
  }
}

export function startProgressTicker(): void {
  if (timer) {
    return;
  }
  timer = setInterval(() => {
    ticks += 1;
    const clock = readClock();
    if (!clock) {
      return;
    }
    if (clock.itemId != null && ignoring(clock.itemId)) {
      if (openRange?.itemId === clock.itemId) {
        openRange = null;
      }
      publish(clock.itemId);
      return;
    }
    const itemId = recordListen(clock, false);
    if (itemId && (ticks % 5 === 0 || !clock.playing || clock.ended)) {
      saveResume(itemId, clock, false);
    }
  }, 1000);
}

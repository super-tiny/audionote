import TrackPlayer, { PlaybackState } from '@rntp/player';

import { insertListenRange, savePlayback, setDurationMs, updateListenRangeEnd } from '../db/library';
import {
  endedListenPositionMs,
  MIN_RANGE_MS,
  nextListenRange,
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
};

let openRange: OpenListenRange | null = null;
let tracked: TrackedRange | null = null;
let lastClosed: TrackedRange | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let ticks = 0;
let ignoredItemId: string | null = null;
let ignoreUntil = 0;
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
    updateListenRangeEnd(tracked.rowId, range.endMs);
    tracked = { ...tracked, endMs: range.endMs };
  } else {
    const rowId = insertListenRange(range.itemId, range.startMs, range.endMs, range.sessionAt);
    tracked = {
      rowId,
      itemId: range.itemId,
      startMs: range.startMs,
      endMs: range.endMs,
      sessionAt: range.sessionAt,
    };
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
  updateListenRangeEnd(target.rowId, endMs);
  if (tracked?.rowId === target.rowId) {
    tracked = { ...target, endMs };
  }
  if (lastClosed?.rowId === target.rowId) {
    lastClosed = { ...target, endMs };
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

function recordListen(clock: Clock, forceEnded: boolean): string | null {
  const ended = forceEnded || clock.ended;
  const itemId = clock.itemId ?? (ended ? openRange?.itemId ?? lastClosed?.itemId ?? null : null);
  if (ignoring(itemId)) {
    return null;
  }
  const positionMs = ended
    ? endedListenPositionMs(openRange, itemId, clock.positionMs, clock.durationMs)
    : clock.positionMs;
  const step = nextListenRange(openRange, itemId, positionMs, ended ? false : clock.playing, Date.now());
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

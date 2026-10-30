import TrackPlayer from '@rntp/player';

import { insertListenRange, savePlayback, setDurationMs } from '../db/library';
import { nextListenRange, type OpenListenRange } from '../library/ranges';

let openRange: OpenListenRange | null = null;
let timer: ReturnType<typeof setInterval> | null = null;
let ticks = 0;

function activeItemId(): string | null {
  try {
    return TrackPlayer.getActiveMediaItem()?.mediaId ?? null;
  } catch {
    return null;
  }
}

function closeOpenRange(): void {
  if (!openRange) {
    return;
  }
  const closed = openRange;
  openRange = null;
  if (closed.endMs - closed.startMs >= 500) {
    insertListenRange(closed.itemId, closed.startMs, closed.endMs, closed.sessionAt);
  }
}

export function flushProgress(): void {
  const itemId = activeItemId();
  let positionMs = 0;
  let durationMs = 0;
  let playing = false;
  try {
    const progress = TrackPlayer.getProgress();
    positionMs = progress.position * 1000;
    durationMs = progress.duration * 1000;
    playing = TrackPlayer.isPlaying();
  } catch {
    closeOpenRange();
    return;
  }
  const step = nextListenRange(openRange, itemId, positionMs, playing, Date.now());
  if (step.closed) {
    insertListenRange(step.closed.itemId, step.closed.startMs, step.closed.endMs, step.closed.sessionAt);
  }
  openRange = step.open;
  if (!playing) {
    closeOpenRange();
  }
  if (itemId) {
    const speed = TrackPlayer.getPlaybackSpeed();
    savePlayback(itemId, positionMs, speed);
    if (durationMs > 1000) {
      setDurationMs(itemId, durationMs);
    }
  }
}

export function startProgressTicker(): void {
  if (timer) {
    return;
  }
  timer = setInterval(() => {
    ticks += 1;
    const itemId = activeItemId();
    let playing = false;
    let positionMs = 0;
    let durationMs = 0;
    try {
      playing = TrackPlayer.isPlaying();
      const progress = TrackPlayer.getProgress();
      positionMs = progress.position * 1000;
      durationMs = progress.duration * 1000;
    } catch {
      return;
    }
    const step = nextListenRange(openRange, itemId, positionMs, playing, Date.now());
    if (step.closed) {
      insertListenRange(step.closed.itemId, step.closed.startMs, step.closed.endMs, step.closed.sessionAt);
    }
    openRange = step.open;
    if (itemId && (ticks % 5 === 0 || !playing)) {
      savePlayback(itemId, positionMs, TrackPlayer.getPlaybackSpeed());
      if (durationMs > 1000) {
        setDurationMs(itemId, durationMs);
      }
    }
  }, 1000);
}

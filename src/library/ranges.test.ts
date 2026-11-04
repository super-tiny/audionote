import assert from 'node:assert/strict';
import test from 'node:test';

import {
  coveredMs,
  endedListenPositionMs,
  listenedFraction,
  mergeRanges,
  nextListenRange,
  projectHeardRanges,
} from './ranges.ts';

test('merges overlapping listened ranges and ignores empty ones', () => {
  const merged = mergeRanges([
    { startMs: 0, endMs: 10_000 },
    { startMs: 8_000, endMs: 12_000 },
    { startMs: 20_000, endMs: 20_000 },
    { startMs: 30_000, endMs: 35_000 },
  ]);
  assert.deepEqual(merged, [
    { startMs: 0, endMs: 12_000 },
    { startMs: 30_000, endMs: 35_000 },
  ]);
  assert.equal(coveredMs(merged), 17_000);
  assert.equal(listenedFraction(merged, 100_000), 0.17);
});

test('closes a range when playback pauses or seeks', () => {
  const started = nextListenRange(null, 'lesson', 1_000, true, 10);
  assert.equal(started.closed, null);
  assert.equal(started.open?.startMs, 1_000);

  const extended = nextListenRange(started.open, 'lesson', 3_000, true, 11);
  assert.equal(extended.closed, null);
  assert.equal(extended.open?.endMs, 3_000);

  const paused = nextListenRange(extended.open, 'lesson', 3_000, false, 12);
  assert.equal(paused.open, null);
  assert.deepEqual(paused.closed, {
    itemId: 'lesson',
    startMs: 1_000,
    endMs: 3_000,
    sessionAt: 10,
  });

  const afterSeek = nextListenRange(extended.open, 'lesson', 40_000, true, 13);
  assert.equal(afterSeek.closed?.endMs, 3_000);
  assert.equal(afterSeek.open?.startMs, 40_000);

  const pausedLater = nextListenRange(extended.open, 'lesson', 4_500, false, 14);
  assert.equal(pausedLater.open, null);
  assert.equal(pausedLater.closed?.endMs, 4_500);

  const pausedAcrossSeek = nextListenRange(extended.open, 'lesson', 40_000, false, 15);
  assert.equal(pausedAcrossSeek.open, null);
  assert.equal(pausedAcrossSeek.closed?.endMs, 3_000);
});

test('grows one listened interval while playback continues', () => {
  let step = nextListenRange(null, 'lesson', 0, true, 1);
  for (const position of [1_000, 2_000, 3_000, 4_000]) {
    step = nextListenRange(step.open, 'lesson', position, true, 2);
    assert.equal(step.closed, null);
  }
  assert.equal(step.open?.startMs, 0);
  assert.equal(step.open?.endMs, 4_000);

  const finished = nextListenRange(step.open, 'lesson', 7_500, false, 3);
  assert.equal(finished.open, null);
  assert.equal(finished.closed?.startMs, 0);
  assert.equal(finished.closed?.endMs, 7_500);
});

test('natural end credits the tail, including a playhead that reset to the start', () => {
  const open = { itemId: 'lesson', startMs: 0, endMs: 57_000, sessionAt: 4 };
  const atEnd = endedListenPositionMs(open, 'lesson', 59_500, 60_000);
  const finished = nextListenRange(open, 'lesson', atEnd, false, 5);
  assert.equal(finished.closed?.endMs, 60_000);
  assert.equal(finished.open, null);

  const reset = endedListenPositionMs(open, 'lesson', 0, 60_000);
  const finishedReset = nextListenRange(open, 'lesson', reset, false, 6);
  assert.equal(finishedReset.closed?.endMs, 60_000);

  const earlier = { ...open, endMs: 10_000 };
  const seekAway = endedListenPositionMs(earlier, 'lesson', 0, 60_000);
  const ignored = nextListenRange(earlier, 'lesson', seekAway, false, 7);
  assert.equal(seekAway, 0);
  assert.equal(ignored.closed?.endMs, 10_000);
});

test('projects the playhead onto the open interval while audio is playing', () => {
  const shown = projectHeardRanges([{ startMs: 0, endMs: 4_000 }], { startMs: 0, endMs: 4_000 }, 5_250, true);
  assert.deepEqual(shown, [{ startMs: 0, endMs: 5_250 }]);
  assert.equal(listenedFraction(shown, 10_000), 0.525);

  const fresh = projectHeardRanges([], { startMs: 1_000, endMs: 1_000 }, 1_800, true);
  assert.deepEqual(fresh, [{ startMs: 1_000, endMs: 1_800 }]);

  const paused = projectHeardRanges([{ startMs: 0, endMs: 4_000 }], { startMs: 4_000, endMs: 8_000 }, 12_000, false);
  assert.deepEqual(paused, [{ startMs: 0, endMs: 8_000 }]);

  const seek = projectHeardRanges([{ startMs: 0, endMs: 4_000 }], null, 40_000, true);
  assert.deepEqual(seek, [{ startMs: 0, endMs: 4_000 }]);
});

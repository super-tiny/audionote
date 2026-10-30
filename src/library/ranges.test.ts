import assert from 'node:assert/strict';
import test from 'node:test';

import { coveredMs, listenedFraction, mergeRanges, nextListenRange } from './ranges.ts';

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
});

import assert from 'node:assert/strict';
import test from 'node:test';

import { formatClock, formatHours, notePositionMs } from './capture.ts';

test('captures a note a few seconds before the current position', () => {
  assert.equal(notePositionMs(12_400), 9_400);
  assert.equal(notePositionMs(1_000), 0);
  assert.equal(notePositionMs(Number.NaN), 0);
});

test('formats playback clocks', () => {
  assert.equal(formatClock(49_000), '0:49');
  assert.equal(formatClock(65_000), '1:05');
  assert.equal(formatClock(3_390_000), '56:30');
  assert.equal(formatClock(3_723_000), '1:02:03');
  assert.equal(formatClock(4_360_000), '1:12:40');
  assert.equal(formatClock(9 * 3_600_000), '9:00:00');
  assert.equal(formatHours(3_720_000), '1h 2m');
  assert.equal(formatHours(120_000), '2m');
});

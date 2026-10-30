import assert from 'node:assert/strict';
import test from 'node:test';

import { formatClock, formatHours, notePositionMs } from './capture.ts';

test('captures a note a few seconds before the current position', () => {
  assert.equal(notePositionMs(12_400), 9_400);
  assert.equal(notePositionMs(1_000), 0);
  assert.equal(notePositionMs(Number.NaN), 0);
});

test('formats playback clocks', () => {
  assert.equal(formatClock(65_000), '1:05');
  assert.equal(formatClock(3_723_000), '1:02:03');
  assert.equal(formatHours(3_720_000), '1h 2m');
  assert.equal(formatHours(120_000), '2m');
});

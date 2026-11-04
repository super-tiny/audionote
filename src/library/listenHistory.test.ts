import assert from 'node:assert/strict';
import test from 'node:test';

import {
  durationBand,
  filterProblem,
  LONG_MIN_MS,
  parseMinutes,
  portionMatches,
  selectPortions,
  SHORT_MAX_MS,
  type ListenPortion,
} from './listenHistory.ts';

function portion(id: number, startMs: number, endMs: number, sessionAt = id): ListenPortion {
  return { id, itemId: 'lesson', title: 'Lesson', startMs, endMs, sessionAt };
}

const portions = [
  portion(1, 0, 30_000, 300),
  portion(2, 45_000, 45_000 + SHORT_MAX_MS, 100),
  portion(3, 120_000, 120_000 + LONG_MIN_MS, 200),
  portion(4, 10_000, 70_000, 400),
];

test('classifies short, medium, and long portions at the boundaries', () => {
  assert.equal(durationBand(SHORT_MAX_MS - 1), 'short');
  assert.equal(durationBand(SHORT_MAX_MS), 'medium');
  assert.equal(durationBand(LONG_MIN_MS - 1), 'medium');
  assert.equal(durationBand(LONG_MIN_MS), 'long');
});

test('filters by preset length and by a custom inclusive range', () => {
  assert.deepEqual(
    selectPortions(portions, { kind: 'short' }, 'start', 'asc').map((entry) => entry.id),
    [1],
  );
  assert.deepEqual(
    selectPortions(portions, { kind: 'medium' }, 'start', 'asc').map((entry) => entry.id),
    [4, 2],
  );
  assert.deepEqual(
    selectPortions(portions, { kind: 'long' }, 'start', 'asc').map((entry) => entry.id),
    [3],
  );
  assert.equal(portionMatches(60_000, { kind: 'custom', minMs: 60_000, maxMs: 60_000, invalid: false }), true);
  assert.equal(portionMatches(59_999, { kind: 'custom', minMs: 60_000, maxMs: null, invalid: false }), false);
  assert.equal(portionMatches(120_000, { kind: 'custom', minMs: null, maxMs: 90_000, invalid: false }), false);
  assert.equal(portionMatches(30_000, { kind: 'custom', minMs: null, maxMs: null, invalid: false }), true);
});

test('rejects an invalid custom range and a minimum above the maximum', () => {
  const invalid = { kind: 'custom' as const, minMs: null, maxMs: null, invalid: true };
  const backwards = { kind: 'custom' as const, minMs: 120_000, maxMs: 30_000, invalid: false };
  assert.equal(filterProblem(invalid), 'Use minutes, such as 1.5.');
  assert.equal(filterProblem(backwards), 'Minimum is longer than maximum.');
  assert.deepEqual(selectPortions(portions, invalid, 'start', 'asc'), []);
  assert.deepEqual(selectPortions(portions, backwards, 'start', 'asc'), []);
  assert.deepEqual(parseMinutes(''), { ms: null, invalid: false });
  assert.deepEqual(parseMinutes('1.5'), { ms: 90_000, invalid: false });
  assert.deepEqual(parseMinutes('1.5m'), { ms: null, invalid: true });
});

test('sorts by start, length, or when the portion was heard', () => {
  assert.deepEqual(
    selectPortions(portions, { kind: 'all' }, 'start', 'asc').map((entry) => entry.id),
    [1, 4, 2, 3],
  );
  assert.deepEqual(
    selectPortions(portions, { kind: 'all' }, 'start', 'desc').map((entry) => entry.id),
    [3, 2, 4, 1],
  );
  assert.deepEqual(
    selectPortions(portions, { kind: 'all' }, 'duration', 'asc').map((entry) => entry.id),
    [1, 4, 2, 3],
  );
  assert.deepEqual(
    selectPortions(portions, { kind: 'all' }, 'duration', 'desc').map((entry) => entry.id),
    [3, 4, 2, 1],
  );
  assert.deepEqual(
    selectPortions(portions, { kind: 'all' }, 'listened', 'asc').map((entry) => entry.id),
    [2, 3, 1, 4],
  );
});

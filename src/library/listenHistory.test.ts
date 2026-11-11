import assert from 'node:assert/strict';
import test from 'node:test';

import {
  aggregateSequentialPortions,
  durationBand,
  filterProblem,
  importantSections,
  pickContinuation,
  LONG_MIN_MS,
  parseMinutes,
  portionMatches,
  selectPortions,
  SEQUENTIAL_START_GAP_MS,
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
  assert.equal(filterProblem(invalid), 'invalid');
  assert.equal(filterProblem(backwards), 'order');
  assert.deepEqual(selectPortions(portions, invalid, 'start', 'asc'), []);
  assert.deepEqual(selectPortions(portions, backwards, 'start', 'asc'), []);
  assert.deepEqual(parseMinutes(''), { ms: null, invalid: false });
  assert.deepEqual(parseMinutes('1.5'), { ms: 90_000, invalid: false });
  assert.deepEqual(parseMinutes('1.5m'), { ms: null, invalid: true });
});

test('merges listens that continue within a minute and keeps the first start', () => {
  const merged = aggregateSequentialPortions([
    portion(1, 10_000, 15_000, 1_000),
    portion(2, 15_000, 20_000, 1_000 + 20_000),
  ]);
  assert.deepEqual(
    merged.map((entry) => ({
      id: entry.id,
      startMs: entry.startMs,
      endMs: entry.endMs,
      sessionAt: entry.sessionAt,
      replays: entry.replays,
    })),
    [{ id: 1, startMs: 10_000, endMs: 20_000, sessionAt: 1_000, replays: [] }],
  );
});

test('keeps a later continuation separate once the start times are a minute apart', () => {
  const morning = 1_000;
  const evening = morning + 8 * 60 * 60_000;
  const apart = aggregateSequentialPortions([
    portion(1, 10_000, 15_000, morning),
    portion(2, 15_000, 20_000, evening),
  ]);
  assert.deepEqual(
    apart.map((entry) => entry.id),
    [1, 2],
  );
  assert.deepEqual(apart[0]?.replays, []);
  assert.deepEqual(apart[1]?.replays, []);

  const exactMinute = aggregateSequentialPortions([
    portion(1, 10_000, 15_000, 0),
    portion(2, 15_000, 20_000, SEQUENTIAL_START_GAP_MS),
  ]);
  assert.deepEqual(
    exactMinute.map((entry) => [entry.id, entry.endMs]),
    [
      [1, 15_000],
      [2, 20_000],
    ],
  );

  const justInside = aggregateSequentialPortions([
    portion(1, 10_000, 15_000, 0),
    portion(2, 15_000, 20_000, SEQUENTIAL_START_GAP_MS - 1),
  ]);
  assert.equal(justInside.length, 1);
  assert.equal(justInside[0]?.endMs, 20_000);
});

test('a chain uses each hop’s own start, so the whole pass can run past one minute', () => {
  const merged = aggregateSequentialPortions([
    portion(1, 0, 10_000, 0),
    portion(2, 10_000, 20_000, 50_000),
    portion(3, 20_000, 30_000, 100_000),
  ]);
  assert.deepEqual(
    merged.map((entry) => ({ id: entry.id, startMs: entry.startMs, endMs: entry.endMs, sessionAt: entry.sessionAt })),
    [{ id: 1, startMs: 0, endMs: 30_000, sessionAt: 0 }],
  );

  const broken = aggregateSequentialPortions([
    portion(1, 0, 10_000, 0),
    portion(2, 10_000, 20_000, 50_000),
    portion(3, 20_000, 30_000, 50_000 + SEQUENTIAL_START_GAP_MS),
  ]);
  assert.deepEqual(
    broken.map((entry) => [entry.id, entry.startMs, entry.endMs]),
    [
      [1, 0, 20_000],
      [3, 20_000, 30_000],
    ],
  );
});

test('a long chain stays one record while each hop starts within a minute', () => {
  const passes: ListenPortion[] = [];
  let endMs = 0;
  for (let index = 0; index < 30; index += 1) {
    const startMs = endMs;
    endMs = startMs + 5_000;
    passes.push(portion(index + 1, startMs, endMs, index * 30_000));
  }
  const merged = aggregateSequentialPortions(passes);
  assert.equal(merged.length, 1);
  assert.equal(merged[0]?.startMs, 0);
  assert.equal(merged[0]?.endMs, 150_000);
  assert.equal(merged[0]?.sessionAt, 0);
  assert.equal(merged[0]?.anchorAt, 29 * 30_000);
  assert.deepEqual(merged[0]?.replays, []);
});

test('picks the latest listen that the new pass continues', () => {
  const rows = [
    { id: 1, startMs: 0, endMs: 20_000, anchorAt: 0 },
    { id: 2, startMs: 10_000, endMs: 20_000, anchorAt: 10_000 },
    { id: 3, startMs: 10_000, endMs: 12_000, anchorAt: 5_000 },
  ];
  assert.equal(pickContinuation(rows, { startMs: 20_000, endMs: 30_000, sessionAt: 20_000 })?.id, 2);
  assert.equal(
    pickContinuation(rows, { startMs: 20_000, endMs: 30_000, sessionAt: 10_000 + SEQUENTIAL_START_GAP_MS }),
    null,
  );
  assert.equal(pickContinuation(rows, { startMs: 10_000, endMs: 12_000, sessionAt: 15_000 }), null);
});

test('does not merge a skip, and absorbs only a small resume gap or rewind', () => {
  const skipped = aggregateSequentialPortions([
    portion(1, 10_000, 15_000, 0),
    portion(2, 17_000, 22_000, 10_000),
  ]);
  assert.deepEqual(
    skipped.map((entry) => [entry.id, entry.startMs, entry.endMs]),
    [
      [1, 10_000, 15_000],
      [2, 17_000, 22_000],
    ],
  );

  const jitter = aggregateSequentialPortions([
    portion(1, 10_000, 15_000, 0),
    portion(2, 15_500, 20_000, 10_000),
    portion(3, 30_000, 35_000, 20_000),
    portion(4, 34_200, 40_000, 30_000),
  ]);
  assert.deepEqual(
    jitter.map((entry) => [entry.id, entry.startMs, entry.endMs, entry.replays]),
    [
      [1, 10_000, 20_000, []],
      [3, 30_000, 40_000, []],
    ],
  );
});

test('keeps repeated listens and marks the shared span as important', () => {
  const replayed = aggregateSequentialPortions([
    portion(1, 10_000, 15_000, 0),
    portion(2, 10_000, 12_000, 30_000),
  ]);
  assert.deepEqual(
    replayed.map((entry) => ({
      id: entry.id,
      startMs: entry.startMs,
      endMs: entry.endMs,
      replays: entry.replays,
    })),
    [
      { id: 1, startMs: 10_000, endMs: 15_000, replays: [{ startMs: 10_000, endMs: 12_000 }] },
      { id: 2, startMs: 10_000, endMs: 12_000, replays: [{ startMs: 10_000, endMs: 12_000 }] },
    ],
  );
  assert.deepEqual(
    importantSections([
      { startMs: 10_000, endMs: 15_000, sessionAt: 0 },
      { startMs: 15_000, endMs: 20_000, sessionAt: 20_000 },
      { startMs: 10_000, endMs: 12_000, sessionAt: 30_000 },
    ]),
    [{ startMs: 10_000, endMs: 12_000 }],
  );
});

test('a replay between two sequential parts stays, and the continuation still joins the pass it follows', () => {
  const between = aggregateSequentialPortions([
    portion(1, 10_000, 15_000, 0),
    portion(2, 10_000, 12_000, 10_000),
    portion(3, 15_000, 20_000, 20_000),
  ]);
  assert.deepEqual(
    between.map((entry) => ({ id: entry.id, startMs: entry.startMs, endMs: entry.endMs, replays: entry.replays })),
    [
      { id: 1, startMs: 10_000, endMs: 20_000, replays: [{ startMs: 10_000, endMs: 12_000 }] },
      { id: 2, startMs: 10_000, endMs: 12_000, replays: [{ startMs: 10_000, endMs: 12_000 }] },
    ],
  );

  const extendedReplay = aggregateSequentialPortions([
    portion(1, 0, 20_000, 0),
    portion(2, 10_000, 20_000, 10_000),
    portion(3, 20_000, 30_000, 20_000),
  ]);
  assert.deepEqual(
    extendedReplay.map((entry) => ({ id: entry.id, startMs: entry.startMs, endMs: entry.endMs, replays: entry.replays })),
    [
      { id: 1, startMs: 0, endMs: 20_000, replays: [{ startMs: 10_000, endMs: 20_000 }] },
      { id: 2, startMs: 10_000, endMs: 30_000, replays: [{ startMs: 10_000, endMs: 20_000 }] },
    ],
  );
});

test('does not merge or mark replays across lessons', () => {
  const first = portion(1, 10_000, 15_000, 0);
  const second = { ...portion(2, 15_000, 20_000, 10_000), itemId: 'other' };
  const merged = aggregateSequentialPortions([first, second]);
  assert.deepEqual(
    merged.map((entry) => entry.itemId),
    ['lesson', 'other'],
  );
  assert.deepEqual(merged[0]?.replays, []);
});

test('filters and sorts the merged portion, while a replay keeps its own length', () => {
  const passes = [
    portion(1, 0, 50_000, 0),
    portion(2, 50_000, 130_000, 50_000),
    portion(3, 0, 10_000, 80_000),
  ];
  assert.deepEqual(
    selectPortions(passes, { kind: 'short' }, 'start', 'asc').map((entry) => entry.id),
    [3],
  );
  assert.deepEqual(
    selectPortions(passes, { kind: 'medium' }, 'start', 'asc').map((entry) => [entry.id, entry.endMs]),
    [[1, 130_000]],
  );
  const short = selectPortions(passes, { kind: 'short' }, 'start', 'asc');
  assert.deepEqual(short[0]?.replays, [{ startMs: 0, endMs: 10_000 }]);
  const medium = selectPortions(passes, { kind: 'medium' }, 'duration', 'desc');
  assert.deepEqual(medium[0]?.replays, [{ startMs: 0, endMs: 10_000 }]);
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

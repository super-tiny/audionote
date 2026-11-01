import assert from 'node:assert/strict';
import test from 'node:test';

import { formatClock } from '../notes/capture.ts';
import {
  JUMP_HISTORY_LIMIT,
  JUMP_MIN_DISTANCE_MS,
  JUMP_SETTLE_MS,
  commitPending,
  createJumpScheduler,
  idsToDrop,
  type JumpDraft,
  type SeekInput,
} from './jumpRecord.ts';

const LESSON = 'lesson';
const FROM = 49_000;
const TO = 56 * 60_000 + 30_000;

function harness() {
  const saves: JumpDraft[] = [];
  let clock = 1_000;
  let activeTimers = 0;
  let pendingCallback: (() => void) | null = null;
  let lastDelay = -1;

  const scheduler = createJumpScheduler({
    save: (jump) => {
      saves.push(jump);
    },
    now: () => clock,
    settleMs: JUMP_SETTLE_MS,
    setTimer: (callback, delayMs) => {
      activeTimers += 1;
      pendingCallback = callback;
      lastDelay = delayMs;
      return () => {
        activeTimers -= 1;
        if (pendingCallback === callback) {
          pendingCallback = null;
        }
      };
    },
  });

  return {
    saves,
    scheduler,
    seek(input: SeekInput) {
      scheduler.recordSeek(input);
    },
    fireTimer() {
      const callback = pendingCallback;
      pendingCallback = null;
      activeTimers = Math.max(0, activeTimers - 1);
      callback?.();
    },
    get activeTimers() {
      return activeTimers;
    },
    get lastDelay() {
      return lastDelay;
    },
    advance(ms: number) {
      clock += ms;
    },
  };
}

test('one drag becomes a single row after the finger settles', () => {
  const h = harness();
  h.seek({ itemId: LESSON, fromMs: FROM, toMs: 20 * 60_000, source: 'scrub', commit: 'hold' });
  h.seek({ itemId: LESSON, fromMs: FROM, toMs: 10 * 60_000, source: 'scrub', commit: 'hold' });
  h.seek({ itemId: LESSON, fromMs: FROM, toMs: TO, source: 'scrub', commit: 'hold' });
  assert.equal(h.saves.length, 0);
  assert.equal(h.activeTimers, 0);
  assert.equal(h.scheduler.getPending()?.fromMs, FROM);
  assert.equal(h.scheduler.getPending()?.toMs, TO);

  h.seek({ itemId: LESSON, fromMs: FROM, toMs: TO, source: 'scrub' });
  assert.equal(h.saves.length, 0);
  assert.equal(h.activeTimers, 1);
  assert.equal(h.lastDelay, JUMP_SETTLE_MS);

  h.fireTimer();
  assert.deepEqual(h.saves, [{ itemId: LESSON, fromMs: FROM, toMs: TO }]);
  assert.equal(formatClock(h.saves[0].fromMs), '0:49');
  assert.equal(formatClock(h.saves[0].toMs), '56:30');
});

test('a hunt through several spots keeps the first origin and the last landing', () => {
  const h = harness();
  for (const toMs of [20 * 60_000, 35 * 60_000, 12 * 60_000, TO]) {
    h.advance(400);
    h.seek({ itemId: LESSON, fromMs: FROM, toMs, source: 'timeline' });
    assert.equal(h.saves.length, 0);
  }
  assert.equal(h.activeTimers, 1);
  h.fireTimer();
  assert.deepEqual(h.saves, [{ itemId: LESSON, fromMs: FROM, toMs: TO }]);
});

test('pausing saves the pending jump without waiting', () => {
  const h = harness();
  h.seek({ itemId: LESSON, fromMs: FROM, toMs: TO, source: 'timeline' });
  assert.equal(h.saves.length, 0);
  h.scheduler.flush();
  assert.deepEqual(h.saves, [{ itemId: LESSON, fromMs: FROM, toMs: TO }]);
  assert.equal(h.activeTimers, 0);
  h.fireTimer();
  assert.equal(h.saves.length, 1);
});

test('an already paused seek is written immediately', () => {
  const h = harness();
  h.seek({ itemId: LESSON, fromMs: FROM, toMs: TO, source: 'note', commit: 'now' });
  assert.deepEqual(h.saves, [{ itemId: LESSON, fromMs: FROM, toMs: TO }]);
  assert.equal(h.activeTimers, 0);
});

test('returning near the start, or moving under 10 seconds, saves nothing', () => {
  const h = harness();
  h.seek({ itemId: LESSON, fromMs: FROM, toMs: 20 * 60_000, source: 'timeline' });
  h.seek({ itemId: LESSON, fromMs: FROM, toMs: FROM + JUMP_MIN_DISTANCE_MS - 1, source: 'timeline' });
  h.scheduler.flush();
  assert.equal(h.saves.length, 0);

  h.seek({ itemId: LESSON, fromMs: FROM, toMs: FROM + 9_000, source: 'scrub' });
  h.scheduler.flush();
  assert.equal(h.saves.length, 0);

  h.seek({ itemId: LESSON, fromMs: FROM, toMs: FROM + JUMP_MIN_DISTANCE_MS, source: 'timeline' });
  h.scheduler.flush();
  assert.equal(h.saves.length, 1);
  assert.equal(h.saves[0].toMs - h.saves[0].fromMs, JUMP_MIN_DISTANCE_MS);
});

test('skip buttons do not add a row or rewrite a pending jump', () => {
  const h = harness();
  h.seek({ itemId: LESSON, fromMs: 0, toMs: 60_000, source: 'skip' });
  h.scheduler.flush();
  assert.equal(h.saves.length, 0);

  h.seek({ itemId: LESSON, fromMs: FROM, toMs: TO, source: 'scrub' });
  h.seek({ itemId: LESSON, fromMs: TO, toMs: TO + 15_000, source: 'skip' });
  h.scheduler.flush();
  assert.deepEqual(h.saves, [{ itemId: LESSON, fromMs: FROM, toMs: TO }]);
});

test('a cancelled drag does not replace a jump that was already pending', () => {
  const h = harness();
  h.seek({ itemId: LESSON, fromMs: FROM, toMs: TO, source: 'timeline' });
  h.seek({ itemId: LESSON, fromMs: TO, toMs: TO + 30_000, source: 'scrub', commit: 'hold' });
  assert.equal(h.saves.length, 0);
  assert.equal(h.activeTimers, 0);
  h.scheduler.revertDrag();
  assert.equal(h.scheduler.getPending()?.toMs, TO);
  assert.equal(h.activeTimers, 1);
  h.scheduler.flush();
  assert.deepEqual(h.saves, [{ itemId: LESSON, fromMs: FROM, toMs: TO }]);
});

test('a cancelled drag with nothing pending writes nothing', () => {
  const h = harness();
  h.seek({ itemId: LESSON, fromMs: FROM, toMs: TO, source: 'scrub', commit: 'hold' });
  h.scheduler.revertDrag();
  h.scheduler.flush();
  assert.equal(h.saves.length, 0);
  assert.equal(h.activeTimers, 0);
});

test('returning from history cancels the pending jump and adds nothing', () => {
  const h = harness();
  h.seek({ itemId: LESSON, fromMs: FROM, toMs: TO, source: 'timeline' });
  h.scheduler.cancelPending();
  h.scheduler.flush();
  h.fireTimer();
  assert.equal(h.saves.length, 0);
  assert.equal(h.scheduler.getPending(), null);

  h.seek({ itemId: LESSON, fromMs: FROM, toMs: TO, source: 'note' });
  h.seek({ itemId: LESSON, fromMs: TO, toMs: FROM, source: 'history' });
  h.scheduler.flush();
  assert.equal(h.saves.length, 0);
});

test('switching lessons flushes the previous jump and starts a new one', () => {
  const h = harness();
  h.seek({ itemId: LESSON, fromMs: FROM, toMs: TO, source: 'timeline' });
  h.seek({ itemId: 'other', fromMs: 0, toMs: 80_000, source: 'timeline' });
  assert.deepEqual(h.saves, [{ itemId: LESSON, fromMs: FROM, toMs: TO }]);
  h.scheduler.flush();
  assert.equal(h.saves[1]?.itemId, 'other');
  assert.equal(h.saves.length, 2);
});

test('a 9 hour landing keeps exact milliseconds and an hour clock', () => {
  const toMs = 9 * 3_600_000 + 12 * 60_000 + 40_000;
  const saved = commitPending({ itemId: LESSON, fromMs: FROM, toMs });
  assert.equal(saved?.fromMs, FROM);
  assert.equal(saved?.toMs, toMs);
  assert.equal(saved && saved.toMs / 1000, 9 * 3_600 + 12 * 60 + 40);
  assert.equal(formatClock(saved?.fromMs ?? 0), '0:49');
  assert.equal(formatClock(saved?.toMs ?? 0), '9:12:40');
  assert.equal(formatClock(9 * 3_600_000), '9:00:00');
});

test('only the newest 50 jumps are kept', () => {
  const newestFirst = Array.from({ length: 60 }, (_, index) => `j${59 - index}`);
  const drop = idsToDrop(newestFirst);
  assert.equal(JUMP_HISTORY_LIMIT, 50);
  assert.equal(drop.length, 10);
  assert.deepEqual(drop, newestFirst.slice(50));
  assert.equal(idsToDrop(newestFirst.slice(0, 50)).length, 0);
});

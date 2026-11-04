import assert from 'node:assert/strict';
import test from 'node:test';

import { listenedFraction } from './ranges.ts';
import { clearedLessonProgress } from './resetProgress.ts';

const lesson = {
  title: 'Morning lecture',
  bookmark: 'bookmark-1',
  positionMs: 125_000,
  speed: 1.5,
  ranges: [
    { startMs: 0, endMs: 60_000, sessionAt: 10 },
    { startMs: 90_000, endMs: 150_000, sessionAt: 20 },
  ],
  jumps: [{ id: 'jump-1', fromMs: 10_000, toMs: 80_000 }],
  notes: [
    { id: 'note-1', positionMs: 42_000, text: 'Check the proof', tags: 'review' },
    { id: 'note-2', positionMs: 99_000, text: 'Ask about this', tags: '' },
  ],
};

test('clears listened ranges, resume position, and jumps', () => {
  const cleared = clearedLessonProgress(lesson);
  assert.equal(cleared.positionMs, 0);
  assert.deepEqual(cleared.ranges, []);
  assert.deepEqual(cleared.jumps, []);
  assert.equal(Math.round(listenedFraction(cleared.ranges, 600_000) * 100), 0);
  assert.equal(Math.round(listenedFraction(lesson.ranges, 600_000) * 100) > 0, true);
});

test('leaves notes, speed, and the rest of the lesson untouched', () => {
  const cleared = clearedLessonProgress(lesson);
  assert.equal(cleared.speed, 1.5);
  assert.equal(cleared.title, 'Morning lecture');
  assert.equal(cleared.bookmark, 'bookmark-1');
  assert.equal(cleared.notes, lesson.notes);
  assert.deepEqual(cleared.notes, [
    { id: 'note-1', positionMs: 42_000, text: 'Check the proof', tags: 'review' },
    { id: 'note-2', positionMs: 99_000, text: 'Ask about this', tags: '' },
  ]);
  assert.deepEqual(lesson.ranges.length, 2);
  assert.deepEqual(lesson.jumps.length, 1);
  assert.equal(lesson.positionMs, 125_000);
});

import { insertJump } from '../db/jumps';
import { createId } from '../media/identity';
import { createJumpScheduler, type JumpDraft, type SeekInput } from './jumpRecord';

type JumpListener = (jump: JumpDraft) => void;

const listeners = new Set<JumpListener>();

function publish(jump: JumpDraft): void {
  insertJump({
    id: createId(),
    itemId: jump.itemId,
    fromMs: jump.fromMs,
    toMs: jump.toMs,
    createdAt: Date.now(),
  });
  for (const listener of listeners) {
    listener(jump);
  }
}

const scheduler = createJumpScheduler({ save: publish });

/**
 * A seek can make the player report "not playing" while it buffers.
 * Wait briefly so that blip does not split a chain of jumps. A real pause
 * stays false, and this still writes well before the settle timer.
 */
const PAUSE_CONFIRM_MS = 400;
let pauseConfirm: ReturnType<typeof setTimeout> | null = null;

function cancelPauseConfirm(): void {
  if (pauseConfirm) {
    clearTimeout(pauseConfirm);
    pauseConfirm = null;
  }
}

/** Remember a user seek. Nothing is written until the chain settles or is flushed. */
export function recordJumpSeek(input: SeekInput): void {
  cancelPauseConfirm();
  scheduler.recordSeek(input);
}

/** Write a valid pending jump now. Pause, background, and leaving the lesson call this. */
export function flushJumpHistory(): void {
  cancelPauseConfirm();
  scheduler.flush();
}

/**
 * Playback just reported paused. Confirm it stays that way before writing,
 * so a seek that only buffers does not save early.
 */
export function flushJumpHistoryIfStillPaused(): void {
  cancelPauseConfirm();
  pauseConfirm = setTimeout(() => {
    pauseConfirm = null;
    scheduler.flush();
  }, PAUSE_CONFIRM_MS);
}

/** Playback resumed. Drop a pause confirmation that has not fired. */
export function cancelPausedJumpFlush(): void {
  cancelPauseConfirm();
}

/** Drop a pending jump without writing it. Used when returning through the list. */
export function cancelPendingJump(): void {
  scheduler.cancelPending();
}

/** Drop a pending jump for this lesson so a reset is not followed by a late write. */
export function dropPendingJump(itemId: string): void {
  if (scheduler.getPending()?.itemId === itemId) {
    scheduler.cancelPending();
  }
}

/** A scrub was cancelled. Put back the jump that was pending before the finger went down. */
export function revertJumpDrag(): void {
  scheduler.revertDrag();
}

export function subscribeJumpHistory(listener: JumpListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

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

/** Remember a user seek. Nothing is written until the chain settles or is flushed. */
export function recordJumpSeek(input: SeekInput): void {
  scheduler.recordSeek(input);
}

/** Write a valid pending jump now. Pause, background, and leaving the lesson call this. */
export function flushJumpHistory(): void {
  scheduler.flush();
}

/** Drop a pending jump without writing it. Used when returning through the list. */
export function cancelPendingJump(): void {
  scheduler.cancelPending();
}

export function subscribeJumpHistory(listener: JumpListener): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

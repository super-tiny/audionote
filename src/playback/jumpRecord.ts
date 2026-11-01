export const JUMP_MIN_DISTANCE_MS = 10_000;
export const JUMP_SETTLE_MS = 1_800;
export const JUMP_HISTORY_LIMIT = 50;

/** User seeks that belong in jump history. Skip buttons and history returns do not. */
export type RecordedJumpSource = 'scrub' | 'timeline' | 'note';

export type JumpSource = RecordedJumpSource | 'skip' | 'history';

export type JumpCommit = 'defer' | 'now' | 'hold';

export type PendingJump = {
  itemId: string;
  fromMs: number;
  toMs: number;
};

export type JumpDraft = {
  itemId: string;
  fromMs: number;
  toMs: number;
};

export type JumpRecorder = {
  pending: PendingJump | null;
  armedUntil: number | null;
};

export type SeekEvent = {
  itemId: string;
  fromMs: number;
  toMs: number;
  source: JumpSource;
  now: number;
  settleMs?: number;
};

export type RecorderStep = {
  recorder: JumpRecorder;
  save: JumpDraft | null;
};

export function sourceIsRecorded(source: JumpSource): source is RecordedJumpSource {
  return source === 'scrub' || source === 'timeline' || source === 'note';
}

export function createJumpRecorder(): JumpRecorder {
  return { pending: null, armedUntil: null };
}

/**
 * Ids are newest first. Everything past the cap is safe to delete.
 */
export function idsToDrop(newestFirst: readonly string[], limit = JUMP_HISTORY_LIMIT): string[] {
  if (limit < 0) {
    return [...newestFirst];
  }
  return newestFirst.slice(limit);
}

export function commitPending(pending: PendingJump, minDistance = JUMP_MIN_DISTANCE_MS): JumpDraft | null {
  if (!Number.isFinite(pending.fromMs) || !Number.isFinite(pending.toMs)) {
    return null;
  }
  const fromMs = Math.max(0, Math.round(pending.fromMs));
  const toMs = Math.max(0, Math.round(pending.toMs));
  if (Math.abs(toMs - fromMs) < minDistance) {
    return null;
  }
  return { itemId: pending.itemId, fromMs, toMs };
}

/**
 * Fold a seek into the in-memory jump.
 * The first recorded seek in a chain sets `from`. Later ones only move `to`.
 * History returns cancel the chain. Skips leave it untouched.
 * A different lesson commits the previous chain first.
 */
export function observeSeek(recorder: JumpRecorder, event: SeekEvent): RecorderStep {
  if (event.source === 'history') {
    return { recorder: { pending: null, armedUntil: null }, save: null };
  }
  if (!sourceIsRecorded(event.source)) {
    return { recorder, save: null };
  }

  const settleMs = event.settleMs ?? JUMP_SETTLE_MS;
  let save: JumpDraft | null = null;
  let fromMs = event.fromMs;
  if (recorder.pending && recorder.pending.itemId === event.itemId) {
    fromMs = recorder.pending.fromMs;
  } else if (recorder.pending) {
    save = commitPending(recorder.pending);
  }

  return {
    recorder: {
      pending: { itemId: event.itemId, fromMs, toMs: event.toMs },
      armedUntil: event.now + settleMs,
    },
    save,
  };
}

export function flushRecorder(recorder: JumpRecorder): RecorderStep {
  const save = recorder.pending ? commitPending(recorder.pending) : null;
  return { recorder: { pending: null, armedUntil: null }, save };
}

export type SeekInput = {
  itemId: string;
  fromMs: number;
  toMs: number;
  source: JumpSource;
  /**
   * `defer` restarts the settle timer.
   * `now` writes immediately (pause, leave, already stopped).
   * `hold` remembers the drag and writes nothing until release, pause, or exit.
   */
  commit?: JumpCommit;
};

export function createJumpScheduler(deps: {
  save: (jump: JumpDraft) => void;
  now?: () => number;
  setTimer?: (callback: () => void, delayMs: number) => () => void;
  settleMs?: number;
}) {
  let recorder = createJumpRecorder();
  let cancelTimer: (() => void) | null = null;
  const now = deps.now ?? (() => Date.now());
  const settleMs = deps.settleMs ?? JUMP_SETTLE_MS;
  const setTimer =
    deps.setTimer ??
    ((callback: () => void, delayMs: number) => {
      const id = setTimeout(callback, delayMs);
      return () => clearTimeout(id);
    });

  function clearArmedTimer(): void {
    cancelTimer?.();
    cancelTimer = null;
  }

  function persist(jump: JumpDraft | null): void {
    if (jump) {
      deps.save(jump);
    }
  }

  function arm(at: number): void {
    clearArmedTimer();
    const delay = Math.max(0, at - now());
    cancelTimer = setTimer(() => {
      cancelTimer = null;
      const step = flushRecorder(recorder);
      recorder = step.recorder;
      persist(step.save);
    }, delay);
  }

  return {
    recordSeek(input: SeekInput): void {
      if (input.source === 'history') {
        clearArmedTimer();
        recorder = { pending: null, armedUntil: null };
        return;
      }
      if (!sourceIsRecorded(input.source)) {
        return;
      }

      const step = observeSeek(recorder, {
        itemId: input.itemId,
        fromMs: input.fromMs,
        toMs: input.toMs,
        source: input.source,
        now: now(),
        settleMs,
      });
      recorder = step.recorder;
      persist(step.save);

      if (input.commit === 'now') {
        clearArmedTimer();
        const flushed = flushRecorder(recorder);
        recorder = flushed.recorder;
        persist(flushed.save);
        return;
      }
      if (input.commit === 'hold') {
        clearArmedTimer();
        recorder = { pending: recorder.pending, armedUntil: null };
        return;
      }
      if (recorder.armedUntil != null) {
        arm(recorder.armedUntil);
      }
    },
    flush(): void {
      clearArmedTimer();
      const step = flushRecorder(recorder);
      recorder = step.recorder;
      persist(step.save);
    },
    cancelPending(): void {
      clearArmedTimer();
      recorder = { pending: null, armedUntil: null };
    },
    getPending(): PendingJump | null {
      return recorder.pending;
    },
  };
}

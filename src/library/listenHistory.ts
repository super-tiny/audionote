export const SHORT_MAX_MS = 60_000;
export const LONG_MIN_MS = 10 * 60_000;

/**
 * Two listens merge only when the later one started less than a minute after the
 * earlier one started. A morning pass and an evening pass stay separate.
 */
export const SEQUENTIAL_START_GAP_MS = 60_000;

/**
 * How far the next listen may miss the previous end and still be the following
 * moment. A larger gap is a skip. A larger overlap is a replay and stays its own record.
 */
export const SEQUENTIAL_JOIN_MS = 1_000;

export type DurationBand = 'short' | 'medium' | 'long';

export type PortionFilter =
  | { kind: 'all' | DurationBand }
  | { kind: 'custom'; minMs: number | null; maxMs: number | null; invalid: boolean };

export type ListenSortKey = 'start' | 'duration' | 'listened';

export type SortDirection = 'asc' | 'desc';

export type ReplaySpan = {
  startMs: number;
  endMs: number;
};

export type ListenPortion = {
  id: number;
  itemId: string;
  title: string;
  startMs: number;
  endMs: number;
  sessionAt: number;
  /** Start time of the latest raw listen folded into this record. */
  anchorAt?: number;
  /** Subspans also covered by another listen of the same lesson. */
  replays?: readonly ReplaySpan[];
};

export const DURATION_FILTERS = [
  { kind: 'all', label: 'All', hint: 'Sequential passes that start within a minute are one portion' },
  { kind: 'short', label: 'Short', hint: 'Under 1 minute' },
  { kind: 'medium', label: 'Medium', hint: 'From 1 minute to under 10 minutes' },
  { kind: 'long', label: 'Long', hint: '10 minutes or longer' },
  { kind: 'custom', label: 'Custom', hint: 'Minutes. Leave a field blank for no limit.' },
] as const;

export function portionDurationMs(portion: Pick<ListenPortion, 'startMs' | 'endMs'>): number {
  return Math.max(0, portion.endMs - portion.startMs);
}

export function durationBand(durationMs: number): DurationBand {
  if (durationMs < SHORT_MAX_MS) {
    return 'short';
  }
  if (durationMs < LONG_MIN_MS) {
    return 'medium';
  }
  return 'long';
}

/** Blank is no bound. Anything other than a non-negative number is invalid. */
export function parseMinutes(text: string): { ms: number | null; invalid: boolean } {
  const trimmed = text.trim();
  if (!trimmed) {
    return { ms: null, invalid: false };
  }
  if (!/^\d+(\.\d+)?$/.test(trimmed)) {
    return { ms: null, invalid: true };
  }
  const minutes = Number(trimmed);
  if (!Number.isFinite(minutes)) {
    return { ms: null, invalid: true };
  }
  return { ms: Math.round(minutes * 60_000), invalid: false };
}

export function filterProblem(filter: PortionFilter): string | null {
  if (filter.kind !== 'custom') {
    return null;
  }
  if (filter.invalid) {
    return 'Use minutes, such as 1.5.';
  }
  if (filter.minMs != null && filter.maxMs != null && filter.minMs > filter.maxMs) {
    return 'Minimum is longer than maximum.';
  }
  return null;
}

export function portionMatches(durationMs: number, filter: PortionFilter): boolean {
  if (filter.kind === 'all') {
    return true;
  }
  if (filter.kind === 'short') {
    return durationMs < SHORT_MAX_MS;
  }
  if (filter.kind === 'medium') {
    return durationMs >= SHORT_MAX_MS && durationMs < LONG_MIN_MS;
  }
  if (filter.kind === 'long') {
    return durationMs >= LONG_MIN_MS;
  }
  if (filter.kind !== 'custom') {
    return false;
  }
  if (filter.invalid) {
    return false;
  }
  if (filter.minMs != null && filter.maxMs != null && filter.minMs > filter.maxMs) {
    return false;
  }
  if (filter.minMs != null && durationMs < filter.minMs) {
    return false;
  }
  if (filter.maxMs != null && durationMs > filter.maxMs) {
    return false;
  }
  return true;
}

function comparePortions(left: ListenPortion, right: ListenPortion, key: ListenSortKey): number {
  if (key === 'duration') {
    return portionDurationMs(left) - portionDurationMs(right);
  }
  if (key === 'listened') {
    return left.sessionAt - right.sessionAt;
  }
  return left.startMs - right.startMs;
}

export function sortPortions(
  portions: readonly ListenPortion[],
  key: ListenSortKey,
  direction: SortDirection,
): ListenPortion[] {
  const factor = direction === 'asc' ? 1 : -1;
  return [...portions].sort((left, right) => {
    const primary = comparePortions(left, right, key);
    if (primary !== 0) {
      return primary * factor;
    }
    const started = left.startMs - right.startMs;
    if (started !== 0) {
      return started;
    }
    return left.id - right.id;
  });
}

export function selectPortions(
  portions: readonly ListenPortion[],
  filter: PortionFilter,
  key: ListenSortKey,
  direction: SortDirection,
): ListenPortion[] {
  return sortPortions(
    aggregateSequentialPortions(portions).filter((portion) => portionMatches(portionDurationMs(portion), filter)),
    key,
    direction,
  );
}

/**
 * The later listen picks up where the earlier one ended, and it started less than
 * a minute after that earlier listen started. Replays and skipped gaps do not qualify.
 */
export function isSequentialContinuation(
  previousEndMs: number,
  previousStartedAt: number,
  next: Pick<ListenPortion, 'startMs' | 'endMs' | 'sessionAt'>,
): boolean {
  const gap = next.sessionAt - previousStartedAt;
  if (gap < 0 || gap >= SEQUENTIAL_START_GAP_MS) {
    return false;
  }
  const join = next.startMs - previousEndMs;
  if (join < -SEQUENTIAL_JOIN_MS || join > SEQUENTIAL_JOIN_MS) {
    return false;
  }
  return next.endMs > previousEndMs;
}

type Draft = {
  portion: ListenPortion;
  /** Start time of the latest raw listen folded into this record. */
  anchorAt: number;
};

function mergeSequentialGroup(group: readonly ListenPortion[]): ListenPortion[] {
  const ordered = [...group].sort((left, right) => left.sessionAt - right.sessionAt || left.id - right.id);
  const drafts: Draft[] = [];
  // Drafts are visited in session order and an anchor only moves forward, so a
  // draft whose latest piece is already a minute behind can never join a later one.
  const active: Draft[] = [];
  for (const next of ordered) {
    const cutoff = next.sessionAt - SEQUENTIAL_START_GAP_MS;
    let keep = 0;
    for (const candidate of active) {
      if (candidate.anchorAt > cutoff) {
        active[keep] = candidate;
        keep += 1;
      }
    }
    active.length = keep;

    let host: Draft | null = null;
    for (const candidate of active) {
      if (!isSequentialContinuation(candidate.portion.endMs, candidate.anchorAt, next)) {
        continue;
      }
      if (!host || candidate.anchorAt >= host.anchorAt) {
        host = candidate;
      }
    }
    if (!host) {
      const draft: Draft = {
        portion: {
          id: next.id,
          itemId: next.itemId,
          title: next.title,
          startMs: next.startMs,
          endMs: next.endMs,
          sessionAt: next.sessionAt,
          anchorAt: next.sessionAt,
        },
        anchorAt: next.sessionAt,
      };
      drafts.push(draft);
      active.push(draft);
      continue;
    }
    host.anchorAt = next.sessionAt;
    host.portion = {
      ...host.portion,
      startMs: Math.min(host.portion.startMs, next.startMs),
      endMs: Math.max(host.portion.endMs, next.endMs),
      anchorAt: next.sessionAt,
    };
  }
  return drafts.map((draft) => draft.portion);
}

/**
 * Regions heard more than once. Ranges that only touch at an endpoint do not count.
 */
export function repeatedSections(ranges: readonly ReplaySpan[]): ReplaySpan[] {
  const events: { at: number; delta: number }[] = [];
  for (const range of ranges) {
    if (!(range.endMs > range.startMs)) {
      continue;
    }
    events.push({ at: range.startMs, delta: 1 });
    events.push({ at: range.endMs, delta: -1 });
  }
  events.sort((left, right) => left.at - right.at || left.delta - right.delta);
  const spans: ReplaySpan[] = [];
  let depth = 0;
  let openedAt: number | null = null;
  for (const event of events) {
    const nextDepth = depth + event.delta;
    if (depth < 2 && nextDepth >= 2) {
      openedAt = event.at;
    } else if (depth >= 2 && nextDepth < 2 && openedAt != null && event.at > openedAt) {
      const last = spans[spans.length - 1];
      if (last && last.endMs >= openedAt) {
        last.endMs = Math.max(last.endMs, event.at);
      } else {
        spans.push({ startMs: openedAt, endMs: event.at });
      }
      openedAt = null;
    }
    depth = nextDepth;
  }
  return spans;
}

export type ContinuationRow = {
  id: number;
  startMs: number;
  endMs: number;
  anchorAt: number;
};

/** Latest stored listen that this one continues, if the two starts are under a minute apart. */
export function pickContinuation(
  rows: readonly ContinuationRow[],
  next: Pick<ListenPortion, 'startMs' | 'endMs' | 'sessionAt'>,
): ContinuationRow | null {
  const cutoff = next.sessionAt - SEQUENTIAL_START_GAP_MS;
  let host: ContinuationRow | null = null;
  for (const row of rows) {
    if (row.anchorAt <= cutoff || row.anchorAt > next.sessionAt) {
      continue;
    }
    if (!isSequentialContinuation(row.endMs, row.anchorAt, next)) {
      continue;
    }
    if (!host || row.anchorAt >= host.anchorAt) {
      host = row;
    }
  }
  return host;
}

export function clipReplaySpans(portion: ReplaySpan, spans: readonly ReplaySpan[]): ReplaySpan[] {
  const hits: ReplaySpan[] = [];
  for (const span of spans) {
    if (span.startMs >= portion.endMs) {
      break;
    }
    if (span.endMs <= portion.startMs) {
      continue;
    }
    const startMs = Math.max(portion.startMs, span.startMs);
    const endMs = Math.min(portion.endMs, span.endMs);
    if (endMs > startMs) {
      hits.push({ startMs, endMs });
    }
  }
  return hits;
}

/**
 * Collapse listens that follow each other within a minute into one record.
 * A later listen that covers the same audio again stays, and the shared span is marked.
 * Comparison uses each hop's own start time, so a chain of short pauses can merge
 * even when the first and last starts are more than a minute apart.
 */
export function aggregateSequentialPortions(portions: readonly ListenPortion[]): ListenPortion[] {
  const groups = new Map<string, ListenPortion[]>();
  for (const portion of portions) {
    const group = groups.get(portion.itemId);
    if (group) {
      group.push(portion);
    } else {
      groups.set(portion.itemId, [portion]);
    }
  }
  const aggregated: ListenPortion[] = [];
  const spansByItem = new Map<string, ReplaySpan[]>();
  for (const [itemId, group] of groups) {
    const merged = mergeSequentialGroup(group);
    aggregated.push(...merged);
    spansByItem.set(itemId, repeatedSections(merged));
  }
  for (const portion of aggregated) {
    portion.replays = clipReplaySpans(portion, spansByItem.get(portion.itemId) ?? []);
  }
  return aggregated;
}

/** Important sections for one lesson: audio that was played again, after sequential passes are combined. */
export function importantSections(
  ranges: readonly { startMs: number; endMs: number; sessionAt: number }[],
): ReplaySpan[] {
  return repeatedSections(
    mergeSequentialGroup(
      ranges.map((range, index) => ({
        id: index,
        itemId: 'lesson',
        title: '',
        startMs: range.startMs,
        endMs: range.endMs,
        sessionAt: range.sessionAt,
      })),
    ),
  );
}

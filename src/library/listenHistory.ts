export const SHORT_MAX_MS = 60_000;
export const LONG_MIN_MS = 10 * 60_000;

export type DurationBand = 'short' | 'medium' | 'long';

export type PortionFilter =
  | { kind: 'all' | DurationBand }
  | { kind: 'custom'; minMs: number | null; maxMs: number | null; invalid: boolean };

export type ListenSortKey = 'start' | 'duration' | 'listened';

export type SortDirection = 'asc' | 'desc';

export type ListenPortion = {
  id: number;
  itemId: string;
  title: string;
  startMs: number;
  endMs: number;
  sessionAt: number;
};

export const DURATION_FILTERS = [
  { kind: 'all', label: 'All', hint: 'Every recorded portion' },
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
    portions.filter((portion) => portionMatches(portionDurationMs(portion), filter)),
    key,
    direction,
  );
}

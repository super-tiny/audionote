import {
  clipReplaySpans,
  pickContinuation,
  repeatedSections,
  SEQUENTIAL_START_GAP_MS,
  type ListenPortion,
  type ReplaySpan,
} from '../library/listenHistory';
import { likePattern } from '../library/search';
import { AUDIO_SELECT, mapAudioItem, type AudioItem, type Note, type StoredRange } from './types';
import { getDatabase } from './open';

type CachedRanges = {
  ids: number[];
  rows: StoredRange[];
};

const rangeCache = new Map<string, CachedRanges>();
const markCache = new Map<string, ReplaySpan[]>();
const markListeners = new Set<(itemId: string) => void>();

function dropRangeCache(itemId: string): void {
  rangeCache.delete(itemId);
}

function notifyMarks(itemId: string): void {
  for (const listener of markListeners) {
    listener(itemId);
  }
}

export function subscribeListenMarks(listener: (itemId: string) => void): () => void {
  markListeners.add(listener);
  return () => {
    markListeners.delete(listener);
  };
}

const ITEM_COLUMNS = `
  audio_item.id,
  audio_item.uri,
  audio_item.bookmark,
  audio_item.fingerprint,
  audio_item.title,
  audio_item.duration_ms,
  audio_item.artwork,
  audio_item.format,
  audio_item.missing,
  audio_item.created_at,
  playback_state.position_ms,
  playback_state.speed,
  playback_state.updated_at
`;

export function listItems(query: string): AudioItem[] {
  const db = getDatabase();
  const trimmed = query.trim();
  const rows = trimmed
    ? db.getAllSync<Parameters<typeof mapAudioItem>[0]>(
        `${AUDIO_SELECT}
         WHERE audio_item.title LIKE ? ESCAPE '\\' COLLATE NOCASE
         ORDER BY audio_item.created_at DESC`,
        likePattern(trimmed),
      )
    : db.getAllSync<Parameters<typeof mapAudioItem>[0]>(
        `${AUDIO_SELECT} ORDER BY audio_item.created_at DESC`,
      );
  return rows.map(mapAudioItem);
}

export function continueListening(limit = 8): AudioItem[] {
  const rows = getDatabase().getAllSync<Parameters<typeof mapAudioItem>[0]>(
    `SELECT ${ITEM_COLUMNS}
     FROM audio_item
     JOIN playback_state ON playback_state.item_id = audio_item.id
     WHERE audio_item.missing = 0
       AND playback_state.position_ms > 1000
       AND (
         audio_item.duration_ms IS NULL
         OR playback_state.position_ms < audio_item.duration_ms - 3000
       )
     ORDER BY playback_state.updated_at DESC
     LIMIT ?`,
    limit,
  );
  return rows.map(mapAudioItem);
}

export function getItem(id: string): AudioItem | null {
  const row = getDatabase().getFirstSync<Parameters<typeof mapAudioItem>[0]>(
    `${AUDIO_SELECT} WHERE audio_item.id = ?`,
    id,
  );
  return row ? mapAudioItem(row) : null;
}

export function findByFingerprint(fingerprint: string): AudioItem | null {
  const row = getDatabase().getFirstSync<Parameters<typeof mapAudioItem>[0]>(
    `${AUDIO_SELECT} WHERE audio_item.fingerprint = ?`,
    fingerprint,
  );
  return row ? mapAudioItem(row) : null;
}

export type NewAudio = {
  id: string;
  uri: string;
  bookmark: string | null;
  fingerprint: string;
  title: string;
  format: string;
};

export function insertAudio(item: NewAudio, now = Date.now()): void {
  getDatabase().runSync(
    `INSERT INTO audio_item (
      id, uri, bookmark, fingerprint, title, duration_ms, artwork, format, missing, created_at
    ) VALUES (?, ?, ?, ?, ?, NULL, NULL, ?, 0, ?)`,
    item.id,
    item.uri,
    item.bookmark,
    item.fingerprint,
    item.title,
    item.format,
    now,
  );
}

export function updateAccess(id: string, uri: string, bookmark: string | null): void {
  getDatabase().runSync(
    'UPDATE audio_item SET uri = ?, bookmark = ?, missing = 0 WHERE id = ?',
    uri,
    bookmark,
    id,
  );
}

export function markMissing(id: string, missing: boolean): void {
  getDatabase().runSync('UPDATE audio_item SET missing = ? WHERE id = ?', missing ? 1 : 0, id);
}

export function updateDuration(id: string, durationMs: number, format: string): void {
  getDatabase().runSync(
    'UPDATE audio_item SET duration_ms = ?, format = ? WHERE id = ?',
    durationMs,
    format,
    id,
  );
}

export function setDurationMs(id: string, durationMs: number): void {
  getDatabase().runSync('UPDATE audio_item SET duration_ms = ? WHERE id = ?', Math.round(durationMs), id);
}

/**
 * Clears listened ranges, resume position, and jump history for one lesson.
 * Speed stays. Notes, the audio row, and settings are not written.
 */
export function resetStoredProgress(itemId: string, now = Date.now()): void {
  const db = getDatabase();
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM listen_range WHERE item_id = ?', itemId);
    db.runSync('DELETE FROM listen_mark WHERE item_id = ?', itemId);
    db.runSync('DELETE FROM jump WHERE item_id = ?', itemId);
    db.runSync('UPDATE playback_state SET position_ms = 0, updated_at = ? WHERE item_id = ?', now, itemId);
  });
  dropRangeCache(itemId);
  markCache.set(itemId, []);
  notifyMarks(itemId);
}

export function savePlayback(id: string, positionMs: number, speed: number, now = Date.now()): void {
  getDatabase().runSync(
    `INSERT INTO playback_state (item_id, position_ms, speed, updated_at)
     VALUES (?, ?, ?, ?)
     ON CONFLICT(item_id) DO UPDATE SET
       position_ms = excluded.position_ms,
       speed = excluded.speed,
       updated_at = excluded.updated_at`,
    id,
    Math.max(0, Math.round(positionMs)),
    speed,
    now,
  );
}

/**
 * Inserts a listen, or extends the stored row it continues.
 * Sequential passes become one row here, so reads do not merge them again.
 * Returns the row that now holds this pass.
 */
export function saveListenRange(itemId: string, startMs: number, endMs: number, sessionAt: number): number {
  const start = Math.round(startMs);
  const end = Math.round(endMs);
  const db = getDatabase();
  const candidates = db.getAllSync<{ id: number; start_ms: number; end_ms: number; anchor_at: number }>(
    `SELECT id, start_ms, end_ms, anchor_at
     FROM listen_range
     WHERE item_id = ? AND anchor_at > ? AND anchor_at <= ?`,
    itemId,
    sessionAt - SEQUENTIAL_START_GAP_MS,
    sessionAt,
  );
  const host = pickContinuation(
    candidates.map((row) => ({
      id: row.id,
      startMs: row.start_ms,
      endMs: row.end_ms,
      anchorAt: row.anchor_at,
    })),
    { startMs: start, endMs: end, sessionAt },
  );
  if (host) {
    db.runSync(
      'UPDATE listen_range SET start_ms = MIN(start_ms, ?), end_ms = ?, anchor_at = ? WHERE id = ?',
      start,
      Math.max(host.endMs, end),
      sessionAt,
      host.id,
    );
    dropRangeCache(itemId);
    return host.id;
  }
  const result = db.runSync(
    'INSERT INTO listen_range (item_id, start_ms, end_ms, session_at, anchor_at) VALUES (?, ?, ?, ?, ?)',
    itemId,
    start,
    end,
    sessionAt,
    sessionAt,
  );
  dropRangeCache(itemId);
  return Number(result.lastInsertRowId);
}

export function updateListenRangeEnd(id: number, endMs: number, itemId: string): void {
  const end = Math.round(endMs);
  getDatabase().runSync('UPDATE listen_range SET end_ms = ? WHERE id = ?', end, id);
  const cached = rangeCache.get(itemId);
  if (!cached) {
    return;
  }
  const index = cached.ids.indexOf(id);
  if (index < 0) {
    dropRangeCache(itemId);
    return;
  }
  const current = cached.rows[index];
  if (!current || current.endMs === end) {
    return;
  }
  const rows = cached.rows.slice();
  rows[index] = { ...current, endMs };
  rangeCache.set(itemId, { ids: cached.ids, rows });
}

function loadRanges(itemId: string): CachedRanges {
  const cached = rangeCache.get(itemId);
  if (cached) {
    return cached;
  }
  const rows = getDatabase().getAllSync<{ id: number; start_ms: number; end_ms: number; session_at: number }>(
    'SELECT id, start_ms, end_ms, session_at FROM listen_range WHERE item_id = ? ORDER BY start_ms, id',
    itemId,
  );
  const loaded: CachedRanges = {
    ids: rows.map((row) => row.id),
    rows: rows.map((row) => ({ startMs: row.start_ms, endMs: row.end_ms, sessionAt: row.session_at })),
  };
  rangeCache.set(itemId, loaded);
  return loaded;
}

export function rangesForItem(itemId: string): StoredRange[] {
  return loadRanges(itemId).rows;
}

/** How far this row can grow before the saved important spans need a full rebuild. */
export function rangeGrowthBounds(
  itemId: string,
  rowId: number,
  startMs: number,
  endMs: number,
): { overlapCapMs: number | null; nextRangeStartMs: number } {
  const cached = loadRanges(itemId);
  let overlapCapMs: number | null = null;
  let nextRangeStartMs = Number.POSITIVE_INFINITY;
  for (let index = 0; index < cached.ids.length; index += 1) {
    if (cached.ids[index] === rowId) {
      continue;
    }
    const range = cached.rows[index];
    if (!range) {
      continue;
    }
    if (range.endMs > startMs && range.startMs < endMs) {
      overlapCapMs = overlapCapMs == null ? range.endMs : Math.max(overlapCapMs, range.endMs);
    } else if (range.startMs >= endMs && range.startMs < nextRangeStartMs) {
      nextRangeStartMs = range.startMs;
    }
  }
  return { overlapCapMs, nextRangeStartMs };
}

export function marksForItem(itemId: string): ReplaySpan[] {
  const cached = markCache.get(itemId);
  if (cached) {
    return cached;
  }
  const spans = getDatabase()
    .getAllSync<{ start_ms: number; end_ms: number }>(
      'SELECT start_ms, end_ms FROM listen_mark WHERE item_id = ? ORDER BY start_ms, end_ms',
      itemId,
    )
    .map((row) => ({ startMs: row.start_ms, endMs: row.end_ms }));
  markCache.set(itemId, spans);
  return spans;
}

/** Rewrites important spans from the stored rows. Call when a row is added, closed, or crosses another row. */
export function syncListenMarks(itemId: string): void {
  const spans = repeatedSections(rangesForItem(itemId));
  const db = getDatabase();
  db.withTransactionSync(() => {
    db.runSync('DELETE FROM listen_mark WHERE item_id = ?', itemId);
    for (const span of spans) {
      db.runSync(
        'INSERT INTO listen_mark (item_id, start_ms, end_ms) VALUES (?, ?, ?)',
        itemId,
        span.startMs,
        span.endMs,
      );
    }
  });
  markCache.set(itemId, spans);
  notifyMarks(itemId);
}

/** Extends important spans that currently end where this replay ended, without resorting every range. */
export function extendListenMarks(itemId: string, fromEndMs: number, toEndMs: number): void {
  if (toEndMs <= fromEndMs) {
    return;
  }
  const result = getDatabase().runSync(
    'UPDATE listen_mark SET end_ms = ? WHERE item_id = ? AND end_ms = ? AND start_ms < ?',
    toEndMs,
    itemId,
    fromEndMs,
    toEndMs,
  );
  const cached = markCache.get(itemId);
  if (!cached) {
    if (result.changes > 0) {
      notifyMarks(itemId);
    }
    return;
  }
  let changed = false;
  const next = cached.map((span) => {
    if (span.endMs === fromEndMs && span.startMs < toEndMs) {
      changed = true;
      return { startMs: span.startMs, endMs: toEndMs };
    }
    return span;
  });
  if (!changed && result.changes === 0) {
    return;
  }
  markCache.set(itemId, changed ? next : cached);
  notifyMarks(itemId);
}

export function listListenHistory(itemId: string | null): ListenPortion[] {
  const sql = itemId
    ? `SELECT listen_range.id AS id,
              listen_range.item_id AS item_id,
              audio_item.title AS title,
              listen_range.start_ms AS start_ms,
              listen_range.end_ms AS end_ms,
              listen_range.session_at AS session_at
       FROM listen_range
       JOIN audio_item ON audio_item.id = listen_range.item_id
       WHERE listen_range.item_id = ?
       ORDER BY listen_range.start_ms ASC, listen_range.id ASC`
    : `SELECT listen_range.id AS id,
              listen_range.item_id AS item_id,
              audio_item.title AS title,
              listen_range.start_ms AS start_ms,
              listen_range.end_ms AS end_ms,
              listen_range.session_at AS session_at
       FROM listen_range
       JOIN audio_item ON audio_item.id = listen_range.item_id
       ORDER BY listen_range.start_ms ASC, listen_range.id ASC`;
  const rows = itemId
    ? getDatabase().getAllSync<ListenHistoryRow>(sql, itemId)
    : getDatabase().getAllSync<ListenHistoryRow>(sql);
  const portions = rows.map((row) => ({
    id: row.id,
    itemId: row.item_id,
    title: row.title,
    startMs: row.start_ms,
    endMs: row.end_ms,
    sessionAt: row.session_at,
  }));
  const marks = loadMarks(itemId, portions);
  return portions.map((portion) => ({
    ...portion,
    replays: clipReplaySpans(portion, marks.get(portion.itemId) ?? []),
  }));
}

function loadMarks(itemId: string | null, portions: readonly ListenPortion[]): Map<string, ReplaySpan[]> {
  if (itemId) {
    return new Map([[itemId, marksForItem(itemId)]]);
  }
  const itemIds = new Set(portions.map((portion) => portion.itemId));
  const marks = new Map<string, ReplaySpan[]>();
  let missing = false;
  for (const id of itemIds) {
    const cached = markCache.get(id);
    if (!cached) {
      missing = true;
      break;
    }
    marks.set(id, cached);
  }
  if (!missing) {
    return marks;
  }
  const loaded = new Map<string, ReplaySpan[]>();
  for (const id of itemIds) {
    loaded.set(id, []);
  }
  const rows = getDatabase().getAllSync<{ item_id: string; start_ms: number; end_ms: number }>(
    'SELECT item_id, start_ms, end_ms FROM listen_mark ORDER BY item_id, start_ms, end_ms',
  );
  for (const row of rows) {
    const spans = loaded.get(row.item_id);
    if (!spans) {
      continue;
    }
    spans.push({ startMs: row.start_ms, endMs: row.end_ms });
  }
  for (const [id, spans] of loaded) {
    markCache.set(id, spans);
  }
  return loaded;
}

type ListenHistoryRow = {
  id: number;
  item_id: string;
  title: string;
  start_ms: number;
  end_ms: number;
  session_at: number;
};

export function rangesSince(sessionAt: number): StoredRange[] {
  return getDatabase().getAllSync<{ start_ms: number; end_ms: number; session_at: number }>(
    'SELECT start_ms, end_ms, session_at FROM listen_range WHERE session_at >= ?',
    sessionAt,
  ).map((row) => ({ startMs: row.start_ms, endMs: row.end_ms, sessionAt: row.session_at }));
}

export function listNotes(itemId: string): Note[] {
  return getDatabase().getAllSync<{
    id: string;
    item_id: string;
    position_ms: number;
    text: string;
    tags: string;
    created_at: number;
  }>(
    'SELECT id, item_id, position_ms, text, tags, created_at FROM note WHERE item_id = ? ORDER BY position_ms, created_at',
    itemId,
  ).map((row) => ({
    id: row.id,
    itemId: row.item_id,
    positionMs: row.position_ms,
    text: row.text,
    tags: row.tags,
    createdAt: row.created_at,
  }));
}

export function insertNote(note: Note): void {
  getDatabase().runSync(
    'INSERT INTO note (id, item_id, position_ms, text, tags, created_at) VALUES (?, ?, ?, ?, ?, ?)',
    note.id,
    note.itemId,
    note.positionMs,
    note.text,
    note.tags,
    note.createdAt,
  );
}

export function deleteItem(id: string): void {
  getDatabase().runSync('DELETE FROM audio_item WHERE id = ?', id);
}

export function deleteNote(id: string): void {
  getDatabase().runSync('DELETE FROM note WHERE id = ?', id);
}

export function getSetting(key: string): string | null {
  const row = getDatabase().getFirstSync<{ value: string }>('SELECT value FROM setting WHERE key = ?', key);
  return row?.value ?? null;
}

export function setSetting(key: string, value: string): void {
  getDatabase().runSync(
    `INSERT INTO setting (key, value) VALUES (?, ?)
     ON CONFLICT(key) DO UPDATE SET value = excluded.value`,
    key,
    value,
  );
}

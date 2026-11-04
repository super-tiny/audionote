import type { ListenPortion } from '../library/listenHistory';
import { likePattern } from '../library/search';
import { AUDIO_SELECT, mapAudioItem, type AudioItem, type Note, type StoredRange } from './types';
import { getDatabase } from './open';

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

export function insertListenRange(itemId: string, startMs: number, endMs: number, sessionAt: number): number {
  const result = getDatabase().runSync(
    'INSERT INTO listen_range (item_id, start_ms, end_ms, session_at) VALUES (?, ?, ?, ?)',
    itemId,
    Math.round(startMs),
    Math.round(endMs),
    sessionAt,
  );
  return Number(result.lastInsertRowId);
}

export function updateListenRangeEnd(id: number, endMs: number): void {
  getDatabase().runSync('UPDATE listen_range SET end_ms = ? WHERE id = ?', Math.round(endMs), id);
}

export function rangesForItem(itemId: string): StoredRange[] {
  return getDatabase().getAllSync<{ start_ms: number; end_ms: number; session_at: number }>(
    'SELECT start_ms, end_ms, session_at FROM listen_range WHERE item_id = ? ORDER BY start_ms',
    itemId,
  ).map((row) => ({ startMs: row.start_ms, endMs: row.end_ms, sessionAt: row.session_at }));
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
  return rows.map((row) => ({
    id: row.id,
    itemId: row.item_id,
    title: row.title,
    startMs: row.start_ms,
    endMs: row.end_ms,
    sessionAt: row.session_at,
  }));
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

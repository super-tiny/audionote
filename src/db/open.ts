import * as SQLite from 'expo-sqlite';

import { aggregateSequentialPortions, repeatedSections } from '../library/listenHistory';

const SCHEMA = `
PRAGMA foreign_keys = ON;

CREATE TABLE IF NOT EXISTS audio_item (
  id TEXT PRIMARY KEY,
  uri TEXT NOT NULL,
  bookmark TEXT,
  fingerprint TEXT NOT NULL,
  title TEXT NOT NULL,
  duration_ms INTEGER,
  artwork TEXT,
  format TEXT,
  missing INTEGER NOT NULL DEFAULT 0,
  created_at INTEGER NOT NULL
);

CREATE UNIQUE INDEX IF NOT EXISTS audio_item_fingerprint ON audio_item(fingerprint);
CREATE INDEX IF NOT EXISTS audio_item_title ON audio_item(title);

CREATE TABLE IF NOT EXISTS playback_state (
  item_id TEXT PRIMARY KEY REFERENCES audio_item(id) ON DELETE CASCADE,
  position_ms INTEGER NOT NULL,
  speed REAL NOT NULL,
  updated_at INTEGER NOT NULL
);

CREATE TABLE IF NOT EXISTS listen_range (
  id INTEGER PRIMARY KEY AUTOINCREMENT,
  item_id TEXT NOT NULL REFERENCES audio_item(id) ON DELETE CASCADE,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL,
  session_at INTEGER NOT NULL,
  anchor_at INTEGER NOT NULL DEFAULT 0
);

CREATE INDEX IF NOT EXISTS listen_range_item ON listen_range(item_id, start_ms);
CREATE INDEX IF NOT EXISTS listen_range_session ON listen_range(session_at);

CREATE TABLE IF NOT EXISTS listen_mark (
  item_id TEXT NOT NULL REFERENCES audio_item(id) ON DELETE CASCADE,
  start_ms INTEGER NOT NULL,
  end_ms INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS listen_mark_item ON listen_mark(item_id, start_ms);

CREATE TABLE IF NOT EXISTS note (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES audio_item(id) ON DELETE CASCADE,
  position_ms INTEGER NOT NULL,
  text TEXT NOT NULL,
  tags TEXT NOT NULL DEFAULT '',
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS note_item_position ON note(item_id, position_ms);

CREATE TABLE IF NOT EXISTS jump (
  id TEXT PRIMARY KEY,
  item_id TEXT NOT NULL REFERENCES audio_item(id) ON DELETE CASCADE,
  from_ms INTEGER NOT NULL,
  to_ms INTEGER NOT NULL,
  created_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS jump_item_created ON jump(item_id, created_at);

CREATE TABLE IF NOT EXISTS setting (
  key TEXT PRIMARY KEY,
  value TEXT NOT NULL
);

CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);
`;

let database: SQLite.SQLiteDatabase | null = null;

const SCHEMA_VERSION = 4;

function migrateListenRanges(db: SQLite.SQLiteDatabase): void {
  const columns = db.getAllSync<{ name: string }>('PRAGMA table_info(listen_range)');
  if (!columns.some((column) => column.name === 'anchor_at')) {
    db.execSync('ALTER TABLE listen_range ADD COLUMN anchor_at INTEGER');
  }
  db.execSync('UPDATE listen_range SET anchor_at = session_at WHERE anchor_at IS NULL');
  db.execSync(`
    CREATE TABLE IF NOT EXISTS listen_mark (
      item_id TEXT NOT NULL REFERENCES audio_item(id) ON DELETE CASCADE,
      start_ms INTEGER NOT NULL,
      end_ms INTEGER NOT NULL
    )
  `);
  db.execSync('CREATE INDEX IF NOT EXISTS listen_mark_item ON listen_mark(item_id, start_ms)');
  db.execSync('CREATE INDEX IF NOT EXISTS listen_range_anchor ON listen_range(item_id, anchor_at)');

  const items = db.getAllSync<{ item_id: string }>('SELECT DISTINCT item_id AS item_id FROM listen_range');
  db.withTransactionSync(() => {
    for (const item of items) {
      const rows = db.getAllSync<{
        id: number;
        start_ms: number;
        end_ms: number;
        session_at: number;
      }>('SELECT id, start_ms, end_ms, session_at FROM listen_range WHERE item_id = ?', item.item_id);
      const merged = aggregateSequentialPortions(
        rows.map((row) => ({
          id: row.id,
          itemId: item.item_id,
          title: '',
          startMs: row.start_ms,
          endMs: row.end_ms,
          sessionAt: row.session_at,
        })),
      );
      const marks = repeatedSections(merged);
      db.runSync('DELETE FROM listen_range WHERE item_id = ?', item.item_id);
      for (const portion of merged) {
        db.runSync(
          'INSERT INTO listen_range (item_id, start_ms, end_ms, session_at, anchor_at) VALUES (?, ?, ?, ?, ?)',
          item.item_id,
          portion.startMs,
          portion.endMs,
          portion.sessionAt,
          portion.anchorAt ?? portion.sessionAt,
        );
      }
      db.runSync('DELETE FROM listen_mark WHERE item_id = ?', item.item_id);
      for (const mark of marks) {
        db.runSync(
          'INSERT INTO listen_mark (item_id, start_ms, end_ms) VALUES (?, ?, ?)',
          item.item_id,
          mark.startMs,
          mark.endMs,
        );
      }
    }
  });
}

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!database) {
    database = SQLite.openDatabaseSync('audionote.db');
    database.execSync(SCHEMA);
    const current = database.getFirstSync<{ version: number }>('SELECT version FROM schema_version LIMIT 1');
    if (!current) {
      database.runSync('INSERT INTO schema_version (version) VALUES (?)', SCHEMA_VERSION);
    } else if (current.version < SCHEMA_VERSION) {
      migrateListenRanges(database);
      database.runSync('UPDATE schema_version SET version = ?', SCHEMA_VERSION);
    }
    database.execSync('CREATE INDEX IF NOT EXISTS listen_range_anchor ON listen_range(item_id, anchor_at)');
  }
  return database;
}

export function ensureDatabase(): void {
  getDatabase();
}

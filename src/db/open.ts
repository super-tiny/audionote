import * as SQLite from 'expo-sqlite';

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
  session_at INTEGER NOT NULL
);

CREATE INDEX IF NOT EXISTS listen_range_item ON listen_range(item_id, start_ms);
CREATE INDEX IF NOT EXISTS listen_range_session ON listen_range(session_at);

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

export function getDatabase(): SQLite.SQLiteDatabase {
  if (!database) {
    database = SQLite.openDatabaseSync('audionote.db');
    database.execSync(SCHEMA);
    const current = database.getFirstSync<{ version: number }>('SELECT version FROM schema_version LIMIT 1');
    if (!current) {
      database.runSync('INSERT INTO schema_version (version) VALUES (3)');
    } else if (current.version < 3) {
      database.runSync('UPDATE schema_version SET version = 3');
    }
  }
  return database;
}

export function ensureDatabase(): void {
  getDatabase();
}

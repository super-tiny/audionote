import * as SQLite from 'expo-sqlite';

const SCHEMA = `
CREATE TABLE IF NOT EXISTS schema_version (
  version INTEGER NOT NULL
);
INSERT INTO schema_version (version)
SELECT 1
WHERE NOT EXISTS (SELECT 1 FROM schema_version);
`;

export function ensureDatabase(): void {
  const db = SQLite.openDatabaseSync('audionote.db');
  db.execSync(SCHEMA);
}

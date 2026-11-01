import { idsToDrop, JUMP_HISTORY_LIMIT } from '../playback/jumpRecord';
import type { Jump } from './types';
import { getDatabase } from './open';

type JumpRow = {
  id: string;
  item_id: string;
  from_ms: number;
  to_ms: number;
  created_at: number;
};

function mapJump(row: JumpRow): Jump {
  return {
    id: row.id,
    itemId: row.item_id,
    fromMs: row.from_ms,
    toMs: row.to_ms,
    createdAt: row.created_at,
  };
}

export function listJumps(itemId: string): Jump[] {
  return getDatabase()
    .getAllSync<JumpRow>(
      `SELECT id, item_id, from_ms, to_ms, created_at
       FROM jump
       WHERE item_id = ?
       ORDER BY created_at DESC, rowid DESC`,
      itemId,
    )
    .map(mapJump);
}

export function insertJump(jump: Jump): void {
  const db = getDatabase();
  db.runSync(
    'INSERT INTO jump (id, item_id, from_ms, to_ms, created_at) VALUES (?, ?, ?, ?, ?)',
    jump.id,
    jump.itemId,
    Math.max(0, Math.round(jump.fromMs)),
    Math.max(0, Math.round(jump.toMs)),
    jump.createdAt,
  );
  const ids = db
    .getAllSync<{ id: string }>(
      'SELECT id FROM jump WHERE item_id = ? ORDER BY created_at DESC, rowid DESC',
      jump.itemId,
    )
    .map((row) => row.id);
  for (const id of idsToDrop(ids, JUMP_HISTORY_LIMIT)) {
    db.runSync('DELETE FROM jump WHERE id = ?', id);
  }
}

export function deleteJump(id: string): void {
  getDatabase().runSync('DELETE FROM jump WHERE id = ?', id);
}

export function clearJumps(itemId: string): void {
  getDatabase().runSync('DELETE FROM jump WHERE item_id = ?', itemId);
}

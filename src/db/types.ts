export type AudioItem = {
  id: string;
  uri: string;
  bookmark: string | null;
  fingerprint: string;
  title: string;
  durationMs: number | null;
  artwork: string | null;
  format: string | null;
  missing: boolean;
  createdAt: number;
  positionMs: number;
  speed: number;
  updatedAt: number | null;
};

export type Note = {
  id: string;
  itemId: string;
  positionMs: number;
  text: string;
  tags: string;
  createdAt: number;
};

export type StoredRange = {
  startMs: number;
  endMs: number;
  sessionAt: number;
};

type AudioRow = {
  id: string;
  uri: string;
  bookmark: string | null;
  fingerprint: string;
  title: string;
  duration_ms: number | null;
  artwork: string | null;
  format: string | null;
  missing: number;
  created_at: number;
  position_ms: number | null;
  speed: number | null;
  updated_at: number | null;
};

export function mapAudioItem(row: AudioRow): AudioItem {
  return {
    id: row.id,
    uri: row.uri,
    bookmark: row.bookmark,
    fingerprint: row.fingerprint,
    title: row.title,
    durationMs: row.duration_ms,
    artwork: row.artwork,
    format: row.format,
    missing: row.missing === 1,
    createdAt: row.created_at,
    positionMs: row.position_ms ?? 0,
    speed: row.speed ?? 1,
    updatedAt: row.updated_at,
  };
}

export const AUDIO_SELECT = `
SELECT
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
FROM audio_item
LEFT JOIN playback_state ON playback_state.item_id = audio_item.id
`;

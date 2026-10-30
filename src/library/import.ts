import { pickAudio, type PickedAudio } from 'audionote-file-access';

import { findByFingerprint, insertAudio, markMissing, updateAccess, updateDuration } from '../db/library';
import { createId } from '../media/identity';
import { describePickedFile, releaseItem } from './files';

export type ImportSummary = {
  added: number;
  updated: number;
  unreadable: number;
};

async function rememberFile(file: PickedAudio): Promise<'added' | 'updated' | 'unreadable'> {
  const described = describePickedFile(file);
  if (!described) {
    return 'unreadable';
  }
  const existing = findByFingerprint(described.draft.fingerprint);
  if (existing) {
    updateAccess(existing.id, described.draft.uri, described.draft.bookmark);
    if (described.durationMs) {
      updateDuration(existing.id, described.durationMs, described.draft.format);
    }
    return 'updated';
  }
  const id = createId();
  insertAudio({ id, ...described.draft });
  if (described.durationMs) {
    updateDuration(id, described.durationMs, described.draft.format);
  }
  return 'added';
}

export async function importAudioFiles(): Promise<ImportSummary | null> {
  const picked = await pickAudio();
  if (picked.canceled) {
    return null;
  }
  const summary: ImportSummary = { added: 0, updated: 0, unreadable: 0 };
  for (const file of picked.files) {
    const outcome = await rememberFile(file);
    summary[outcome] += 1;
    if (file.bookmark && outcome === 'unreadable') {
      releaseItem({ bookmark: file.bookmark });
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return summary;
}

export async function locateAudioFile(itemId: string): Promise<boolean> {
  const picked = await pickAudio();
  if (picked.canceled || picked.files.length === 0) {
    return false;
  }
  const file = picked.files[0]!;
  const described = describePickedFile(file);
  if (!described) {
    markMissing(itemId, true);
    return false;
  }
  updateAccess(itemId, described.draft.uri, described.draft.bookmark);
  if (described.durationMs) {
    updateDuration(itemId, described.durationMs, described.draft.format);
  }
  return true;
}

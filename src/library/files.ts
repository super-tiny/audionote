import { File, FileMode } from 'expo-file-system';
import { releaseAccess, resolveBookmark } from 'audionote-file-access';

import { markMissing, updateAccess, type NewAudio } from '../db/library';
import type { AudioItem } from '../db/types';
import { fingerprint, formatFromName, titleFromFileName } from '../media/identity';
import { readDurationMs } from '../media/duration';

const EDGE_BYTES = 512 * 1024;

export type FileEdges = {
  head: Uint8Array;
  tail: Uint8Array;
  size: number;
};

export function readEdges(uri: string): FileEdges | null {
  try {
    const file = new File(uri);
    if (!file.exists) {
      return null;
    }
    const size = file.size;
    if (size <= 0) {
      return { head: new Uint8Array(), tail: new Uint8Array(), size: 0 };
    }
    const handle = file.open(FileMode.ReadOnly);
    try {
      const headLength = Math.min(EDGE_BYTES, size);
      const head = handle.readBytesSync(headLength);
      if (size <= EDGE_BYTES) {
        return { head, tail: head, size };
      }
      handle.offset = size - EDGE_BYTES;
      const tail = handle.readBytesSync(EDGE_BYTES);
      return { head, tail, size };
    } finally {
      handle.close();
    }
  } catch {
    return null;
  }
}

export function fileIsReadable(uri: string): boolean {
  try {
    const file = new File(uri);
    return file.exists;
  } catch {
    return false;
  }
}

export async function resolveItemUri(item: Pick<AudioItem, 'id' | 'uri' | 'bookmark'>): Promise<string | null> {
  if (!item.bookmark) {
    return fileIsReadable(item.uri) ? item.uri : null;
  }
  try {
    const resolved = await resolveBookmark(item.bookmark);
    if (resolved.stale && resolved.bookmark && resolved.bookmark !== item.bookmark) {
      updateAccess(item.id, resolved.uri, resolved.bookmark);
    }
    return fileIsReadable(resolved.uri) ? resolved.uri : null;
  } catch {
    return null;
  }
}

export async function refreshPresence(items: readonly AudioItem[]): Promise<boolean> {
  let changed = false;
  for (let index = 0; index < items.length; index += 4) {
    for (const item of items.slice(index, index + 4)) {
      if (item.bookmark) {
        continue;
      }
      const readable = fileIsReadable(item.uri);
      if (readable === item.missing) {
        markMissing(item.id, !readable);
        changed = true;
      }
    }
    await new Promise((resolve) => setTimeout(resolve, 0));
  }
  return changed;
}

export async function releaseItem(item: Pick<AudioItem, 'bookmark'>): Promise<void> {
  if (item.bookmark) {
    releaseAccess(item.bookmark);
  }
}

export function describePickedFile(file: {
  uri: string;
  name: string;
  size: number;
  mimeType: string | null;
  bookmark: string | null;
}): { draft: Omit<NewAudio, 'id'>; durationMs: number | null } | null {
  const edges = readEdges(file.uri);
  if (!edges) {
    return null;
  }
  const durationMs = readDurationMs(edges.head, edges.size) ?? readDurationMs(edges.tail, edges.size);
  return {
    draft: {
      uri: file.uri,
      bookmark: file.bookmark,
      fingerprint: fingerprint(file.name, edges.size || file.size, edges.head),
      title: titleFromFileName(file.name),
      format: formatFromName(file.name, file.mimeType),
    },
    durationMs,
  };
}

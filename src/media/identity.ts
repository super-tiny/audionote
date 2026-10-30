export function titleFromFileName(name: string): string {
  const trimmed = name.trim();
  const dot = trimmed.lastIndexOf('.');
  if (dot <= 0) {
    return trimmed || 'Untitled';
  }
  return trimmed.slice(0, dot);
}

export function formatFromName(name: string, mimeType: string | null): string {
  const extension = name.split('.').pop()?.toLowerCase() ?? '';
  if (['m4a', 'aac', 'mp3', 'wav', 'flac', 'ogg', 'opus', 'mp4'].includes(extension)) {
    return extension === 'mp4' ? 'm4a' : extension;
  }
  const mime = mimeType?.toLowerCase() ?? '';
  if (mime.includes('mpeg')) {
    return 'mp3';
  }
  if (mime.includes('mp4') || mime.includes('m4a') || mime.includes('aac')) {
    return 'm4a';
  }
  if (mime.includes('flac')) {
    return 'flac';
  }
  if (mime.includes('ogg') || mime.includes('opus')) {
    return 'ogg';
  }
  if (mime.includes('wav')) {
    return 'wav';
  }
  return extension || 'audio';
}

export function fingerprint(name: string, size: number, header: Uint8Array): string {
  let hash = 2166136261;
  const sample = header.subarray(0, 4096);
  for (const byte of sample) {
    hash ^= byte;
    hash = Math.imul(hash, 16777619);
  }
  return `${size}:${name}:${(hash >>> 0).toString(16)}`;
}

export function createId(): string {
  if (typeof globalThis.crypto?.randomUUID === 'function') {
    return globalThis.crypto.randomUUID();
  }
  return `id-${Date.now().toString(16)}-${Math.random().toString(16).slice(2)}`;
}

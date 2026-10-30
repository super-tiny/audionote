const OPAQUE_ID = /^[A-Za-z0-9+/_=-]+$/;

function isOpaqueId(title: string): boolean {
  const compact = title.replace(/\s/g, '');
  return compact.length >= 24 && OPAQUE_ID.test(compact);
}

/** Shortens cryptic import names while keeping human titles readable. */
export function displayTitle(title: string, maxLength = 44): string {
  const trimmed = title.trim() || 'Untitled';
  if (isOpaqueId(trimmed) && trimmed.length > 24) {
    return `${trimmed.slice(0, 16)}…${trimmed.slice(-12)}`;
  }
  if (trimmed.length <= maxLength) {
    return trimmed;
  }
  return `${trimmed.slice(0, maxLength - 1)}…`;
}

export function titleInitials(title: string): string {
  const trimmed = title.trim() || '?';
  if (isOpaqueId(trimmed)) {
    return trimmed.slice(0, 2).toUpperCase();
  }
  const words = trimmed.split(/\s+/).filter(Boolean);
  if (words.length >= 2) {
    return `${words[0]![0] ?? ''}${words[1]![0] ?? ''}`.toUpperCase();
  }
  return trimmed.slice(0, 2).toUpperCase();
}

export function titleAccentColor(title: string): string {
  let hash = 0;
  for (let index = 0; index < title.length; index += 1) {
    hash = title.charCodeAt(index) + ((hash << 5) - hash);
  }
  const palette = ['#3D6F9C', '#4A608C', '#356B7A', '#5A4E8C', '#3F7A62', '#7A4E68'];
  return palette[Math.abs(hash) % palette.length]!;
}

export function likePattern(query: string): string {
  const escaped = query.trim().replace(/[\\%_]/g, (character) => `\\${character}`);
  return `%${escaped}%`;
}

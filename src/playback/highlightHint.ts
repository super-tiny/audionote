import { getSetting, setSetting } from '../db/library';

const HIGHLIGHT_HINT_HIDDEN_KEY = 'highlight_hint_hidden';

export function isHighlightHintHidden(): boolean {
  return getSetting(HIGHLIGHT_HINT_HIDDEN_KEY) === '1';
}

export function setHighlightHintHidden(hidden: boolean): void {
  setSetting(HIGHLIGHT_HINT_HIDDEN_KEY, hidden ? '1' : '0');
}

import { fillTemplate, pluralCategory, type Locale } from './languages';
import { messages, type MessageKey } from './messages';

export type TranslateVars = Record<string, string | number>;
export type PluralBase = 'notes' | 'portions';

export function translate(locale: Locale, key: MessageKey, vars?: TranslateVars): string {
  return fillTemplate(locale, messages[locale][key] ?? messages.en[key], vars);
}

export function translateCount(locale: Locale, base: PluralBase, count: number): string {
  const key = `${base}_${pluralCategory(locale, count)}` as MessageKey;
  return translate(locale, key, { count });
}

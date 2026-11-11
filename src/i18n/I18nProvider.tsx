import { createContext, useCallback, useContext, useMemo, useState, type ReactNode } from 'react';
import type { TextStyle } from 'react-native';

import { getSetting, setSetting } from '../db/library';
import { formatClock, formatHours } from '../notes/capture';
import {
  languageFor,
  layoutDirection,
  localizeDigits,
  parseLocale,
  type LanguageOption,
  type LayoutDirection,
  type Locale,
} from './languages';
import type { MessageKey } from './messages';
import { translate, translateCount, type PluralBase, type TranslateVars } from './translate';

const LOCALE_SETTING = 'locale';

type I18nContextValue = {
  locale: Locale | null;
  language: LanguageOption | null;
  isRtl: boolean;
  direction: LayoutDirection;
  setLocale: (locale: Locale) => void;
  t: (key: MessageKey, vars?: TranslateVars) => string;
  count: (base: PluralBase, value: number) => string;
  clock: (ms: number) => string;
  hours: (ms: number) => string;
  align: Pick<TextStyle, 'textAlign' | 'writingDirection'>;
};

const I18nContext = createContext<I18nContextValue | null>(null);

function readSavedLocale(): Locale | null {
  try {
    return parseLocale(getSetting(LOCALE_SETTING));
  } catch {
    return null;
  }
}

export function I18nProvider({ children }: { children: ReactNode }) {
  const [locale, setLocaleState] = useState<Locale | null>(readSavedLocale);

  const setLocale = useCallback((next: Locale) => {
    try {
      setSetting(LOCALE_SETTING, next);
    } catch {
      // Keep the choice for this session when storage is unavailable.
    }
    setLocaleState(next);
  }, []);

  const value = useMemo<I18nContextValue>(() => {
    const active = locale ?? 'en';
    const direction = layoutDirection(locale);
    return {
      locale,
      language: locale ? languageFor(locale) : null,
      isRtl: direction === 'rtl',
      direction,
      setLocale,
      t: (key, vars) => translate(active, key, vars),
      count: (base, amount) => translateCount(active, base, amount),
      clock: (ms) => localizeDigits(active, formatClock(ms)),
      hours: (ms) => {
        const formatted = localizeDigits(active, formatHours(ms));
        // Keep a trailing Latin unit on the inline end of an RTL run.
        return direction === 'rtl' ? `\u200F${formatted}` : formatted;
      },
      align: {
        // `start` is the physical right edge when the paragraph is RTL.
        // `right` is resolved back to the left in that same layout.
        textAlign: 'start',
        writingDirection: direction,
      },
    };
  }, [locale, setLocale]);

  return <I18nContext.Provider value={value}>{children}</I18nContext.Provider>;
}

export function useI18n(): I18nContextValue {
  const value = useContext(I18nContext);
  if (!value) {
    throw new Error('useI18n must be used within I18nProvider');
  }
  return value;
}

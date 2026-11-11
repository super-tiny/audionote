export const LOCALES = ['en', 'fr', 'de', 'ar', 'fa'] as const;

export type Locale = (typeof LOCALES)[number];

export type LayoutDirection = 'ltr' | 'rtl';

export type LanguageOption = {
  code: Locale;
  nativeName: string;
  englishName: string;
  direction: LayoutDirection;
};

export const LANGUAGES: readonly LanguageOption[] = [
  { code: 'en', nativeName: 'English', englishName: 'English', direction: 'ltr' },
  { code: 'fr', nativeName: 'Français', englishName: 'French', direction: 'ltr' },
  { code: 'de', nativeName: 'Deutsch', englishName: 'German', direction: 'ltr' },
  { code: 'ar', nativeName: 'العربية', englishName: 'Arabic', direction: 'rtl' },
  { code: 'fa', nativeName: 'فارسی', englishName: 'Persian', direction: 'rtl' },
];

const RTL_DIGITS: Partial<Record<Locale, string>> = {
  ar: '٠١٢٣٤٥٦٧٨٩',
  fa: '۰۱۲۳۴۵۶۷۸۹',
};

export function isLocale(value: string | null | undefined): value is Locale {
  return LOCALES.some((locale) => locale === value);
}

/** Accepts a stored code or a device tag such as `fa-IR`. */
export function parseLocale(value: string | null | undefined): Locale | null {
  if (!value) {
    return null;
  }
  const base = value.trim().toLowerCase().split(/[-_]/)[0] ?? '';
  if (isLocale(base)) {
    return base;
  }
  if (base === 'fas' || base === 'per' || base === 'pes') {
    return 'fa';
  }
  if (base === 'ara') {
    return 'ar';
  }
  if (base === 'deu' || base === 'ger') {
    return 'de';
  }
  if (base === 'fra' || base === 'fre') {
    return 'fr';
  }
  if (base === 'eng') {
    return 'en';
  }
  return null;
}

export function languageFor(locale: Locale): LanguageOption {
  return LANGUAGES.find((language) => language.code === locale) ?? LANGUAGES[0]!;
}

export function isRtlLocale(locale: Locale): boolean {
  return languageFor(locale).direction === 'rtl';
}

export function layoutDirection(locale: Locale | null): LayoutDirection {
  return locale && isRtlLocale(locale) ? 'rtl' : 'ltr';
}

export function suggestedLocale(): Locale | null {
  try {
    return parseLocale(Intl.DateTimeFormat().resolvedOptions().locale);
  } catch {
    return null;
  }
}

export function localizeDigits(locale: Locale, value: string): string {
  const digits = RTL_DIGITS[locale];
  if (!digits) {
    return value;
  }
  return value.replace(/\d/g, (digit) => digits[Number(digit)] ?? digit);
}

export type PluralCategory = 'zero' | 'one' | 'two' | 'few' | 'many' | 'other';

export function pluralCategory(locale: Locale, count: number): PluralCategory {
  const n = Math.abs(count);
  if (locale === 'ar') {
    if (n === 0) {
      return 'zero';
    }
    if (n === 1) {
      return 'one';
    }
    if (n === 2) {
      return 'two';
    }
    if (n >= 3 && n <= 10) {
      return 'few';
    }
    if (n >= 11 && n <= 99) {
      return 'many';
    }
    return 'other';
  }
  if (locale === 'fa') {
    return 'other';
  }
  return n === 1 ? 'one' : 'other';
}

export function fillTemplate(locale: Locale, template: string, vars?: Record<string, string | number>): string {
  const filled = template.replace(/\{(\w+)\}/g, (_, name: string) => {
    const value = vars?.[name];
    return value == null ? '' : String(value);
  });
  return localizeDigits(locale, filled);
}

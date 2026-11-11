import assert from 'node:assert/strict';
import test from 'node:test';

import { fillTemplate, isRtlLocale, LANGUAGES, localizeDigits, parseLocale, pluralCategory } from './languages.ts';
import { messages, type MessageKey } from './messages.ts';

function translateCount(locale: 'en' | 'fr' | 'de' | 'ar' | 'fa', base: 'notes' | 'portions', count: number): string {
  const key = `${base}_${pluralCategory(locale, count)}` as MessageKey;
  return fillTemplate(locale, messages[locale][key], { count });
}

test('parses stored codes and device language tags', () => {
  assert.equal(parseLocale('en'), 'en');
  assert.equal(parseLocale('fa-IR'), 'fa');
  assert.equal(parseLocale('ar_SA'), 'ar');
  assert.equal(parseLocale('de-DE'), 'de');
  assert.equal(parseLocale('fr'), 'fr');
  assert.equal(parseLocale('pes'), 'fa');
  assert.equal(parseLocale('deu'), 'de');
  assert.equal(parseLocale(null), null);
  assert.equal(parseLocale('zh-CN'), null);
});

test('arabic and persian lay out right to left', () => {
  assert.equal(isRtlLocale('ar'), true);
  assert.equal(isRtlLocale('fa'), true);
  assert.equal(isRtlLocale('en'), false);
  assert.equal(isRtlLocale('fr'), false);
  assert.equal(isRtlLocale('de'), false);
  assert.deepEqual(
    LANGUAGES.map((language) => language.code),
    ['en', 'fr', 'de', 'ar', 'fa'],
  );
});

test('every language has the same messages', () => {
  const keys = Object.keys(messages.en).sort();
  for (const language of LANGUAGES) {
    assert.deepEqual(Object.keys(messages[language.code]).sort(), keys);
    for (const key of keys) {
      const value = messages[language.code][key as MessageKey];
      assert.equal(typeof value, 'string');
      assert.ok(value.length > 0);
    }
  }
});

test('fills placeholders and localizes digits for arabic and persian', () => {
  assert.equal(fillTemplate('en', messages.en.resumeAt, { time: '1:05' }), 'Resume at 1:05');
  assert.equal(fillTemplate('fr', messages.fr.heardPercent, { percent: 40 }), '40 % écouté');
  assert.equal(fillTemplate('ar', messages.ar.allLessons, { count: 12 }), 'كل الدروس · ١٢');
  assert.equal(fillTemplate('fa', messages.fa.minutes, { count: 15 }), '۱۵ دقیقه');
  assert.equal(localizeDigits('fa', '۰'), '۰');
});

test('picks plural categories', () => {
  assert.equal(pluralCategory('en', 1), 'one');
  assert.equal(pluralCategory('en', 0), 'other');
  assert.equal(pluralCategory('fr', 2), 'other');
  assert.equal(pluralCategory('de', 1), 'one');
  assert.equal(pluralCategory('fa', 3), 'other');
  assert.equal(pluralCategory('ar', 0), 'zero');
  assert.equal(pluralCategory('ar', 1), 'one');
  assert.equal(pluralCategory('ar', 2), 'two');
  assert.equal(pluralCategory('ar', 4), 'few');
  assert.equal(pluralCategory('ar', 15), 'many');
  assert.equal(pluralCategory('ar', 100), 'other');
  assert.equal(translateCount('en', 'notes', 1), '1 note');
  assert.equal(translateCount('en', 'portions', 3), '3 portions');
  assert.equal(translateCount('ar', 'notes', 0), 'لا ملاحظات');
  assert.equal(translateCount('ar', 'portions', 2), 'مقطعان');
  assert.equal(translateCount('fa', 'notes', 4), '۴ یادداشت');
});

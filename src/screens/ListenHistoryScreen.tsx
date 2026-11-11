import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getItem, listListenHistory } from '../db/library';
import {
  DURATION_FILTERS,
  durationBand,
  filterProblem,
  LONG_MIN_MS,
  parseMinutes,
  portionDurationMs,
  portionMatches,
  sortPortions,
  type DurationBand,
  type ListenPortion,
  type ListenSortKey,
  type PortionFilter,
  type SortDirection,
} from '../library/listenHistory';
import { displayTitle } from '../ui/displayTitle';
import type { RootStackParamList } from '../navigation/types';
import { flushProgress, subscribeListenProgress } from '../playback/persist';
import { useI18n } from '../i18n/I18nProvider';
import type { MessageKey } from '../i18n/messages';
import { AppPressable } from '../ui/AppPressable';
import { ScreenBackdrop } from '../ui/ScreenBackdrop';
import { ScreenHeader } from '../ui/ScreenHeader';
import { colors, radii, spacing } from '../ui/theme';

type ListenHistoryProps = NativeStackScreenProps<RootStackParamList, 'ListenHistory'> & {
  onPlayerContext: (itemId: string | null, title: string | null) => void;
};

const SORTS: { key: ListenSortKey; label: MessageKey }[] = [
  { key: 'start', label: 'sortStart' },
  { key: 'duration', label: 'sortLength' },
  { key: 'listened', label: 'sortWhen' },
];

const FILTER_TEXT: Record<PortionFilter['kind'], { label: MessageKey; hint: MessageKey }> = {
  all: { label: 'filterAll', hint: 'filterAllHint' },
  short: { label: 'filterShort', hint: 'filterShortHint' },
  medium: { label: 'filterMedium', hint: 'filterMediumHint' },
  long: { label: 'filterLong', hint: 'filterLongHint' },
  custom: { label: 'filterCustom', hint: 'filterCustomHint' },
};

const BAND_LABEL: Record<DurationBand, MessageKey> = {
  short: 'filterShort',
  medium: 'filterMedium',
  long: 'filterLong',
};

const BAND_COLOR: Record<DurationBand, string> = {
  short: colors.muted,
  medium: colors.accent,
  long: colors.heard,
};

function formatListenedAt(ms: number, locale: string): string {
  return new Date(ms).toLocaleString(locale, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
}

function samePortions(left: readonly ListenPortion[], right: readonly ListenPortion[]): boolean {
  if (left.length !== right.length) {
    return false;
  }
  for (let index = 0; index < left.length; index += 1) {
    const previous = left[index];
    const next = right[index];
    if (
      !previous ||
      !next ||
      previous.id !== next.id ||
      previous.startMs !== next.startMs ||
      previous.endMs !== next.endMs ||
      previous.sessionAt !== next.sessionAt ||
      previous.itemId !== next.itemId
    ) {
      return false;
    }
    const previousReplays = previous.replays ?? [];
    const nextReplays = next.replays ?? [];
    if (previousReplays.length !== nextReplays.length) {
      return false;
    }
    for (let replayIndex = 0; replayIndex < previousReplays.length; replayIndex += 1) {
      const before = previousReplays[replayIndex];
      const after = nextReplays[replayIndex];
      if (!before || !after || before.startMs !== after.startMs || before.endMs !== after.endMs) {
        return false;
      }
    }
  }
  return true;
}

function buildFilter(kind: PortionFilter['kind'], minText: string, maxText: string): PortionFilter {
  if (kind !== 'custom') {
    return { kind };
  }
  const min = parseMinutes(minText);
  const max = parseMinutes(maxText);
  return { kind: 'custom', minMs: min.ms, maxMs: max.ms, invalid: min.invalid || max.invalid };
}

export function ListenHistoryScreen({ navigation, route, onPlayerContext }: ListenHistoryProps) {
  const insets = useSafeAreaInsets();
  const routeItemId = route.params?.itemId;
  const [scope, setScope] = useState<'lesson' | 'all'>(routeItemId ? 'lesson' : 'all');
  const [portions, setPortions] = useState<ListenPortion[]>([]);
  const [kind, setKind] = useState<PortionFilter['kind']>('all');
  const [minText, setMinText] = useState('');
  const [maxText, setMaxText] = useState('');
  const [sortKey, setSortKey] = useState<ListenSortKey>('start');
  const [direction, setDirection] = useState<SortDirection>('asc');
  const { t, clock, count, locale, align } = useI18n();
  useEffect(() => {
    setScope(routeItemId ? 'lesson' : 'all');
  }, [routeItemId]);

  const itemId = scope === 'lesson' ? routeItemId ?? null : null;
  const lesson = itemId ? getItem(itemId) : null;

  const reload = useCallback(() => {
    const next = listListenHistory(itemId);
    setPortions((current) => (samePortions(current, next) ? current : next));
  }, [itemId]);

  useFocusEffect(
    useCallback(() => {
      flushProgress();
      reload();
      let last = Date.now();
      return subscribeListenProgress(() => {
        const now = Date.now();
        if (now - last < 4000) {
          return;
        }
        last = now;
        reload();
      });
    }, [reload]),
  );

  const filter = useMemo(() => buildFilter(kind, minText, maxText), [kind, minText, maxText]);
  const problem = filterProblem(filter);
  const problemText = problem === 'invalid' ? t('minutesInvalid') : problem === 'order' ? t('minAboveMax') : null;
  const visible = useMemo(
    () =>
      sortPortions(
        portions.filter((portion) => portionMatches(portionDurationMs(portion), filter)),
        sortKey,
        direction,
      ),
    [portions, filter, sortKey, direction],
  );
  const selectedFilter = FILTER_TEXT[kind];
  const hint = t(selectedFilter.hint);
  const totalMs = visible.reduce((sum, portion) => sum + portionDurationMs(portion), 0);

  function chooseSort(next: ListenSortKey): void {
    if (next === sortKey) {
      setDirection((current) => (current === 'asc' ? 'desc' : 'asc'));
      return;
    }
    setSortKey(next);
    setDirection('asc');
  }

  function openPortion(portion: ListenPortion): void {
    onPlayerContext(portion.itemId, portion.title);
    navigation.navigate({
      name: 'Player',
      params: { itemId: portion.itemId, seekMs: portion.startMs, seekToken: Date.now() },
      merge: false,
    });
  }

  return (
    <ScreenBackdrop>
      <View style={styles.screen}>
        <ScreenHeader
          title={lesson ? displayTitle(lesson.title, 42, t('untitled')) : t('listeningHistory')}
          subtitle={lesson ? t('listeningHistory') : t('everyRecordedPortion')}
          onBack={() => navigation.goBack()}
        />
        <View style={styles.controls}>
          {routeItemId ? (
            <View style={styles.scopeRow}>
              <ScopeChip label={t('thisLesson')} selected={scope === 'lesson'} onPress={() => setScope('lesson')} />
              <ScopeChip label={t('allLessonsScope')} selected={scope === 'all'} onPress={() => setScope('all')} />
            </View>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {DURATION_FILTERS.map((entry) => {
              const selected = kind === entry.kind;
              const copy = FILTER_TEXT[entry.kind];
              const label = t(copy.label);
              const entryHint = t(copy.hint);
              return (
                <Pressable
                  key={entry.kind}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${label}. ${entryHint}`}
                  onPress={() => setKind(entry.kind)}
                  style={[styles.chip, selected && styles.chipOn]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={[styles.hint, align, problem ? styles.problem : null]}>{problemText ?? hint}</Text>
          {kind === 'custom' ? (
            <View style={styles.rangeRow}>
              <TextInput
                value={minText}
                onChangeText={setMinText}
                keyboardType="decimal-pad"
                placeholder={t('minMinutes')}
                placeholderTextColor={colors.muted}
                accessibilityLabel={t('minMinutesA11y')}
                style={[styles.rangeInput, align]}
              />
              <TextInput
                value={maxText}
                onChangeText={setMaxText}
                keyboardType="decimal-pad"
                placeholder={t('maxMinutes')}
                placeholderTextColor={colors.muted}
                accessibilityLabel={t('maxMinutesA11y')}
                style={[styles.rangeInput, align]}
              />
            </View>
          ) : null}
          <View style={styles.sortRow}>
            {SORTS.map((entry) => {
              const selected = sortKey === entry.key;
              const arrow = direction === 'asc' ? 'arrow-up' : 'arrow-down';
              const label = t(entry.label);
              const directionLabel = direction === 'asc' ? t('ascending') : t('descending');
              return (
                <Pressable
                  key={entry.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={
                    selected ? t('sortByActive', { label, direction: directionLabel }) : t('sortBy', { label })
                  }
                  onPress={() => chooseSort(entry.key)}
                  style={[styles.sortButton, selected && styles.sortButtonOn]}
                >
                  <Text style={[styles.sortText, selected && styles.sortTextOn]}>{label}</Text>
                  {selected ? <Ionicons name={arrow} size={14} color={colors.background} /> : null}
                </Pressable>
              );
            })}
          </View>
          <Text style={[styles.summary, align]}>
            {count('portions', visible.length)}
            {visible.length ? ` · ${clock(totalMs)}` : ''}
          </Text>
        </View>
        <FlashList
          data={visible}
          keyExtractor={(portion) => String(portion.id)}
          style={styles.list}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={[styles.empty, align]}>
              {portions.length === 0 ? t('noPortionsYet') : t('noPortionsMatch')}
            </Text>
          }
          renderItem={({ item: portion }) => (
            <PortionRow portion={portion} showTitle={!lesson} onPress={() => openPortion(portion)} />
          )}
        />
      </View>
    </ScreenBackdrop>
  );
}

function ScopeChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <Pressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={[styles.chip, selected && styles.chipOn]}
    >
      <Text style={[styles.chipText, selected && styles.chipTextOn]}>{label}</Text>
    </Pressable>
  );
}

function PortionRow({
  portion,
  showTitle,
  onPress,
}: {
  portion: ListenPortion;
  showTitle: boolean;
  onPress: () => void;
}) {
  const { t, clock, locale, align } = useI18n();
  const durationMs = portionDurationMs(portion);
  const band = durationBand(durationMs);
  const bandLabel = t(BAND_LABEL[band]);
  const meter = Math.min(1, durationMs / LONG_MIN_MS);
  const start = clock(portion.startMs);
  const end = clock(portion.endMs);
  const length = clock(durationMs);
  const title = displayTitle(portion.title, 44, t('untitled'));
  const replays = portion.replays ?? [];
  const replayLabel = replays.map((span) => `${clock(span.startMs)}–${clock(span.endMs)}`).join(', ');
  return (
    <AppPressable
      accessibilityRole="button"
      accessibilityLabel={
        replays.length > 0
          ? t('portionA11yReplay', { title, band: bandLabel, start, end, length, spans: replayLabel })
          : t('portionA11y', { title, band: bandLabel, start, end, length })
      }
      haptic
      onPress={onPress}
      style={[styles.card, replays.length > 0 && styles.cardImportant]}
    >
      <View style={styles.cardTop}>
        <View style={styles.badges}>
          <Text style={[styles.badge, { color: BAND_COLOR[band] }]}>{bandLabel}</Text>
          {replays.length > 0 ? <Text style={styles.importantBadge}>{t('important')}</Text> : null}
        </View>
        <Text style={styles.length}>{length}</Text>
      </View>
      {showTitle ? (
        <Text numberOfLines={1} style={[styles.cardTitle, align]}>
          {title}
        </Text>
      ) : null}
      <View style={styles.times}>
        <TimeStat label={t('timeStart')} value={start} />
        <TimeStat label={t('timeEnd')} value={end} />
        <TimeStat label={t('timeLength')} value={length} />
      </View>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${Math.max(meter * 100, 6)}%`, backgroundColor: BAND_COLOR[band] }]} />
      </View>
      {replays.length > 0 ? (
        <Text style={[styles.replay, align]}>{t('playedAgain', { spans: replayLabel })}</Text>
      ) : null}
      <Text style={[styles.when, align]}>{t('heardWhen', { when: formatListenedAt(portion.sessionAt, locale ?? 'en') })}</Text>
    </AppPressable>
  );
}

function TimeStat({ label, value }: { label: string; value: string }) {
  const { align } = useI18n();
  return (
    <View style={styles.timeStat}>
      <Text style={[styles.timeLabel, align]}>{label}</Text>
      <Text style={[styles.timeValue, align]}>{value}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
  },
  list: {
    flex: 1,
  },
  controls: {
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
    paddingBottom: spacing.sm,
  },
  scopeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  filters: {
    gap: spacing.sm,
    paddingVertical: 2,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  chipOn: {
    backgroundColor: colors.accent,
    borderColor: colors.accent,
  },
  chipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  chipTextOn: {
    color: colors.background,
  },
  hint: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  problem: {
    color: colors.danger,
  },
  rangeRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  rangeInput: {
    flex: 1,
    minHeight: 44,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    color: colors.text,
    paddingHorizontal: spacing.md,
    fontSize: 16,
  },
  sortRow: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  sortButton: {
    flex: 1,
    minHeight: 40,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
  },
  sortButtonOn: {
    backgroundColor: colors.accent,
  },
  sortText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '700',
  },
  sortTextOn: {
    color: colors.background,
  },
  summary: {
    color: colors.muted,
    fontSize: 13,
    fontVariant: ['tabular-nums'],
  },
  empty: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    paddingTop: spacing.lg,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.md,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  cardImportant: {
    borderColor: colors.important,
  },
  cardTop: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
  },
  badges: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    flexShrink: 1,
  },
  badge: {
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  importantBadge: {
    color: colors.important,
    fontSize: 12,
    fontWeight: '800',
    letterSpacing: 0.2,
  },
  length: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  cardTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  times: {
    flexDirection: 'row',
    gap: spacing.md,
  },
  timeStat: {
    flex: 1,
    gap: 2,
  },
  timeLabel: {
    color: colors.muted,
    fontSize: 11,
    fontWeight: '700',
    textTransform: 'uppercase',
    letterSpacing: 0.3,
  },
  timeValue: {
    color: colors.text,
    fontSize: 15,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  meterTrack: {
    direction: 'ltr',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  meterFill: {
    height: 6,
    borderRadius: 3,
  },
  replay: {
    color: colors.important,
    fontSize: 13,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
  when: {
    color: colors.muted,
    fontSize: 12,
  },
});

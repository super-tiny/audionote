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
  aggregateSequentialPortions,
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
import { formatClock } from '../notes/capture';
import type { RootStackParamList } from '../navigation/types';
import { flushProgress } from '../playback/persist';
import { AppPressable } from '../ui/AppPressable';
import { ScreenBackdrop } from '../ui/ScreenBackdrop';
import { ScreenHeader } from '../ui/ScreenHeader';
import { colors, radii, spacing } from '../ui/theme';

type ListenHistoryProps = NativeStackScreenProps<RootStackParamList, 'ListenHistory'> & {
  onPlayerContext: (itemId: string | null, title: string | null) => void;
};

const SORTS: { key: ListenSortKey; label: string }[] = [
  { key: 'start', label: 'Start' },
  { key: 'duration', label: 'Length' },
  { key: 'listened', label: 'When' },
];

const BAND_COLOR: Record<DurationBand, string> = {
  short: colors.muted,
  medium: colors.accent,
  long: colors.heard,
};

function formatListenedAt(ms: number): string {
  return new Date(ms).toLocaleString(undefined, {
    month: 'short',
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
  });
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
  useEffect(() => {
    setScope(routeItemId ? 'lesson' : 'all');
  }, [routeItemId]);

  const itemId = scope === 'lesson' ? routeItemId ?? null : null;
  const lesson = itemId ? getItem(itemId) : null;

  const reload = useCallback(() => {
    setPortions(listListenHistory(itemId));
  }, [itemId]);

  useFocusEffect(
    useCallback(() => {
      flushProgress();
      reload();
      const timer = setInterval(reload, 2000);
      return () => clearInterval(timer);
    }, [reload]),
  );

  const filter = useMemo(() => buildFilter(kind, minText, maxText), [kind, minText, maxText]);
  const problem = filterProblem(filter);
  const aggregated = useMemo(() => aggregateSequentialPortions(portions), [portions]);
  const visible = useMemo(
    () =>
      sortPortions(
        aggregated.filter((portion) => portionMatches(portionDurationMs(portion), filter)),
        sortKey,
        direction,
      ),
    [aggregated, filter, sortKey, direction],
  );
  const hint = DURATION_FILTERS.find((entry) => entry.kind === kind)?.hint ?? '';
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
          title={lesson ? displayTitle(lesson.title, 42) : 'Listening history'}
          subtitle={lesson ? 'Listening history' : 'Every recorded portion'}
          onBack={() => navigation.goBack()}
          backLabel="Back"
        />
        <View style={styles.controls}>
          {routeItemId ? (
            <View style={styles.scopeRow}>
              <ScopeChip label="This lesson" selected={scope === 'lesson'} onPress={() => setScope('lesson')} />
              <ScopeChip label="All lessons" selected={scope === 'all'} onPress={() => setScope('all')} />
            </View>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.filters}>
            {DURATION_FILTERS.map((entry) => {
              const selected = kind === entry.kind;
              return (
                <Pressable
                  key={entry.kind}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${entry.label}. ${entry.hint}`}
                  onPress={() => setKind(entry.kind)}
                  style={[styles.chip, selected && styles.chipOn]}
                >
                  <Text style={[styles.chipText, selected && styles.chipTextOn]}>{entry.label}</Text>
                </Pressable>
              );
            })}
          </ScrollView>
          <Text style={[styles.hint, problem ? styles.problem : null]}>{problem ?? hint}</Text>
          {kind === 'custom' ? (
            <View style={styles.rangeRow}>
              <TextInput
                value={minText}
                onChangeText={setMinText}
                keyboardType="decimal-pad"
                placeholder="Min minutes"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Minimum duration in minutes"
                style={styles.rangeInput}
              />
              <TextInput
                value={maxText}
                onChangeText={setMaxText}
                keyboardType="decimal-pad"
                placeholder="Max minutes"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Maximum duration in minutes"
                style={styles.rangeInput}
              />
            </View>
          ) : null}
          <View style={styles.sortRow}>
            {SORTS.map((entry) => {
              const selected = sortKey === entry.key;
              const arrow = direction === 'asc' ? 'arrow-up' : 'arrow-down';
              const directionLabel = direction === 'asc' ? 'ascending' : 'descending';
              return (
                <Pressable
                  key={entry.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={
                    selected ? `Sort by ${entry.label}, ${directionLabel}. Activate to reverse.` : `Sort by ${entry.label}`
                  }
                  onPress={() => chooseSort(entry.key)}
                  style={[styles.sortButton, selected && styles.sortButtonOn]}
                >
                  <Text style={[styles.sortText, selected && styles.sortTextOn]}>{entry.label}</Text>
                  {selected ? <Ionicons name={arrow} size={14} color={colors.background} /> : null}
                </Pressable>
              );
            })}
          </View>
          <Text style={styles.summary}>
            {visible.length} {visible.length === 1 ? 'portion' : 'portions'}
            {visible.length ? ` · ${formatClock(totalMs)}` : ''}
          </Text>
        </View>
        <FlashList
          data={visible}
          keyExtractor={(portion) => String(portion.id)}
          style={styles.list}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text style={styles.empty}>
              {portions.length === 0
                ? 'No portions recorded yet. They show up here after you listen.'
                : 'No portions match this length.'}
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
  const durationMs = portionDurationMs(portion);
  const band = durationBand(durationMs);
  const bandLabel = DURATION_FILTERS.find((entry) => entry.kind === band)?.label ?? band;
  const meter = Math.min(1, durationMs / LONG_MIN_MS);
  const start = formatClock(portion.startMs);
  const end = formatClock(portion.endMs);
  const length = formatClock(durationMs);
  const replays = portion.replays ?? [];
  const replayLabel = replays
    .map((span) => `${formatClock(span.startMs)}–${formatClock(span.endMs)}`)
    .join(', ');
  return (
    <AppPressable
      accessibilityRole="button"
      accessibilityLabel={`${displayTitle(portion.title)}. ${bandLabel} portion from ${start} to ${end}, length ${length}.${
        replays.length > 0 ? ` Important. Played again ${replayLabel}.` : ''
      } Play from the start.`}
      haptic
      onPress={onPress}
      style={[styles.card, replays.length > 0 && styles.cardImportant]}
    >
      <View style={styles.cardTop}>
        <View style={styles.badges}>
          <Text style={[styles.badge, { color: BAND_COLOR[band] }]}>{bandLabel}</Text>
          {replays.length > 0 ? <Text style={styles.importantBadge}>Important</Text> : null}
        </View>
        <Text style={styles.length}>{length}</Text>
      </View>
      {showTitle ? (
        <Text numberOfLines={1} style={styles.cardTitle}>
          {displayTitle(portion.title)}
        </Text>
      ) : null}
      <View style={styles.times}>
        <TimeStat label="Start" value={start} />
        <TimeStat label="End" value={end} />
        <TimeStat label="Length" value={length} />
      </View>
      <View style={styles.meterTrack}>
        <View style={[styles.meterFill, { width: `${Math.max(meter * 100, 6)}%`, backgroundColor: BAND_COLOR[band] }]} />
      </View>
      {replays.length > 0 ? <Text style={styles.replay}>Played again {replayLabel}</Text> : null}
      <Text style={styles.when}>Heard {formatListenedAt(portion.sessionAt)}</Text>
    </AppPressable>
  );
}

function TimeStat({ label, value }: { label: string; value: string }) {
  return (
    <View style={styles.timeStat}>
      <Text style={styles.timeLabel}>{label}</Text>
      <Text style={styles.timeValue}>{value}</Text>
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

import { Ionicons } from '@expo/vector-icons';
import { useFocusEffect } from '@react-navigation/native';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { FlashList } from '@shopify/flash-list';
import { useCallback, useEffect, useMemo, useState } from 'react';
import { TextInput } from 'react-native';
import { ScrollView, Text, XStack, YStack } from 'tamagui';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { getItem, listListenHistory } from '../db/library';
import {
  DURATION_FILTERS,
  durationBand,
  filterProblem,
  LONG_MIN_MS,
  parseMinutes,
  portionDurationMs,
  selectPortions,
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
  const visible = useMemo(
    () => selectPortions(portions, filter, sortKey, direction),
    [portions, filter, sortKey, direction],
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
      <YStack style={{ flex: 1 }}>
        <ScreenHeader
          title={lesson ? displayTitle(lesson.title, 42) : 'Listening history'}
          subtitle={lesson ? 'Listening history' : 'Every recorded portion'}
          onBack={() => navigation.goBack()}
          backLabel="Back"
        />
        <YStack style={{ paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm }}>
          {routeItemId ? (
            <XStack style={{ gap: spacing.sm }}>
              <ScopeChip label="This lesson" selected={scope === 'lesson'} onPress={() => setScope('lesson')} />
              <ScopeChip label="All lessons" selected={scope === 'all'} onPress={() => setScope('all')} />
            </XStack>
          ) : null}
          <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={{ gap: spacing.sm, paddingVertical: 2 }}>
            {DURATION_FILTERS.map((entry) => {
              const selected = kind === entry.kind;
              return (
                <AppPressable
                  key={entry.kind}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={`${entry.label}. ${entry.hint}`}
                  onPress={() => setKind(entry.kind)}
                  style={{
                    minHeight: 36,
                    paddingHorizontal: 12,
                    borderRadius: radii.pill,
                    backgroundColor: selected ? colors.accent : colors.card,
                    alignItems: 'center',
                    justifyContent: 'center',
                    borderWidth: 0.5,
                    borderColor: selected ? colors.accent : colors.line,
                  }}
                >
                  <Text color={selected ? "background" : "text"} fontSize={14} fontWeight="700">
                    {entry.label}
                  </Text>
                </AppPressable>
              );
            })}
          </ScrollView>
          <Text color={problem ? "danger" : "muted"} fontSize={13} lineHeight={18}>
            {problem ?? hint}
          </Text>
          {kind === 'custom' ? (
            <XStack style={{ gap: spacing.sm }}>
              <TextInput
                value={minText}
                onChangeText={setMinText}
                keyboardType="decimal-pad"
                placeholder="Min minutes"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Minimum duration in minutes"
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: radii.md,
                  backgroundColor: colors.card,
                  color: colors.text,
                  paddingHorizontal: spacing.md,
                  fontSize: 16,
                }}
              />
              <TextInput
                value={maxText}
                onChangeText={setMaxText}
                keyboardType="decimal-pad"
                placeholder="Max minutes"
                placeholderTextColor={colors.muted}
                accessibilityLabel="Maximum duration in minutes"
                style={{
                  flex: 1,
                  minHeight: 44,
                  borderRadius: radii.md,
                  backgroundColor: colors.card,
                  color: colors.text,
                  paddingHorizontal: spacing.md,
                  fontSize: 16,
                }}
              />
            </XStack>
          ) : null}
          <XStack style={{ gap: spacing.sm }}>
            {SORTS.map((entry) => {
              const selected = sortKey === entry.key;
              const arrow = direction === 'asc' ? 'arrow-up' : 'arrow-down';
              const directionLabel = direction === 'asc' ? 'ascending' : 'descending';
              return (
                <AppPressable
                  key={entry.key}
                  accessibilityRole="button"
                  accessibilityState={{ selected }}
                  accessibilityLabel={
                    selected ? `Sort by ${entry.label}, ${directionLabel}. Activate to reverse.` : `Sort by ${entry.label}`
                  }
                  onPress={() => chooseSort(entry.key)}
                  style={{
                    flex: 1,
                    minHeight: 40,
                    borderRadius: radii.md,
                    backgroundColor: selected ? colors.accent : colors.card,
                    flexDirection: 'row',
                    alignItems: 'center',
                    justifyContent: 'center',
                    gap: 4,
                  }}
                >
                  <Text color={selected ? 'background' : 'text'} fontSize={14} fontWeight="700">
                    {entry.label}
                  </Text>
                  {selected ? <Ionicons name={arrow} size={14} color={colors.background} /> : null}
                </AppPressable>
              );
            })}
          </XStack>
          <Text color="muted" fontSize={13} fontVariant={['tabular-nums']}>
            {visible.length} {visible.length === 1 ? 'portion' : 'portions'}
            {visible.length ? ` · ${formatClock(totalMs)}` : ''}
          </Text>
        </YStack>
        <FlashList
          data={visible}
          keyExtractor={(portion) => String(portion.id)}
          style={{ flex: 1 }}
          contentContainerStyle={{ paddingHorizontal: spacing.lg, paddingBottom: insets.bottom + spacing.xl }}
          keyboardShouldPersistTaps="handled"
          ListEmptyComponent={
            <Text color="muted" fontSize={15} lineHeight={22} style={{ paddingTop: spacing.lg }}>
              {portions.length === 0
                ? 'No portions recorded yet. They show up here after you listen.'
                : 'No portions match this length.'}
            </Text>
          }
          renderItem={({ item: portion }) => (
            <PortionRow portion={portion} showTitle={!lesson} onPress={() => openPortion(portion)} />
          )}
        />
      </YStack>
    </ScreenBackdrop>
  );
}

function ScopeChip({ label, selected, onPress }: { label: string; selected: boolean; onPress: () => void }) {
  return (
    <AppPressable
      accessibilityRole="button"
      accessibilityState={{ selected }}
      onPress={onPress}
      style={{
        minHeight: 36,
        paddingHorizontal: 12,
        borderRadius: radii.pill,
        backgroundColor: selected ? colors.accent : colors.card,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 0.5,
        borderColor: selected ? colors.accent : colors.line,
      }}
    >
      <Text color={selected ? "background" : "text"} fontSize={14} fontWeight="700">
        {label}
      </Text>
    </AppPressable>
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
  return (
    <AppPressable
      accessibilityRole="button"
      accessibilityLabel={`${displayTitle(portion.title)}. ${bandLabel} portion from ${start} to ${end}, length ${length}. Play from the start.`}
      haptic
      onPress={onPress}
      style={{
        backgroundColor: colors.card,
        borderRadius: radii.lg,
        padding: spacing.md,
        marginBottom: spacing.md,
        borderWidth: 0.5,
        borderColor: colors.line,
        gap: spacing.sm,
      }}
    >
      <XStack style={{ alignItems: 'center', justifyContent: 'space-between' }}>
        <Text fontSize={12} fontWeight="800" letterSpacing={0.2} style={{ color: BAND_COLOR[band] }}>
          {bandLabel}
        </Text>
        <Text color="text" fontSize={16} fontWeight="700" fontVariant={['tabular-nums']}>
          {length}
        </Text>
      </XStack>
      {showTitle ? (
        <Text numberOfLines={1} color="text" fontSize={16} fontWeight="700">
          {displayTitle(portion.title)}
        </Text>
      ) : null}
      <XStack style={{ gap: spacing.md }}>
        <TimeStat label="Start" value={start} />
        <TimeStat label="End" value={end} />
        <TimeStat label="Length" value={length} />
      </XStack>
      <YStack style={{ height: 6, borderRadius: 3, backgroundColor: colors.line, overflow: 'hidden' }}>
        <YStack
          style={{
            height: 6,
            borderRadius: 3,
            backgroundColor: BAND_COLOR[band],
            width: `${Math.max(meter * 100, 6)}%`,
          }}
        />
      </YStack>
      <Text color="muted" fontSize={12}>
        Heard {formatListenedAt(portion.sessionAt)}
      </Text>
    </AppPressable>
  );
}

function TimeStat({ label, value }: { label: string; value: string }) {
  return (
    <YStack style={{ flex: 1, gap: 2 }}>
      <Text color="muted" fontSize={11} fontWeight="700" textTransform="uppercase" letterSpacing={0.3}>
        {label}
      </Text>
      <Text color="text" fontSize={15} fontVariant={['tabular-nums']} fontWeight="600">
        {value}
      </Text>
    </YStack>
  );
}

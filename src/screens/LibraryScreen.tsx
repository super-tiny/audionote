import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { memo, useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { useIsPlaying } from '@rntp/player';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  continueListening,
  deleteItem,
  listItems,
  rangesForItem,
  rangesForItems,
  rangesSince,
} from '../db/library';
import type { AudioItem, StoredRange } from '../db/types';
import { importAudioFiles, locateAudioFile, type ImportSummary } from '../library/import';
import { refreshPresence } from '../library/files';
import { coveredMs, listenedFraction, projectHeardRanges } from '../library/ranges';
import { currentOpenListen, subscribeListenProgress } from '../playback/persist';
import type { RootStackParamList } from '../navigation/types';
import { resetItemPlayback } from '../playback/resetItem';
import { useI18n } from '../i18n/I18nProvider';
import { AppPressable } from '../ui/AppPressable';
import { ArtworkAvatar } from '../ui/ArtworkAvatar';
import { displayTitle } from '../ui/displayTitle';
import { directionalIcon } from '../ui/direction';
import { InlineBanner } from '../ui/InlineBanner';
import { PlaybackDock } from '../ui/PlaybackDock';
import { AboutSheet } from '../ui/AboutSheet';
import { LanguageSheet } from '../ui/LanguagePicker';
import { NavigationMenu } from '../ui/NavigationMenu';
import { ScreenBackdrop } from '../ui/ScreenBackdrop';
import { ResetProgressSheet } from '../ui/ResetProgressSheet';
import { ScreenHeader } from '../ui/ScreenHeader';
import { actionHaptic } from '../ui/haptics';
import { colors, elevation, radii, spacing } from '../ui/theme';

type Row = {
  item: AudioItem;
  heard: number;
  ranges: StoredRange[];
};

type LibraryCardProps = {
  item: AudioItem;
  ranges: readonly StoredRange[];
  heard: number;
  active: boolean;
  playing: boolean;
  positionMs: number;
  pending: boolean;
  busy: boolean;
  onOpen: (item: AudioItem) => void;
  onLocate: (itemId: string) => void;
  onReset: (item: AudioItem) => void;
  onDelete: (item: AudioItem, pending: boolean) => void;
};

type LibraryScreenProps = NativeStackScreenProps<RootStackParamList, 'Library'> & {
  playerItemId: string | null;
  playerTitle: string | null;
  onPlayerContext: (itemId: string | null, title: string | null) => void;
};

function startOfToday(): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

function loadLibrary(query: string): { rows: Row[]; resume: AudioItem[]; todayMs: number; todayRanges: StoredRange[] } {
  const items = listItems(query);
  const byItem = rangesForItems(items.map((item) => item.id));
  const open = currentOpenListen();
  const rows = items.map((item) => {
    const ranges = byItem.get(item.id) ?? [];
    const include = open?.itemId === item.id ? open.range : null;
    return {
      item,
      ranges,
      heard: listenedFraction(
        projectHeardRanges(ranges, include, include ? Math.max(item.positionMs, include.endMs) : 0, include != null),
        item.durationMs,
      ),
    };
  });
  const todayRanges = rangesSince(startOfToday());
  const todayInclude = open && open.sessionAt >= startOfToday() ? open.range : null;
  return {
    rows,
    resume: query.trim() ? [] : continueListening(),
    todayRanges,
    todayMs: coveredMs(projectHeardRanges(todayRanges, todayInclude, todayInclude?.endMs ?? 0, todayInclude != null)),
  };
}

function displayedMinutes(ms: number): number {
  return Math.round(ms / 60000);
}

const LibraryCard = memo(function LibraryCard({
  item,
  ranges,
  heard,
  active,
  playing,
  positionMs,
  pending,
  busy,
  onOpen,
  onLocate,
  onReset,
  onDelete,
}: LibraryCardProps) {
  const { t, clock, isRtl, align } = useI18n();
  const open = active && playing ? currentOpenListen() : null;
  const include = open?.itemId === item.id ? open.range : null;
  const playheadMs = include ? Math.max(positionMs, include.endMs) : positionMs;
  const heardFraction =
    include && item.durationMs
      ? listenedFraction(projectHeardRanges(ranges, include, playheadMs, true), item.durationMs)
      : heard;
  const positionFraction = item.durationMs && item.durationMs > 0 ? Math.min(1, playheadMs / item.durationMs) : 0;
  const title = displayTitle(item.title, 44, t('untitled'));

  return (
    <View style={[styles.card, active && styles.cardActive, elevation.card]}>
      <AppPressable accessibilityRole="button" haptic onPress={() => onOpen(item)} style={styles.cardMain}>
        <View style={styles.cardRow}>
          <ArtworkAvatar title={item.title} size={52} />
          <View style={styles.cardBody}>
            <View style={styles.titleRow}>
              <Text numberOfLines={2} style={[styles.cardTitle, align]}>
                {title}
              </Text>
              {active ? (
                <View style={styles.nowBadge}>
                  <Text style={styles.nowBadgeText}>{t('playing')}</Text>
                </View>
              ) : null}
            </View>
            <View style={styles.metaRow}>
              <Text style={styles.formatPill}>{(item.format ?? t('audioWord')).toUpperCase()}</Text>
              <Text style={[styles.meta, align]}>
                {item.durationMs ? clock(item.durationMs) : '—'}
                {item.durationMs ? ` · ${t('heardPercent', { percent: Math.round(heardFraction * 100) })}` : ''}
              </Text>
            </View>
            <Text style={[styles.positionMeta, align]}>{t('positionAt', { time: clock(playheadMs) })}</Text>
            <View style={styles.track}>
              <View style={[styles.heard, { width: `${heardFraction * 100}%` }]} />
              <View style={[styles.position, { left: `${positionFraction * 100}%` }]} />
            </View>
            {item.missing ? (
              <View style={styles.missingRow}>
                <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
                <Text style={styles.missing}>{t('fileMissing')}</Text>
              </View>
            ) : null}
          </View>
          <Ionicons name={directionalIcon('chevron-forward', isRtl)} size={20} color={colors.muted} style={styles.chevron} />
        </View>
      </AppPressable>
      <View style={styles.actions}>
        {item.missing ? (
          <Pressable
            accessibilityRole="button"
            disabled={busy}
            onPress={() => onLocate(item.id)}
            style={styles.actionBtn}
          >
            <Ionicons name="locate-outline" size={16} color={colors.accent} />
            <Text style={styles.actionText}>{t('locate')}</Text>
          </Pressable>
        ) : null}
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('resetFor', { title })}
          onPress={() => onReset(item)}
          style={styles.actionBtn}
        >
          <Ionicons name="refresh-outline" size={16} color={colors.muted} />
          <Text style={styles.actionText}>{t('reset')}</Text>
        </Pressable>
        <Pressable
          accessibilityRole="button"
          onPress={() => onDelete(item, pending)}
          style={[styles.actionBtn, pending && styles.actionBtnDanger]}
        >
          <Ionicons
            name={pending ? 'warning-outline' : 'trash-outline'}
            size={16}
            color={pending ? colors.danger : colors.muted}
          />
          <Text style={[styles.actionText, pending && styles.dangerText]}>{pending ? t('confirm') : t('delete')}</Text>
        </Pressable>
      </View>
    </View>
  );
});

function summaryText(summary: ImportSummary, t: ReturnType<typeof useI18n>['t']): string {
  const parts = [
    summary.added ? t('added', { count: summary.added }) : '',
    summary.updated ? t('updatedCount', { count: summary.updated }) : '',
    summary.unreadable ? t('unreadableCount', { count: summary.unreadable }) : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : t('noAudioInSelection');
}

export function LibraryScreen({
  navigation,
  playerItemId,
  playerTitle,
  onPlayerContext,
}: LibraryScreenProps) {
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [resume, setResume] = useState<AudioItem[]>([]);
  const [todayMs, setTodayMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [resetTarget, setResetTarget] = useState<AudioItem | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
  const [languageOpen, setLanguageOpen] = useState(false);
  const [live, setLive] = useState<{ itemId: string; positionMs: number } | null>(null);
  const { t, clock, hours, align, language } = useI18n();
  const playing = useIsPlaying();
  const todayRangesRef = useRef<StoredRange[]>([]);
  const openStartRef = useRef<number | null | undefined>(undefined);
  const playerItemIdRef = useRef(playerItemId);
  playerItemIdRef.current = playerItemId;

  useEffect(() => {
    const handle = setTimeout(() => setApplied(query), 200);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const loaded = loadLibrary(applied);
    openStartRef.current = currentOpenListen()?.range.startMs ?? null;
    todayRangesRef.current = loaded.todayRanges;
    setRows(loaded.rows);
    setResume(loaded.resume);
    setTodayMs(loaded.todayMs);
  }, [applied, revision]);

  const libraryKey = useMemo(
    () => rows.map((row) => `${row.item.id}:${row.item.uri}:${row.item.missing}`).join('|'),
    [rows],
  );

  useEffect(() => {
    let cancelled = false;
    void refreshPresence(rows.map((row) => row.item)).then((changed) => {
      if (!cancelled && changed) {
        setRevision((value) => value + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [libraryKey]);

  useEffect(() => {
    let cancelled = false;
    const unsubscribe = subscribeListenProgress((update) => {
      const open = update.open;
      const start = open?.startMs ?? null;
      const refresh = start !== openStartRef.current;
      openStartRef.current = start;
      if (open) {
        const positionMs = open.endMs;
        setLive((current) => {
          if (
            current &&
            current.itemId === update.itemId &&
            Math.floor(current.positionMs / 1000) === Math.floor(positionMs / 1000)
          ) {
            return current;
          }
          return { itemId: update.itemId, positionMs };
        });
      } else {
        queueMicrotask(() => {
          if (!cancelled) {
            setResume(continueListening());
          }
        });
      }
      const stored = refresh ? rangesForItem(update.itemId) : null;
      if (refresh) {
        todayRangesRef.current = rangesSince(startOfToday());
      }
      setRows((current) => {
        const index = current.findIndex((row) => row.item.id === update.itemId);
        if (index < 0) {
          return current;
        }
        const row = current[index]!;
        const ranges = stored ?? row.ranges;
        const positionMs = open?.endMs ?? row.item.positionMs;
        const heard = listenedFraction(
          projectHeardRanges(ranges, open, positionMs, open != null),
          row.item.durationMs,
        );
        if (ranges === row.ranges && Math.round(heard * 100) === Math.round(row.heard * 100)) {
          return current;
        }
        const next = current.slice();
        next[index] = { ...row, ranges, heard };
        return next;
      });
      const liveOpen = currentOpenListen();
      const include =
        open && liveOpen?.itemId === update.itemId && liveOpen.sessionAt >= startOfToday() ? open : null;
      const nextToday = coveredMs(
        projectHeardRanges(todayRangesRef.current, include, include?.endMs ?? 0, include != null),
      );
      setTodayMs((current) => (displayedMinutes(current) === displayedMinutes(nextToday) ? current : nextToday));
    });
    return () => {
      cancelled = true;
      unsubscribe();
    };
  }, []);

  const openItem = useCallback(
    (item: AudioItem) => {
      actionHaptic();
      onPlayerContext(item.id, item.title);
      navigation.navigate({ name: 'Player', params: { itemId: item.id }, merge: false });
    },
    [navigation, onPlayerContext],
  );

  async function onImport(): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      const summary = await importAudioFiles();
      if (summary) {
        setStatus(summaryText(summary, t));
        setRevision((value) => value + 1);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : t('couldNotImport'));
    } finally {
      setBusy(false);
    }
  }

  const onLocate = useCallback(
    (itemId: string) => {
      void (async () => {
        setBusy(true);
        try {
          const found = await locateAudioFile(itemId);
          setStatus(found ? t('fileLinked') : t('couldNotReadFile'));
          setRevision((value) => value + 1);
        } catch (error) {
          setStatus(error instanceof Error ? error.message : t('couldNotLocate'));
        } finally {
          setBusy(false);
        }
      })();
    },
    [t],
  );

  const onReset = useCallback((item: AudioItem) => {
    setResetTarget(item);
  }, []);

  const onDelete = useCallback(
    (item: AudioItem, pending: boolean) => {
      if (!pending) {
        setPendingDeleteId(item.id);
        return;
      }
      deleteItem(item.id);
      setPendingDeleteId(null);
      if (playerItemIdRef.current === item.id) {
        onPlayerContext(null, null);
      }
      setRevision((value) => value + 1);
    },
    [onPlayerContext],
  );

  const renderLesson = useCallback(
    ({ item: row }: { item: Row }) => {
      const active = playerItemId === row.item.id;
      const liveHere = active && live?.itemId === row.item.id;
      return (
        <LibraryCard
          item={row.item}
          ranges={row.ranges}
          heard={row.heard}
          active={active}
          playing={active && playing}
          positionMs={liveHere && live ? live.positionMs : row.item.positionMs}
          pending={pendingDeleteId === row.item.id}
          busy={busy}
          onOpen={openItem}
          onLocate={onLocate}
          onReset={onReset}
          onDelete={onDelete}
        />
      );
    },
    [playerItemId, live, playing, pendingDeleteId, busy, openItem, onLocate, onReset, onDelete],
  );

  return (
    <ScreenBackdrop>
      <View style={styles.screen}>
      <ScreenHeader
        title={t('appName')}
        subtitle={t('todayListened', { time: hours(todayMs) })}
        onMenu={() => setMenuOpen(true)}
        actions={[
          {
            icon: 'add-circle-outline',
            label: t('importAudio'),
            disabled: busy,
            onPress: () => void onImport(),
          },
        ]}
      />
      <NavigationMenu
        visible={menuOpen}
        onClose={() => setMenuOpen(false)}
        items={[
          {
            icon: 'folder-open-outline',
            label: t('importAudio'),
            detail: t('addFiles'),
            disabled: busy,
            onPress: () => void onImport(),
          },
          {
            icon: 'headset-outline',
            label: t('nowPlaying'),
            detail: playerTitle ? displayTitle(playerTitle, 32, t('untitled')) : t('openLessonFirst'),
            disabled: !playerItemId,
            onPress: () => {
              if (playerItemId) {
                navigation.navigate({ name: 'Player', params: { itemId: playerItemId }, merge: false });
              }
            },
          },
          {
            icon: 'time-outline',
            label: t('todaysListening'),
            detail: hours(todayMs),
            disabled: true,
            onPress: () => undefined,
          },
          {
            icon: 'albums-outline',
            label: t('listeningHistory'),
            detail: t('portionsYouHeard'),
            onPress: () => navigation.navigate({ name: 'ListenHistory', params: {}, merge: false }),
          },
          {
            icon: 'language-outline',
            label: t('language'),
            detail: language ? `${language.flag} ${language.nativeName}` : undefined,
            onPress: () => setLanguageOpen(true),
          },
          {
            icon: 'information-circle-outline',
            label: t('about'),
            detail: t('aboutMenuDetail'),
            onPress: () => setAboutOpen(true),
          },
        ]}
      />
      <AboutSheet visible={aboutOpen} onClose={() => setAboutOpen(false)} />
      <LanguageSheet visible={languageOpen} onClose={() => setLanguageOpen(false)} />
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.muted} style={styles.searchIcon} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder={t('searchTitles')}
            placeholderTextColor={colors.muted}
            style={[styles.search, align]}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </View>
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void onImport()}
          style={[styles.importChip, busy && styles.disabled]}
        >
          <Ionicons name="folder-open-outline" size={18} color={colors.background} />
          <Text style={styles.importText}>{busy ? t('working') : t('import')}</Text>
        </Pressable>
      </View>
      {status ? <InlineBanner message={status} tone="success" onDismiss={() => setStatus(null)} /> : null}
      <FlashList
        data={rows}
        keyExtractor={(row) => row.item.id}
        style={styles.list}
        contentContainerStyle={[
          styles.listContent,
          playerItemId ? styles.listContentWithDock : null,
        ]}
        ListHeaderComponent={
          <>
            {resume.length ? (
              <View style={styles.resumeBlock}>
                <Text style={[styles.section, align]}>{t('continueListening')}</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.resumeScroll}>
                  {resume.map((item) => {
                    const liveHere = item.id === playerItemId && live?.itemId === item.id;
                    const resumeMs = liveHere && live ? live.positionMs : item.positionMs;
                    return (
                      <AppPressable key={item.id} haptic onPress={() => openItem(item)} style={styles.resumeCard}>
                        <ArtworkAvatar title={item.title} size={36} />
                        <Text numberOfLines={2} style={[styles.resumeTitle, align]}>
                          {displayTitle(item.title, 44, t('untitled'))}
                        </Text>
                        <Text style={[styles.meta, align]}>{t('resumeAt', { time: clock(resumeMs) })}</Text>
                      </AppPressable>
                    );
                  })}
                </ScrollView>
              </View>
            ) : null}
            {rows.length ? (
              <Text style={[styles.listHeading, align]}>
                {t('allLessons', { count: rows.length })}
              </Text>
            ) : null}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="musical-notes-outline" size={40} color={colors.line} />
            <Text style={styles.emptyTitle}>{applied.trim() ? t('noMatches') : t('libraryEmpty')}</Text>
            <Text style={styles.empty}>
              {applied.trim() ? t('tryDifferentSearch') : t('emptyLibraryBody')}
            </Text>
          </View>
        }
        extraData={live?.positionMs ?? null}
        renderItem={renderLesson}
      />
      <ResetProgressSheet
        visible={resetTarget != null}
        title={resetTarget?.title ?? ''}
        onCancel={() => setResetTarget(null)}
        onConfirm={() => {
          if (!resetTarget) {
            return;
          }
          resetItemPlayback(resetTarget.id);
          setResetTarget(null);
          setRevision((value) => value + 1);
        }}
      />
      {playerItemId && playerTitle ? (
        <PlaybackDock
          variant="mini"
          title={playerTitle}
          onOpen={() => {
            if (playerItemId) {
              navigation.navigate({ name: 'Player', params: { itemId: playerItemId }, merge: false });
            }
          }}
        />
      ) : null}
      </View>
    </ScreenBackdrop>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  toolbar: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
  },
  searchWrap: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    backgroundColor: colors.card,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  searchIcon: {
    marginEnd: spacing.sm,
  },
  search: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
    paddingVertical: spacing.sm,
  },
  importChip: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    minHeight: 48,
  },
  disabled: {
    opacity: 0.6,
  },
  importText: {
    color: colors.background,
    fontSize: 15,
    fontWeight: '700',
  },
  listHeading: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    letterSpacing: 0.3,
    textTransform: 'uppercase',
    marginBottom: spacing.sm,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
  },
  listContentWithDock: {
    paddingBottom: 96,
  },
  resumeBlock: {
    marginBottom: spacing.lg,
    gap: spacing.sm,
  },
  section: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  resumeScroll: {
    gap: spacing.sm,
    paddingEnd: spacing.sm,
  },
  resumeCard: {
    width: 168,
    minHeight: 120,
    backgroundColor: colors.cardRaised,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginEnd: spacing.sm,
  },
  resumeTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
    flex: 1,
  },
  emptyWrap: {
    alignItems: 'center',
    paddingTop: spacing.xxl,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  emptyTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '600',
  },
  empty: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    textAlign: 'center',
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    marginBottom: spacing.md,
    padding: spacing.md,
    gap: spacing.sm,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  cardActive: {
    borderColor: colors.accent,
    backgroundColor: '#1A2838',
  },
  cardMain: {
    gap: spacing.sm,
  },
  cardRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.md,
  },
  cardBody: {
    flex: 1,
    gap: 4,
  },
  titleRow: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    gap: spacing.sm,
  },
  nowBadge: {
    backgroundColor: colors.accentSoft,
    borderRadius: radii.pill,
    paddingHorizontal: 8,
    paddingVertical: 2,
    marginTop: 2,
  },
  nowBadgeText: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
  },
  metaRow: {
    flexDirection: 'row',
    alignItems: 'center',
    flexWrap: 'wrap',
    gap: 6,
  },
  formatPill: {
    color: colors.accent,
    fontSize: 11,
    fontWeight: '700',
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 8,
    paddingVertical: 2,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  cardTitle: {
    flex: 1,
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
    lineHeight: 22,
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
  },
  positionMeta: {
    color: colors.muted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  track: {
    direction: 'ltr',
    height: 6,
    borderRadius: 3,
    backgroundColor: colors.line,
    overflow: 'hidden',
    marginTop: 4,
  },
  heard: {
    height: 6,
    backgroundColor: colors.heard,
  },
  position: {
    position: 'absolute',
    width: 2,
    height: 6,
    backgroundColor: colors.white,
  },
  missingRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
    marginTop: 2,
  },
  missing: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  chevron: {
    marginTop: 14,
  },
  actions: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    paddingTop: spacing.sm,
  },
  actionBtn: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    paddingHorizontal: spacing.sm,
    minHeight: 36,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  actionBtnDanger: {
    backgroundColor: 'rgba(240, 164, 164, 0.12)',
  },
  actionText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '600',
  },
  dangerText: {
    color: colors.danger,
  },
});

import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { useIsPlaying, useProgress } from '@rntp/player';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  continueListening,
  deleteItem,
  listItems,
  rangesForItem,
  rangesSince,
} from '../db/library';
import type { AudioItem } from '../db/types';
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

function loadLibrary(query: string): { rows: Row[]; resume: AudioItem[]; todayMs: number } {
  const rows = listItems(query).map((item) => ({
    item,
    heard: listenedFraction(rangesForItem(item.id), item.durationMs),
  }));
  return {
    rows,
    resume: query.trim() ? [] : continueListening(),
    todayMs: coveredMs(rangesSince(startOfToday())),
  };
}

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
  const { t, clock, hours, isRtl, align, language } = useI18n();
  const playing = useIsPlaying();
  const progress = useProgress(playing ? 0.5 : 30);
  const livePositionMs = progress.position * 1000;

  useEffect(() => {
    const handle = setTimeout(() => setApplied(query), 200);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const loaded = loadLibrary(applied);
    setRows(loaded.rows);
    setResume(loaded.resume);
    setTodayMs(loaded.todayMs);
  }, [applied, revision]);

  const libraryKey = rows.map((row) => `${row.item.id}:${row.item.uri}:${row.item.missing}`).join('|');

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
    return subscribeListenProgress((update) => {
      setRows((current) => {
        let changed = false;
        const next = current.map((row) => {
          if (row.item.id !== update.itemId) {
            return row;
          }
          const heard = listenedFraction(rangesForItem(update.itemId), row.item.durationMs);
          if (heard === row.heard) {
            return row;
          }
          changed = true;
          return { ...row, heard };
        });
        return changed ? next : current;
      });
      setTodayMs(coveredMs(rangesSince(startOfToday())));
      setResume(continueListening());
    });
  }, []);

  const todayLabelMs = useMemo(() => {
    if (!playing) {
      return todayMs;
    }
    const open = currentOpenListen();
    const include = open && open.sessionAt >= startOfToday() ? open.range : null;
    return coveredMs(projectHeardRanges(rangesSince(startOfToday()), include, livePositionMs, include != null));
  }, [playing, livePositionMs, todayMs]);

  function openItem(item: AudioItem): void {
    actionHaptic();
    onPlayerContext(item.id, item.title);
    navigation.navigate({ name: 'Player', params: { itemId: item.id }, merge: false });
  }

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

  async function onLocate(itemId: string): Promise<void> {
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
  }

  return (
    <ScreenBackdrop>
      <View style={styles.screen}>
      <ScreenHeader
        title="AudioNote"
        subtitle={t('todayListened', { time: hours(todayLabelMs) })}
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
            detail: hours(todayLabelMs),
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
            detail: language?.nativeName,
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
                    const resumeMs = item.id === playerItemId ? livePositionMs : item.positionMs;
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
        renderItem={({ item: row }) => {
          const { item, heard } = row;
          const isActive = playerItemId === item.id;
          const rowPositionMs = isActive ? livePositionMs : item.positionMs;
          const positionFraction =
            item.durationMs && item.durationMs > 0 ? Math.min(1, rowPositionMs / item.durationMs) : 0;
          const open = isActive ? currentOpenListen() : null;
          const heardFraction =
            isActive && playing && item.durationMs
              ? listenedFraction(
                  projectHeardRanges(
                    rangesForItem(item.id),
                    open?.itemId === item.id ? open.range : null,
                    livePositionMs,
                    true,
                  ),
                  item.durationMs,
                )
              : heard;
          return (
            <View style={[styles.card, isActive && styles.cardActive, elevation.card]}>
              <AppPressable accessibilityRole="button" haptic onPress={() => openItem(item)} style={styles.cardMain}>
                <View style={styles.cardRow}>
                  <ArtworkAvatar title={item.title} size={52} />
                  <View style={styles.cardBody}>
                    <View style={styles.titleRow}>
                      <Text numberOfLines={2} style={[styles.cardTitle, align]}>
                        {displayTitle(item.title, 44, t('untitled'))}
                      </Text>
                      {isActive ? (
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
                    <Text style={[styles.positionMeta, align]}>{t('positionAt', { time: clock(rowPositionMs) })}</Text>
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
                    onPress={() => void onLocate(item.id)}
                    style={styles.actionBtn}
                  >
                    <Ionicons name="locate-outline" size={16} color={colors.accent} />
                    <Text style={styles.actionText}>{t('locate')}</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  accessibilityLabel={t('resetFor', { title: displayTitle(item.title, 44, t('untitled')) })}
                  onPress={() => setResetTarget(item)}
                  style={styles.actionBtn}
                >
                  <Ionicons name="refresh-outline" size={16} color={colors.muted} />
                  <Text style={styles.actionText}>{t('reset')}</Text>
                </Pressable>
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    if (pendingDeleteId === item.id) {
                      deleteItem(item.id);
                      setPendingDeleteId(null);
                      if (playerItemId === item.id) {
                        onPlayerContext(null, null);
                      }
                      setRevision((value) => value + 1);
                    } else {
                      setPendingDeleteId(item.id);
                    }
                  }}
                  style={[styles.actionBtn, pendingDeleteId === item.id && styles.actionBtnDanger]}
                >
                  <Ionicons
                    name={pendingDeleteId === item.id ? 'warning-outline' : 'trash-outline'}
                    size={16}
                    color={pendingDeleteId === item.id ? colors.danger : colors.muted}
                  />
                  <Text style={[styles.actionText, pendingDeleteId === item.id && styles.dangerText]}>
                    {pendingDeleteId === item.id ? t('confirm') : t('delete')}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        }}
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

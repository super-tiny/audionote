import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useState } from 'react';
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
import { coveredMs, listenedFraction } from '../library/ranges';
import { formatClock, formatHours } from '../notes/capture';
import type { RootStackParamList } from '../navigation/types';
import { AppPressable } from '../ui/AppPressable';
import { ArtworkAvatar } from '../ui/ArtworkAvatar';
import { displayTitle } from '../ui/displayTitle';
import { InlineBanner } from '../ui/InlineBanner';
import { PlaybackDock } from '../ui/PlaybackDock';
import { AboutSheet } from '../ui/AboutSheet';
import { NavigationMenu } from '../ui/NavigationMenu';
import { ScreenBackdrop } from '../ui/ScreenBackdrop';
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

function summaryText(summary: ImportSummary): string {
  const parts = [
    summary.added ? `Added ${summary.added}` : '',
    summary.updated ? `Updated ${summary.updated}` : '',
    summary.unreadable ? `Unreadable ${summary.unreadable}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No audio files in that selection.';
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
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);

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
  }, [rows]);

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
        setStatus(summaryText(summary));
        setRevision((value) => value + 1);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not import audio.');
    } finally {
      setBusy(false);
    }
  }

  async function onLocate(itemId: string): Promise<void> {
    setBusy(true);
    try {
      const found = await locateAudioFile(itemId);
      setStatus(found ? 'File linked. Notes stay on this lesson.' : 'Could not read that file.');
      setRevision((value) => value + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not locate the file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <ScreenBackdrop>
      <View style={styles.screen}>
      <ScreenHeader
        title="AudioNote"
        subtitle={`Today · ${formatHours(todayMs)} listened`}
        onMenu={() => setMenuOpen(true)}
        actions={[
          {
            icon: 'add-circle-outline',
            label: 'Import audio',
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
            label: 'Import audio',
            detail: 'Add files from your device',
            disabled: busy,
            onPress: () => void onImport(),
          },
          {
            icon: 'headset-outline',
            label: 'Now playing',
            detail: playerTitle ? displayTitle(playerTitle, 32) : 'Open a lesson first',
            disabled: !playerItemId,
            onPress: () => {
              if (playerItemId) {
                navigation.navigate({ name: 'Player', params: { itemId: playerItemId }, merge: false });
              }
            },
          },
          {
            icon: 'time-outline',
            label: "Today's listening",
            detail: formatHours(todayMs),
            disabled: true,
            onPress: () => undefined,
          },
          {
            icon: 'albums-outline',
            label: 'Listening history',
            detail: 'Portions you have heard',
            onPress: () => navigation.navigate({ name: 'ListenHistory', params: {}, merge: false }),
          },
          {
            icon: 'information-circle-outline',
            label: 'About AudioNote',
            detail: 'GitHub, contribute, issues, features',
            onPress: () => setAboutOpen(true),
          },
        ]}
      />
      <AboutSheet visible={aboutOpen} onClose={() => setAboutOpen(false)} />
      <View style={styles.toolbar}>
        <View style={styles.searchWrap}>
          <Ionicons name="search" size={18} color={colors.muted} style={styles.searchIcon} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search titles"
            placeholderTextColor={colors.muted}
            style={styles.search}
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
          <Text style={styles.importText}>{busy ? 'Working…' : 'Import'}</Text>
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
                <Text style={styles.section}>Continue listening</Text>
                <ScrollView horizontal showsHorizontalScrollIndicator={false} contentContainerStyle={styles.resumeScroll}>
                  {resume.map((item) => (
                    <AppPressable key={item.id} haptic onPress={() => openItem(item)} style={styles.resumeCard}>
                      <ArtworkAvatar title={item.title} size={36} />
                      <Text numberOfLines={2} style={styles.resumeTitle}>
                        {displayTitle(item.title)}
                      </Text>
                      <Text style={styles.meta}>Resume at {formatClock(item.positionMs)}</Text>
                    </AppPressable>
                  ))}
                </ScrollView>
              </View>
            ) : null}
            {rows.length ? (
              <Text style={styles.listHeading}>
                All lessons · {rows.length}
              </Text>
            ) : null}
          </>
        }
        ListEmptyComponent={
          <View style={styles.emptyWrap}>
            <Ionicons name="musical-notes-outline" size={40} color={colors.line} />
            <Text style={styles.emptyTitle}>{applied.trim() ? 'No matches' : 'Your library is empty'}</Text>
            <Text style={styles.empty}>
              {applied.trim()
                ? 'Try a different search term.'
                : 'Import a lesson. Files stay where they are, and notes stay with each entry.'}
            </Text>
          </View>
        }
        renderItem={({ item: row }) => {
          const { item, heard } = row;
          const positionFraction =
            item.durationMs && item.durationMs > 0 ? Math.min(1, item.positionMs / item.durationMs) : 0;
          const isActive = playerItemId === item.id;
          return (
            <View style={[styles.card, isActive && styles.cardActive, elevation.card]}>
              <AppPressable accessibilityRole="button" haptic onPress={() => openItem(item)} style={styles.cardMain}>
                <View style={styles.cardRow}>
                  <ArtworkAvatar title={item.title} size={52} />
                  <View style={styles.cardBody}>
                    <View style={styles.titleRow}>
                      <Text numberOfLines={2} style={styles.cardTitle}>
                        {displayTitle(item.title)}
                      </Text>
                      {isActive ? (
                        <View style={styles.nowBadge}>
                          <Text style={styles.nowBadgeText}>Playing</Text>
                        </View>
                      ) : null}
                    </View>
                    <View style={styles.metaRow}>
                      <Text style={styles.formatPill}>{(item.format ?? 'audio').toUpperCase()}</Text>
                      <Text style={styles.meta}>
                        {item.durationMs ? formatClock(item.durationMs) : '—'}
                        {item.durationMs ? ` · ${Math.round(heard * 100)}% heard` : ''}
                      </Text>
                    </View>
                    <Text style={styles.positionMeta}>Position · {formatClock(item.positionMs)}</Text>
                    <View style={styles.track}>
                      <View style={[styles.heard, { width: `${heard * 100}%` }]} />
                      <View style={[styles.position, { left: `${positionFraction * 100}%` }]} />
                    </View>
                    {item.missing ? (
                      <View style={styles.missingRow}>
                        <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
                        <Text style={styles.missing}>File missing</Text>
                      </View>
                    ) : null}
                  </View>
                  <Ionicons name="chevron-forward" size={20} color={colors.muted} style={styles.chevron} />
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
                    <Text style={styles.actionText}>Locate</Text>
                  </Pressable>
                ) : null}
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
                    {pendingDeleteId === item.id ? 'Confirm' : 'Delete'}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
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
    marginRight: spacing.sm,
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
    paddingRight: spacing.sm,
  },
  resumeCard: {
    width: 168,
    minHeight: 120,
    backgroundColor: colors.cardRaised,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginRight: spacing.sm,
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

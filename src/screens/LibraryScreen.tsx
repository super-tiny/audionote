import { Ionicons } from '@expo/vector-icons';
import { FlashList } from '@shopify/flash-list';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useState } from 'react';
import { useIsPlaying, useProgress } from '@rntp/player';
import { TextInput } from 'react-native';
import { ScrollView, Text, XStack, YStack } from 'tamagui';

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
import { formatClock, formatHours } from '../notes/capture';
import type { RootStackParamList } from '../navigation/types';
import { resetItemPlayback } from '../playback/resetItem';
import { AppPressable } from '../ui/AppPressable';
import { ArtworkAvatar } from '../ui/ArtworkAvatar';
import { displayTitle } from '../ui/displayTitle';
import { InlineBanner } from '../ui/InlineBanner';
import { PlaybackDock } from '../ui/PlaybackDock';
import { AboutSheet } from '../ui/AboutSheet';
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
  const [resetTarget, setResetTarget] = useState<AudioItem | null>(null);
  const [menuOpen, setMenuOpen] = useState(false);
  const [aboutOpen, setAboutOpen] = useState(false);
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
      <YStack style={{ flex: 1, backgroundColor: colors.background }}>
      <ScreenHeader
        title="AudioNote"
        subtitle={`Today · ${formatHours(todayLabelMs)} listened`}
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
            detail: formatHours(todayLabelMs),
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
      <XStack style={{ alignItems: 'center', paddingHorizontal: spacing.lg, paddingBottom: spacing.sm, gap: spacing.sm }}>
        <XStack
          backgroundColor="card"
          style={{
            flex: 1,
            alignItems: 'center',
            borderRadius: radii.md,
            paddingHorizontal: spacing.md,
            minHeight: 48,
          }}
        >
          <Ionicons name="search" size={18} color={colors.muted} style={{ marginRight: spacing.sm }} />
          <TextInput
            value={query}
            onChangeText={setQuery}
            placeholder="Search titles"
            placeholderTextColor={colors.muted}
            style={{ flex: 1, color: colors.text, fontSize: 16, paddingVertical: spacing.sm }}
            autoCorrect={false}
            autoCapitalize="none"
            clearButtonMode="while-editing"
          />
        </XStack>
        <AppPressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void onImport()}
          style={{
            flexDirection: 'row',
            alignItems: 'center',
            backgroundColor: colors.accent,
            borderRadius: radii.md,
            paddingHorizontal: spacing.md,
            minHeight: 48,
            opacity: busy ? 0.6 : 1,
            gap: 6,
          }}
        >
          <Ionicons name="folder-open-outline" size={18} color="background" />
          <Text color={colors.background} fontSize={15} fontWeight="700">
            {busy ? 'Working…' : 'Import'}
          </Text>
        </AppPressable>
      </XStack>
      {status ? <InlineBanner message={status} tone="success" onDismiss={() => setStatus(null)} /> : null}
      <FlashList
        data={rows}
        keyExtractor={(row) => row.item.id}
        style={{ flex: 1 }}
        contentContainerStyle={{
          paddingHorizontal: spacing.lg,
          paddingBottom: playerItemId ? 96 : spacing.md,
        }}
        ListHeaderComponent={
          <>
            {resume.length ? (
              <YStack style={{ marginBottom: spacing.lg, gap: spacing.sm }}>
                <Text color="text" fontSize={17} fontWeight="600">
                  Continue listening
                </Text>
                <ScrollView
                  horizontal
                  showsHorizontalScrollIndicator={false}
                  contentContainerStyle={{ gap: spacing.sm, paddingRight: spacing.sm }}
                >
                  {resume.map((item) => {
                    const resumeMs = item.id === playerItemId ? livePositionMs : item.positionMs;
                    return (
                      <AppPressable
                        key={item.id}
                        haptic
                        onPress={() => openItem(item)}
                        style={{
                          width: 168,
                          minHeight: 120,
                          backgroundColor: colors.cardRaised,
                          borderRadius: radii.lg,
                          padding: spacing.md,
                          marginRight: spacing.sm,
                          gap: spacing.sm,
                        }}
                      >
                        <ArtworkAvatar title={item.title} size={36} />
                        <Text numberOfLines={2} color="text" fontSize={14} fontWeight="600" style={{ flex: 1 }}>
                          {displayTitle(item.title)}
                        </Text>
                        <Text color="muted" fontSize={13}>
                          Resume at {formatClock(resumeMs)}
                        </Text>
                      </AppPressable>
                    );
                  })}
                </ScrollView>
              </YStack>
            ) : null}
            {rows.length ? (
              <Text
                color="muted"
                fontSize={13}
                fontWeight="600"
                letterSpacing={0.3}
                textTransform="uppercase"
                style={{ marginBottom: spacing.sm }}
              >
                All lessons · {rows.length}
              </Text>
            ) : null}
          </>
        }
        ListEmptyComponent={
          <YStack style={{ alignItems: 'center', paddingTop: spacing.xxl, paddingHorizontal: spacing.lg, gap: spacing.sm }}>
            <Ionicons name="musical-notes-outline" size={40} color={colors.line} />
            <Text color="text" fontSize={18} fontWeight="600">
              {applied.trim() ? 'No matches' : 'Your library is empty'}
            </Text>
            <Text color="muted" fontSize={15} lineHeight={22} style={{ textAlign: 'center' }}>
              {applied.trim()
                ? 'Try a different search term.'
                : 'Import a lesson. Files stay where they are, and notes stay with each entry.'}
            </Text>
          </YStack>
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
            <YStack
              style={{
                backgroundColor: isActive ? '#1A2838' : colors.card,
                borderRadius: radii.lg,
                marginBottom: spacing.md,
                padding: spacing.md,
                borderWidth: 0.5,
                borderColor: isActive ? colors.accent : colors.line,
                gap: spacing.sm,
                ...elevation.card,
              }}
            >
              <AppPressable accessibilityRole="button" haptic onPress={() => openItem(item)} style={{ gap: spacing.sm }}>
                <XStack style={{ alignItems: 'flex-start', gap: spacing.md }}>
                  <ArtworkAvatar title={item.title} size={52} />
                  <YStack style={{ flex: 1, gap: 4 }}>
                    <XStack style={{ alignItems: 'flex-start', gap: spacing.sm }}>
                      <Text numberOfLines={2} color="text" fontSize={17} fontWeight="600" lineHeight={22} style={{ flex: 1 }}>
                        {displayTitle(item.title)}
                      </Text>
                      {isActive ? (
                        <YStack
                          backgroundColor="accentSoft"
                          style={{ borderRadius: radii.pill, paddingHorizontal: 8, paddingVertical: 2, marginTop: 2 }}
                        >
                          <Text color="accent" fontSize={11} fontWeight="700">
                            Playing
                          </Text>
                        </YStack>
                      ) : null}
                    </XStack>
                    <XStack style={{ alignItems: 'center', flexWrap: 'wrap', gap: 6 }}>
                      <YStack
                        backgroundColor="accentSoft"
                        style={{ paddingHorizontal: 8, paddingVertical: 2, borderRadius: radii.pill, overflow: 'hidden' }}
                      >
                        <Text color="accent" fontSize={11} fontWeight="700">
                          {(item.format ?? 'audio').toUpperCase()}
                        </Text>
                      </YStack>
                      <Text color="muted" fontSize={13}>
                        {item.durationMs ? formatClock(item.durationMs) : '—'}
                        {item.durationMs ? ` · ${Math.round(heardFraction * 100)}% heard` : ''}
                      </Text>
                    </XStack>
                    <Text color="muted" fontSize={12} fontVariant={['tabular-nums']}>
                      Position · {formatClock(rowPositionMs)}
                    </Text>
                    <YStack
                      style={{
                        height: 6,
                        borderRadius: 3,
                        backgroundColor: colors.line,
                        overflow: 'hidden',
                        marginTop: 4,
                      }}
                    >
                      <YStack backgroundColor="heard" style={{ height: 6, width: `${heardFraction * 100}%` }} />
                      <YStack
                        style={{
                          position: 'absolute',
                          width: 2,
                          height: 6,
                          backgroundColor: colors.white,
                          left: `${positionFraction * 100}%`,
                        }}
                      />
                    </YStack>
                    {item.missing ? (
                      <XStack style={{ alignItems: 'center', marginTop: 2, gap: 4 }}>
                        <Ionicons name="alert-circle-outline" size={14} color={colors.danger} />
                        <Text color="danger" fontSize={13} fontWeight="600">
                          File missing
                        </Text>
                      </XStack>
                    ) : null}
                  </YStack>
                  <YStack style={{ marginTop: 14 }}>
                    <Ionicons name="chevron-forward" size={20} color={colors.muted} />
                  </YStack>
                </XStack>
              </AppPressable>
              <XStack
                style={{
                  flexWrap: 'wrap',
                  paddingTop: spacing.sm,
                  gap: spacing.sm,
                  borderTopWidth: 0.5,
                  borderTopColor: colors.line,
                }}
              >
                {item.missing ? (
                  <AppPressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void onLocate(item.id)}
                    style={{
                      flexDirection: 'row',
                      alignItems: 'center',
                      paddingHorizontal: spacing.sm,
                      minHeight: 36,
                      borderRadius: radii.sm,
                      backgroundColor: colors.surface,
                      gap: 6,
                    }}
                  >
                    <Ionicons name="locate-outline" size={16} color={colors.accent} />
                    <Text color="muted" fontSize={14} fontWeight="600">
                      Locate
                    </Text>
                  </AppPressable>
                ) : null}
                <AppPressable
                  accessibilityRole="button"
                  accessibilityLabel={`Reset playback progress for ${displayTitle(item.title)}`}
                  onPress={() => setResetTarget(item)}
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: spacing.sm,
                    minHeight: 36,
                    borderRadius: radii.sm,
                    backgroundColor: colors.surface,
                    gap: 6,
                  }}
                >
                  <Ionicons name="refresh-outline" size={16} color={colors.muted} />
                  <Text color="muted" fontSize={14} fontWeight="600">
                    Reset
                  </Text>
                </AppPressable>
                <AppPressable
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
                  style={{
                    flexDirection: 'row',
                    alignItems: 'center',
                    paddingHorizontal: spacing.sm,
                    minHeight: 36,
                    borderRadius: radii.sm,
                    backgroundColor: pendingDeleteId === item.id ? 'rgba(240, 164, 164, 0.12)' : colors.surface,
                    gap: 6,
                  }}
                >
                  <Ionicons
                    name={pendingDeleteId === item.id ? 'warning-outline' : 'trash-outline'}
                    size={16}
                    color={pendingDeleteId === item.id ? colors.danger : colors.muted}
                  />
                  <Text
                    color={pendingDeleteId === item.id ? "danger" : "muted"}
                    fontSize={14}
                    fontWeight="600"
                  >
                    {pendingDeleteId === item.id ? 'Confirm' : 'Delete'}
                  </Text>
                </AppPressable>
              </XStack>
            </YStack>
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
      </YStack>
    </ScreenBackdrop>
  );
}

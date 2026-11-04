import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsPlaying, useProgress } from '@rntp/player';
import { TextInput } from 'react-native';
import { ScrollView, Text, XStack, YStack } from 'tamagui';

import { clearJumps, deleteJump, listJumps } from '../db/jumps';
import {
  deleteNote,
  getItem,
  insertNote,
  listNotes,
  markMissing,
  rangesForItem,
} from '../db/library';
import type { AudioItem, Jump, Note } from '../db/types';
import { listenedFraction, projectHeardRanges, type ListenRange } from '../library/ranges';
import { locateAudioFile } from '../library/import';
import { createId } from '../media/identity';
import { formatClock, notePositionMs } from '../notes/capture';
import type { RootStackParamList } from '../navigation/types';
import {
  openItem,
  readSkips,
  seekToMs,
  setSpeed,
  startSleep,
  stopSleep,
  writeSkips,
} from '../playback/engine';
import {
  cancelPendingJump,
  flushJumpHistory,
  recordJumpSeek,
  revertJumpDrag,
  subscribeJumpHistory,
} from '../playback/jumpHistory';
import type { RecordedJumpSource } from '../playback/jumpRecord';
import { currentOpenListen, subscribeListenProgress } from '../playback/persist';
import { resetItemPlayback } from '../playback/resetItem';
import { AppPressable } from '../ui/AppPressable';
import { ArtworkAvatar } from '../ui/ArtworkAvatar';
import { displayTitle } from '../ui/displayTitle';
import { InlineBanner } from '../ui/InlineBanner';
import { JumpHistorySheet } from '../ui/JumpHistorySheet';
import { PlaybackDock } from '../ui/PlaybackDock';
import { PlaybackSettingsSheet, type LoopPoints } from '../ui/PlaybackSettingsSheet';
import { ResetProgressSheet } from '../ui/ResetProgressSheet';
import { ScreenBackdrop } from '../ui/ScreenBackdrop';
import { ScreenHeader } from '../ui/ScreenHeader';
import { actionHaptic } from '../ui/haptics';
import { colors, radii, spacing } from '../ui/theme';

const DOCK_SPACE = 168;

type PlayerScreenProps = NativeStackScreenProps<RootStackParamList, 'Player'> & {
  playerItemId: string | null;
  playerTitle: string | null;
  onPlayerContext: (itemId: string | null, title: string | null) => void;
};

export function PlayerScreen({ navigation, route, onPlayerContext }: PlayerScreenProps) {
  const { itemId, seekMs, seekToken } = route.params;
  const playing = useIsPlaying();
  const progress = useProgress(0.25);
  const [item, setItem] = useState<AudioItem | null>(() => getItem(itemId));
  const [notes, setNotes] = useState<Note[]>(() => listNotes(itemId));
  const [jumps, setJumps] = useState<Jump[]>(() => listJumps(itemId));
  const [jumpsOpen, setJumpsOpen] = useState(false);
  const [heard, setHeard] = useState<ListenRange[]>(() => rangesForItem(itemId));
  const [openListen, setOpenListen] = useState<ListenRange | null>(null);
  const [skips, setSkips] = useState(() => readSkips());
  const [speed, setSpeedState] = useState(item?.speed ?? 1);
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null);
  const [loop, setLoop] = useState<LoopPoints>({ aMs: null, bMs: null });
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [missing, setMissing] = useState(item?.missing ?? false);
  const [message, setMessage] = useState<string | null>(null);
  const [settingsOpen, setSettingsOpen] = useState(false);
  const [resetOpen, setResetOpen] = useState(false);
  const loopGuard = useRef(false);

  useEffect(() => {
    onPlayerContext(itemId, item?.title ?? null);
  }, [itemId, item?.title, onPlayerContext]);

  useEffect(() => {
    let cancelled = false;
    const current = getItem(itemId);
    setItem(current);
    setNotes(listNotes(itemId));
    setHeard(rangesForItem(itemId));
    if (current) {
      setSpeedState(current.speed || 1);
      void openItem(current)
        .then((opened) => {
          if (cancelled) {
            return;
          }
          markMissing(itemId, !opened);
          setMissing(!opened);
          setItem(getItem(itemId));
          if (!opened) {
            setMessage('The file is missing. Locate it and the notes stay on this lesson.');
            return;
          }
          if (seekToken != null && seekMs != null) {
            seekToMs(seekMs);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setMessage(error instanceof Error ? error.message : 'Could not start playback.');
          }
        });
    }
    return () => {
      cancelled = true;
      flushJumpHistory();
    };
  }, [itemId, seekMs, seekToken]);

  useEffect(() => {
    setJumps(listJumps(itemId));
    setJumpsOpen(false);
    return subscribeJumpHistory((jump) => {
      if (jump.itemId === itemId) {
        setJumps(listJumps(itemId));
      }
    });
  }, [itemId]);

  useEffect(() => {
    const unsubscribe = navigation.addListener('blur', () => {
      flushJumpHistory();
    });
    return unsubscribe;
  }, [navigation]);

  useEffect(() => {
    const apply = () => {
      setHeard(rangesForItem(itemId));
      const open = currentOpenListen();
      setOpenListen(open?.itemId === itemId ? open.range : null);
    };
    apply();
    const unsubscribe = subscribeListenProgress((update) => {
      if (update.itemId === itemId) {
        setHeard(rangesForItem(itemId));
        setOpenListen(update.open);
      }
    });
    const handle = setInterval(() => {
      apply();
      setItem(getItem(itemId));
    }, 5000);
    return () => {
      unsubscribe();
      clearInterval(handle);
    };
  }, [itemId]);

  const durationMs = Math.max(progress.duration * 1000, item?.durationMs ?? 0);
  const positionMs = scrubMs ?? progress.position * 1000;

  useEffect(() => {
    if (loop.aMs == null || loop.bMs == null || loop.bMs <= loop.aMs || !playing || scrubMs != null) {
      loopGuard.current = false;
      return;
    }
    if (positionMs >= loop.bMs && !loopGuard.current) {
      loopGuard.current = true;
      seekToMs(loop.aMs);
    } else if (positionMs < loop.bMs - 400) {
      loopGuard.current = false;
    }
  }, [positionMs, playing, loop, scrubMs]);

  function rememberJump(fromMs: number, toMs: number, source: RecordedJumpSource, commit: 'defer' | 'now' | 'hold'): void {
    recordJumpSeek({
      itemId,
      fromMs,
      toMs,
      source,
      commit: commit === 'hold' ? 'hold' : playing ? 'defer' : 'now',
    });
  }

  function restoreJump(jump: Jump): void {
    cancelPendingJump();
    setScrubMs(null);
    seekToMs(jump.fromMs);
  }

  function removeJump(jump: Jump): void {
    deleteJump(jump.id);
    setJumps((current) => current.filter((entry) => entry.id !== jump.id));
  }

  function clearJumpList(): void {
    clearJumps(itemId);
    setJumps([]);
  }

  function addNote(): void {
    const text = draft.trim();
    if (!text || !item) {
      return;
    }
    insertNote({
      id: createId(),
      itemId: item.id,
      positionMs: notePositionMs(positionMs),
      text,
      tags: '',
      createdAt: Date.now(),
    });
    setDraft('');
    setNotes(listNotes(item.id));
  }

  async function onLocate(): Promise<void> {
    const found = await locateAudioFile(itemId);
    if (!found) {
      setMessage('Could not read that file.');
      return;
    }
    const current = getItem(itemId);
    setItem(current);
    if (current) {
      const opened = await openItem(current);
      setMissing(!opened);
      setMessage(opened ? null : 'The file is still unreadable.');
    }
  }

  function confirmResetProgress(): void {
    resetItemPlayback(itemId);
    setHeard([]);
    setOpenListen(null);
    setJumps([]);
    setScrubMs(null);
    const current = getItem(itemId);
    setItem(current);
    if (current) {
      setSpeedState(current.speed || 1);
    }
    setResetOpen(false);
  }

  const visibleHeard = useMemo(
    () => projectHeardRanges(heard, openListen, positionMs, playing && scrubMs == null),
    [heard, openListen, positionMs, playing, scrubMs],
  );
  const heardFraction = listenedFraction(visibleHeard, durationMs);

  if (!item) {
    return (
      <ScreenBackdrop>
        <YStack style={{ flex: 1, backgroundColor: colors.background }}>
          <ScreenHeader title="Lesson unavailable" onBack={() => navigation.goBack()} backLabel="Library" />
          <Text color="danger" fontSize={15} lineHeight={22} style={{ paddingHorizontal: spacing.lg }}>
            This lesson is no longer in the library.
          </Text>
        </YStack>
      </ScreenBackdrop>
    );
  }

  return (
    <ScreenBackdrop>
      <YStack style={{ flex: 1, backgroundColor: colors.background }}>
        <ScreenHeader
          title=""
          onBack={() => navigation.goBack()}
          backLabel=""
          backIcon="chevron-down"
          actions={[
            {
              icon: 'time-outline',
              label: 'Listening history',
              onPress: () => navigation.navigate({ name: 'ListenHistory', params: { itemId }, merge: false }),
            },
            {
              icon: 'options-outline',
              label: 'Playback settings',
              onPress: () => setSettingsOpen(true),
            },
          ]}
        />
        <ScrollView
          contentContainerStyle={{
            paddingHorizontal: spacing.lg,
            paddingBottom: DOCK_SPACE,
            gap: spacing.md,
          }}
          keyboardShouldPersistTaps="handled"
        >
          <YStack style={{ alignItems: 'center', paddingTop: spacing.sm, paddingBottom: spacing.md, gap: spacing.md }}>
            <ArtworkAvatar title={item.title} size={200} />
            <Text color="text" fontSize={22} fontWeight="700" lineHeight={28} style={{ textAlign: 'center' }}>
              {displayTitle(item.title, 56)}
            </Text>
            <XStack style={{ flexWrap: 'wrap', justifyContent: 'center', gap: spacing.sm }}>
              <YStack
                backgroundColor="accentSoft"
                style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, overflow: 'hidden' }}
              >
                <Text color="accent" fontSize={12} fontWeight="700">
                  {(item.format ?? 'audio').toUpperCase()}
                </Text>
              </YStack>
              <YStack
                backgroundColor="accentSoft"
                style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, overflow: 'hidden' }}
              >
                <Text color="accent" fontSize={12} fontWeight="700">
                  {Math.round(heardFraction * 100)}% heard
                </Text>
              </YStack>
              <YStack
                backgroundColor="accentSoft"
                style={{ paddingHorizontal: 10, paddingVertical: 4, borderRadius: radii.pill, overflow: 'hidden' }}
              >
                <Text color="accent" fontSize={12} fontWeight="700">
                  {notes.length} notes
                </Text>
              </YStack>
              {missing ? (
                <YStack
                  style={{
                    paddingHorizontal: 10,
                    paddingVertical: 4,
                    borderRadius: radii.pill,
                    overflow: 'hidden',
                    backgroundColor: 'rgba(240, 164, 164, 0.14)',
                  }}
                >
                  <Text color="danger" fontSize={12} fontWeight="700">
                    Missing file
                  </Text>
                </YStack>
              ) : null}
            </XStack>
            <AppPressable
              accessibilityRole="button"
              accessibilityLabel="Reset playback progress"
              haptic
              onPress={() => setResetOpen(true)}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: 6,
                minHeight: 36,
                paddingHorizontal: spacing.md,
                borderRadius: radii.pill,
                backgroundColor: colors.card,
              }}
            >
              <Ionicons name="refresh-outline" size={16} color="muted" />
              <Text color="muted" fontSize={14} fontWeight="700">
                Reset progress
              </Text>
            </AppPressable>
          </YStack>

          {loop.aMs != null && loop.bMs != null && loop.bMs > loop.aMs ? (
            <XStack
              backgroundColor="accentSoft"
              style={{
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: radii.md,
                paddingHorizontal: spacing.md,
                paddingVertical: spacing.sm,
                gap: spacing.sm,
              }}
            >
              <Ionicons name="repeat" size={16} color="accent" />
              <Text color="accent" fontSize={14} fontWeight="600">
                Loop {formatClock(loop.aMs)} – {formatClock(loop.bMs)}
              </Text>
            </XStack>
          ) : null}

          {message ? <InlineBanner message={message} tone="error" onDismiss={() => setMessage(null)} /> : null}
          {missing ? (
            <AppPressable
              accessibilityRole="button"
              onPress={() => void onLocate()}
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                justifyContent: 'center',
                backgroundColor: colors.accent,
                borderRadius: radii.md,
                minHeight: 48,
                gap: spacing.sm,
              }}
            >
              <Ionicons name="locate-outline" size={18} color="background" />
              <Text color="background" fontWeight="700" fontSize={16}>
                Locate file
              </Text>
            </AppPressable>
          ) : null}

          <YStack
            backgroundColor="card"
            style={{ borderRadius: radii.lg, padding: spacing.md, gap: spacing.sm }}
          >
            <Text color="text" fontSize={17} fontWeight="600">
              Notes
            </Text>
            <XStack style={{ gap: spacing.sm, alignItems: 'flex-end' }}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={`Note at ${formatClock(notePositionMs(positionMs))}`}
                placeholderTextColor={colors.muted}
                style={{
                  flex: 1,
                  minHeight: 48,
                  maxHeight: 120,
                  color: colors.text,
                  backgroundColor: colors.surface,
                  borderRadius: radii.md,
                  paddingHorizontal: spacing.md,
                  paddingVertical: spacing.sm,
                  fontSize: 16,
                }}
                multiline
              />
              <AppPressable
                accessibilityRole="button"
                haptic
                onPress={() => {
                  actionHaptic();
                  addNote();
                }}
                style={{
                  minHeight: 48,
                  paddingHorizontal: spacing.md,
                  borderRadius: radii.md,
                  backgroundColor: colors.cardRaised,
                  alignItems: 'center',
                  justifyContent: 'center',
                }}
              >
                <Text color="accent" fontWeight="700" fontSize={16}>
                  Add
                </Text>
              </AppPressable>
            </XStack>
            {notes.length === 0 ? (
              <Text color="muted" fontSize={14} lineHeight={20}>
                Notes land a few seconds before the moment you tap Add.
              </Text>
            ) : (
              notes.map((note) => (
                <XStack
                  key={note.id}
                  style={{
                    alignItems: 'center',
                    paddingVertical: spacing.sm,
                    gap: spacing.md,
                    borderTopWidth: 0.5,
                    borderTopColor: colors.line,
                  }}
                >
                  <AppPressable
                    accessibilityRole="button"
                    onPress={() => {
                      const fromMs = progress.position * 1000;
                      seekToMs(note.positionMs);
                      rememberJump(fromMs, note.positionMs, 'note', 'defer');
                    }}
                    style={{ flex: 1, gap: 2 }}
                  >
                    <Text color="accent" fontVariant={['tabular-nums']} fontSize={13} fontWeight="600">
                      {formatClock(note.positionMs)}
                    </Text>
                    <Text color="text" fontSize={15} lineHeight={21}>
                      {note.text}
                    </Text>
                  </AppPressable>
                  <AppPressable
                    accessibilityRole="button"
                    onPress={() => {
                      if (pendingDeleteId === note.id) {
                        deleteNote(note.id);
                        setPendingDeleteId(null);
                        setNotes(listNotes(itemId));
                      } else {
                        setPendingDeleteId(note.id);
                      }
                    }}
                  >
                    <Text color="danger" fontSize={14} fontWeight="600">
                      {pendingDeleteId === note.id ? 'Confirm' : 'Delete'}
                    </Text>
                  </AppPressable>
                </XStack>
              ))
            )}
          </YStack>
        </ScrollView>

        <PlaybackDock
          variant="full"
          title={item.title}
          durationMs={durationMs}
          positionMs={positionMs}
          heard={visibleHeard}
          markers={notes.map((note) => ({ id: note.id, positionMs: note.positionMs }))}
          scrubMs={scrubMs}
          onScrub={setScrubMs}
          onSeek={(toMs, fromMs, source) => {
            seekToMs(toMs);
            rememberJump(fromMs, toMs, source, 'defer');
          }}
          onScrubPreview={(fromMs, toMs) => rememberJump(fromMs, toMs, 'scrub', 'hold')}
          onScrubCancel={revertJumpDrag}
          jumpsCount={jumps.length}
          onOpenJumps={() => {
            setJumps(listJumps(itemId));
            setJumpsOpen(true);
          }}
          onOpenSettings={() => setSettingsOpen(true)}
        />
        <PlaybackSettingsSheet
          visible={settingsOpen}
          onClose={() => setSettingsOpen(false)}
          speed={speed}
          onSpeed={(value) => {
            setSpeed(value);
            setSpeedState(value);
          }}
          sleepMinutes={sleepMinutes}
          onSleep={(minutes) => {
            if (minutes == null) {
              stopSleep();
              setSleepMinutes(null);
            } else {
              startSleep(minutes);
              setSleepMinutes(minutes);
            }
          }}
          loop={loop}
          onLoop={setLoop}
          positionMs={positionMs}
          skips={skips}
          onSkips={(next) => {
            writeSkips(next);
            setSkips(readSkips());
          }}
        />
        <JumpHistorySheet
          visible={jumpsOpen}
          jumps={jumps}
          onClose={() => setJumpsOpen(false)}
          onReturn={restoreJump}
          onDelete={removeJump}
          onClear={clearJumpList}
        />
        <ResetProgressSheet
          visible={resetOpen}
          title={item.title}
          onCancel={() => setResetOpen(false)}
          onConfirm={confirmResetProgress}
        />
      </YStack>
    </ScreenBackdrop>
  );
}

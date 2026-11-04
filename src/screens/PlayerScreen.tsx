import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import { useIsPlaying, useProgress } from '@rntp/player';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';

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
import { listenedFraction, type ListenRange } from '../library/ranges';
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

type PlayerScreenProps = NativeStackScreenProps<RootStackParamList, 'Player'> & {
  playerItemId: string | null;
  playerTitle: string | null;
  onPlayerContext: (itemId: string | null, title: string | null) => void;
};

export function PlayerScreen({ navigation, route, onPlayerContext }: PlayerScreenProps) {
  const { itemId } = route.params;
  const playing = useIsPlaying();
  const progress = useProgress(0.25);
  const [item, setItem] = useState<AudioItem | null>(() => getItem(itemId));
  const [notes, setNotes] = useState<Note[]>(() => listNotes(itemId));
  const [jumps, setJumps] = useState<Jump[]>(() => listJumps(itemId));
  const [jumpsOpen, setJumpsOpen] = useState(false);
  const [heard, setHeard] = useState<ListenRange[]>(() => rangesForItem(itemId));
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
  }, [itemId]);

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
    const handle = setInterval(() => {
      setHeard(rangesForItem(itemId));
      setItem(getItem(itemId));
    }, 5000);
    return () => clearInterval(handle);
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
    setJumps([]);
    setScrubMs(null);
    const current = getItem(itemId);
    setItem(current);
    if (current) {
      setSpeedState(current.speed || 1);
    }
    setResetOpen(false);
  }

  const heardFraction = listenedFraction(heard, durationMs);

  if (!item) {
    return (
      <ScreenBackdrop>
        <View style={styles.screen}>
          <ScreenHeader title="Lesson unavailable" onBack={() => navigation.goBack()} backLabel="Library" />
          <Text style={styles.message}>This lesson is no longer in the library.</Text>
        </View>
      </ScreenBackdrop>
    );
  }

  return (
    <ScreenBackdrop>
      <View style={styles.screen}>
        <ScreenHeader
          title=""
          onBack={() => navigation.goBack()}
          backLabel=""
          backIcon="chevron-down"
          actions={[
            {
              icon: 'options-outline',
              label: 'Playback settings',
              onPress: () => setSettingsOpen(true),
            },
          ]}
        />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <ArtworkAvatar title={item.title} size={200} />
            <Text style={styles.heroTitle}>{displayTitle(item.title, 56)}</Text>
            <View style={styles.heroChips}>
              <Text style={styles.heroChip}>{(item.format ?? 'audio').toUpperCase()}</Text>
              <Text style={styles.heroChip}>{Math.round(heardFraction * 100)}% heard</Text>
              <Text style={styles.heroChip}>{notes.length} notes</Text>
              {missing ? <Text style={[styles.heroChip, styles.heroChipDanger]}>Missing file</Text> : null}
            </View>
            <AppPressable
              accessibilityRole="button"
              accessibilityLabel="Reset playback progress"
              haptic
              onPress={() => setResetOpen(true)}
              style={styles.resetButton}
            >
              <Ionicons name="refresh-outline" size={16} color={colors.muted} />
              <Text style={styles.resetButtonText}>Reset progress</Text>
            </AppPressable>
          </View>

          {loop.aMs != null && loop.bMs != null && loop.bMs > loop.aMs ? (
            <View style={styles.loopBanner}>
              <Ionicons name="repeat" size={16} color={colors.accent} />
              <Text style={styles.loopLabel}>
                Loop {formatClock(loop.aMs)} – {formatClock(loop.bMs)}
              </Text>
            </View>
          ) : null}

          {message ? <InlineBanner message={message} tone="error" onDismiss={() => setMessage(null)} /> : null}
          {missing ? (
            <Pressable accessibilityRole="button" onPress={() => void onLocate()} style={styles.primary}>
              <Ionicons name="locate-outline" size={18} color={colors.background} />
              <Text style={styles.primaryText}>Locate file</Text>
            </Pressable>
          ) : null}

          <View style={styles.notesCard}>
            <Text style={styles.notesTitle}>Notes</Text>
            <View style={styles.composer}>
              <TextInput
                value={draft}
                onChangeText={setDraft}
                placeholder={`Note at ${formatClock(notePositionMs(positionMs))}`}
                placeholderTextColor={colors.muted}
                style={styles.noteInput}
                multiline
              />
              <AppPressable
                accessibilityRole="button"
                haptic
                onPress={() => {
                  actionHaptic();
                  addNote();
                }}
                style={styles.addNote}
              >
                <Text style={styles.addNoteText}>Add</Text>
              </AppPressable>
            </View>
            {notes.length === 0 ? (
              <Text style={styles.noteEmpty}>Notes land a few seconds before the moment you tap Add.</Text>
            ) : (
              notes.map((note) => (
                <View key={note.id} style={styles.noteRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      const fromMs = progress.position * 1000;
                      seekToMs(note.positionMs);
                      rememberJump(fromMs, note.positionMs, 'note', 'defer');
                    }}
                    style={styles.noteMain}
                  >
                    <Text style={styles.noteTime}>{formatClock(note.positionMs)}</Text>
                    <Text style={styles.noteText}>{note.text}</Text>
                  </Pressable>
                  <Pressable
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
                    <Text style={styles.deleteNote}>{pendingDeleteId === note.id ? 'Confirm' : 'Delete'}</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        <PlaybackDock
          variant="full"
          title={item.title}
          durationMs={durationMs}
          positionMs={positionMs}
          heard={heard}
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
      </View>
    </ScreenBackdrop>
  );
}

const DOCK_SPACE = 168;

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: DOCK_SPACE,
    gap: spacing.md,
  },
  hero: {
    alignItems: 'center',
    gap: spacing.md,
    paddingTop: spacing.sm,
    paddingBottom: spacing.md,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
    textAlign: 'center',
    lineHeight: 28,
  },
  heroChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    justifyContent: 'center',
    gap: spacing.sm,
  },
  heroChip: {
    color: colors.accent,
    fontSize: 12,
    fontWeight: '700',
    backgroundColor: colors.accentSoft,
    paddingHorizontal: 10,
    paddingVertical: 4,
    borderRadius: radii.pill,
    overflow: 'hidden',
  },
  heroChipDanger: {
    color: colors.danger,
    backgroundColor: 'rgba(240, 164, 164, 0.14)',
  },
  resetButton: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 6,
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.card,
  },
  resetButtonText: {
    color: colors.muted,
    fontSize: 14,
    fontWeight: '700',
  },
  loopBanner: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accentSoft,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
  },
  loopLabel: {
    color: colors.accent,
    fontSize: 14,
    fontWeight: '600',
  },
  message: {
    color: colors.danger,
    fontSize: 15,
    lineHeight: 22,
    paddingHorizontal: spacing.lg,
  },
  primary: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.sm,
    backgroundColor: colors.accent,
    borderRadius: radii.md,
    minHeight: 48,
  },
  primaryText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 16,
  },
  notesCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  notesTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  composer: {
    flexDirection: 'row',
    gap: spacing.sm,
    alignItems: 'flex-end',
  },
  noteInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    color: colors.text,
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    fontSize: 16,
  },
  addNote: {
    minHeight: 48,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.cardRaised,
    alignItems: 'center',
    justifyContent: 'center',
  },
  addNoteText: {
    color: colors.accent,
    fontWeight: '700',
    fontSize: 16,
  },
  noteEmpty: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
  },
  noteRow: {
    flexDirection: 'row',
    gap: spacing.md,
    alignItems: 'center',
    paddingVertical: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  noteMain: {
    flex: 1,
    gap: 2,
  },
  noteTime: {
    color: colors.accent,
    fontVariant: ['tabular-nums'],
    fontSize: 13,
    fontWeight: '600',
  },
  noteText: {
    color: colors.text,
    fontSize: 15,
    lineHeight: 21,
  },
  deleteNote: {
    color: colors.danger,
    fontSize: 14,
    fontWeight: '600',
  },
});

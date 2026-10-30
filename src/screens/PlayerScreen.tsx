import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useMemo, useRef, useState } from 'react';
import { useIsPlaying, useProgress } from '@rntp/player';
import { Pressable, ScrollView, StyleSheet, Text, TextInput, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import {
  deleteNote,
  getItem,
  insertNote,
  listNotes,
  markMissing,
  rangesForItem,
} from '../db/library';
import type { AudioItem, Note } from '../db/types';
import { listenedFraction, type ListenRange } from '../library/ranges';
import { locateAudioFile } from '../library/import';
import { createId } from '../media/identity';
import { formatClock, notePositionMs } from '../notes/capture';
import type { RootStackParamList } from '../navigation/types';
import {
  SLEEP_MINUTES,
  SPEEDS,
  openItem,
  readSkips,
  replayLastTenSeconds,
  seekToMs,
  setSpeed,
  skipBy,
  startSleep,
  stopSleep,
  togglePlayback,
  writeSkips,
  type SkipSettings,
} from '../playback/engine';
import { AppPressable } from '../ui/AppPressable';
import { ArtworkAvatar } from '../ui/ArtworkAvatar';
import { BottomNav } from '../ui/BottomNav';
import { CollapsibleSection } from '../ui/CollapsibleSection';
import { displayTitle } from '../ui/displayTitle';
import { InlineBanner } from '../ui/InlineBanner';
import { ScrubBar } from '../ui/ScrubBar';
import { ScreenBackdrop } from '../ui/ScreenBackdrop';
import { ScreenHeader } from '../ui/ScreenHeader';
import { actionHaptic } from '../ui/haptics';
import { colors, radii, spacing } from '../ui/theme';

type PlayerScreenProps = NativeStackScreenProps<RootStackParamList, 'Player'> & {
  playerItemId: string | null;
  playerTitle: string | null;
  onPlayerContext: (itemId: string | null, title: string | null) => void;
};

type LoopPoints = {
  aMs: number | null;
  bMs: number | null;
};

export function PlayerScreen({ navigation, route, onPlayerContext }: PlayerScreenProps) {
  const { itemId } = route.params;
  const playing = useIsPlaying();
  const progress = useProgress(0.25);
  const [item, setItem] = useState<AudioItem | null>(() => getItem(itemId));
  const [notes, setNotes] = useState<Note[]>(() => listNotes(itemId));
  const [heard, setHeard] = useState<ListenRange[]>(() => rangesForItem(itemId));
  const [skips, setSkips] = useState<SkipSettings>(() => readSkips());
  const [speed, setSpeedState] = useState(item?.speed ?? 1);
  const [sleepMinutes, setSleepMinutes] = useState<number | null>(null);
  const [loop, setLoop] = useState<LoopPoints>({ aMs: null, bMs: null });
  const [scrubMs, setScrubMs] = useState<number | null>(null);
  const [draft, setDraft] = useState('');
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);
  const [missing, setMissing] = useState(item?.missing ?? false);
  const [message, setMessage] = useState<string | null>(null);
  const loopGuard = useRef(false);
  const skipsRef = useRef(skips);
  skipsRef.current = skips;

  useEffect(() => {
    onPlayerContext(itemId, item?.title ?? null);
  }, [itemId, item?.title, onPlayerContext]);

  useEffect(() => {
    let cancelled = false;
    const current = getItem(itemId);
    setItem(current);
    setNotes(listNotes(itemId));
    setHeard(rangesForItem(itemId));
    if (!current) {
      return;
    }
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
    return () => {
      cancelled = true;
    };
  }, [itemId]);

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

  const backTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .runOnJS(true)
        .onEnd(() => {
          skipBy(-skipsRef.current.backMs);
        }),
    [],
  );
  const forwardTap = useMemo(
    () =>
      Gesture.Tap()
        .numberOfTaps(2)
        .runOnJS(true)
        .onEnd(() => {
          skipBy(skipsRef.current.forwardMs);
        }),
    [],
  );

  function changeSkip(which: keyof SkipSettings, delta: number): void {
    const next = writeAndRead({ ...skips, [which]: skips[which] + delta });
    setSkips(next);
  }

  function writeAndRead(next: SkipSettings): SkipSettings {
    writeSkips(next);
    return readSkips();
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

  const speedSummary = `${speed}×`;
  const sleepSummary =
    sleepMinutes != null ? `${sleepMinutes} min` : 'Off';
  const loopSummary =
    loop.aMs != null && loop.bMs != null
      ? `${formatClock(loop.aMs)} – ${formatClock(loop.bMs)}`
      : 'None';
  const heardFraction = listenedFraction(heard, durationMs);

  if (!item) {
    return (
      <ScreenBackdrop>
      <View style={styles.screen}>
        <ScreenHeader title="Lesson unavailable" onBack={() => navigation.goBack()} backLabel="Library" />
        <Text style={styles.message}>This lesson is no longer in the library.</Text>
        <BottomNav
          active="player"
          playerItemId={itemId}
          playerTitle={null}
          onLibrary={() => navigation.navigate('Library')}
          onPlayer={() => navigation.navigate('Player', { itemId })}
        />
      </View>
      </ScreenBackdrop>
    );
  }

  return (
    <ScreenBackdrop>
    <View style={styles.screen}>
      <ScreenHeader
        title={displayTitle(item.title)}
        subtitle={missing ? 'File missing' : `${speedSummary} · ${formatClock(positionMs)} / ${durationMs ? formatClock(durationMs) : '—'}`}
        onBack={() => navigation.goBack()}
        backLabel="Library"
      />
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <View style={styles.hero}>
          <ArtworkAvatar title={item.title} size={88} />
          <View style={styles.heroMeta}>
            <Text style={styles.heroTitle}>{displayTitle(item.title, 52)}</Text>
            <View style={styles.heroChips}>
              <Text style={styles.heroChip}>{(item.format ?? 'audio').toUpperCase()}</Text>
              <Text style={styles.heroChip}>{Math.round(heardFraction * 100)}% heard</Text>
              <Text style={styles.heroChip}>{notes.length} notes</Text>
            </View>
          </View>
        </View>
        <View style={styles.scrubBlock}>
          <ScrubBar
            durationMs={durationMs}
            positionMs={scrubMs ?? progress.position * 1000}
            heard={heard}
            markers={notes.map((note) => ({ id: note.id, positionMs: note.positionMs }))}
            onSeek={seekToMs}
            onScrub={setScrubMs}
          />
          <View style={styles.times}>
            <Text style={styles.time}>{formatClock(positionMs)}</Text>
            <Text style={styles.time}>{durationMs ? formatClock(durationMs) : '—'}</Text>
          </View>
          <View style={styles.skipZones}>
            <GestureDetector gesture={backTap}>
              <View style={styles.skipZone} accessibilityLabel={`Double-tap to rewind ${Math.round(skips.backMs / 1000)} seconds`}>
                <Ionicons name="play-back-outline" size={18} color={colors.muted} />
                <Text style={styles.skipHint}>−{Math.round(skips.backMs / 1000)}s</Text>
              </View>
            </GestureDetector>
            <GestureDetector gesture={forwardTap}>
              <View style={styles.skipZone} accessibilityLabel={`Double-tap to skip forward ${Math.round(skips.forwardMs / 1000)} seconds`}>
                <Ionicons name="play-forward-outline" size={18} color={colors.muted} />
                <Text style={styles.skipHint}>+{Math.round(skips.forwardMs / 1000)}s</Text>
              </View>
            </GestureDetector>
          </View>
        </View>

        {loop.aMs != null && loop.bMs != null ? (
          <View style={styles.loopBanner}>
            <Ionicons name="repeat" size={16} color={colors.accent} />
            <Text style={styles.loopLabel}>
              Loop {formatClock(loop.aMs)} – {formatClock(loop.bMs)}
            </Text>
          </View>
        ) : null}
        {message ? (
          <InlineBanner message={message} tone="error" onDismiss={() => setMessage(null)} />
        ) : null}
        {missing ? (
          <Pressable accessibilityRole="button" onPress={() => void onLocate()} style={styles.primary}>
            <Ionicons name="locate-outline" size={18} color={colors.background} />
            <Text style={styles.primaryText}>Locate file</Text>
          </Pressable>
        ) : null}

        <View style={styles.transportCard}>
          <View style={styles.skipControl}>
            <Pressable accessibilityRole="button" onPress={() => changeSkip('backMs', -5000)} style={styles.step}>
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => skipBy(-skips.backMs)} style={styles.roundSkip}>
              <Ionicons name="play-back" size={22} color={colors.text} />
              <Text style={styles.roundSkipText}>{Math.round(skips.backMs / 1000)}s</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => changeSkip('backMs', 5000)} style={styles.step}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
          <AppPressable
            accessibilityRole="button"
            haptic
            onPress={() => {
              actionHaptic();
              togglePlayback();
            }}
            style={styles.play}
          >
            <Ionicons name={playing ? 'pause' : 'play'} size={28} color={colors.background} />
          </AppPressable>
          <View style={styles.skipControl}>
            <Pressable accessibilityRole="button" onPress={() => changeSkip('forwardMs', -5000)} style={styles.step}>
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => skipBy(skips.forwardMs)} style={styles.roundSkip}>
              <Ionicons name="play-forward" size={22} color={colors.text} />
              <Text style={styles.roundSkipText}>{Math.round(skips.forwardMs / 1000)}s</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => changeSkip('forwardMs', 5000)} style={styles.step}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
        </View>

        <CollapsibleSection title="Playback speed" summary={speedSummary}>
          <View style={styles.chips}>
            {SPEEDS.map((value) => (
              <Pressable
                key={value}
                accessibilityRole="button"
                onPress={() => {
                  setSpeed(value);
                  setSpeedState(value);
                }}
                style={[styles.chip, speed === value && styles.chipOn]}
              >
                <Text style={[styles.chipText, speed === value && styles.chipTextOn]}>{value}×</Text>
              </Pressable>
            ))}
          </View>
        </CollapsibleSection>

        <CollapsibleSection title="Sleep timer" summary={sleepSummary}>
          <View style={styles.chips}>
            {SLEEP_MINUTES.map((minutes) => (
              <Pressable
                key={minutes}
                accessibilityRole="button"
                onPress={() => {
                  if (sleepMinutes === minutes) {
                    stopSleep();
                    setSleepMinutes(null);
                  } else {
                    startSleep(minutes);
                    setSleepMinutes(minutes);
                  }
                }}
                style={[styles.chip, sleepMinutes === minutes && styles.chipOn]}
              >
                <Text style={[styles.chipText, sleepMinutes === minutes && styles.chipTextOn]}>{minutes}m</Text>
              </Pressable>
            ))}
            <Pressable
              accessibilityRole="button"
              onPress={() => {
                stopSleep();
                setSleepMinutes(null);
              }}
              style={styles.chip}
            >
              <Text style={styles.chipText}>Off</Text>
            </Pressable>
          </View>
        </CollapsibleSection>

        <CollapsibleSection title="Loop & replay" summary={loopSummary}>
          <View style={styles.chips}>
            <Pressable accessibilityRole="button" onPress={replayLastTenSeconds} style={styles.chip}>
              <Text style={styles.chipText}>Replay 10s</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setLoop((current) => ({ ...current, aMs: Math.round(positionMs) }))}
              style={styles.chip}
            >
              <Text style={styles.chipText}>Set A</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              onPress={() => setLoop((current) => ({ ...current, bMs: Math.round(positionMs) }))}
              style={styles.chip}
            >
              <Text style={styles.chipText}>Set B</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => setLoop({ aMs: null, bMs: null })} style={styles.chip}>
              <Text style={styles.chipText}>Clear</Text>
            </Pressable>
          </View>
        </CollapsibleSection>

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
                <Pressable accessibilityRole="button" onPress={() => seekToMs(note.positionMs)} style={styles.noteMain}>
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
      <BottomNav
        active="player"
        playerItemId={itemId}
        playerTitle={item.title}
        onLibrary={() => navigation.navigate('Library')}
        onPlayer={() => navigation.navigate('Player', { itemId })}
      />
    </View>
    </ScreenBackdrop>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.md,
    gap: spacing.md,
  },
  hero: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.lg,
    paddingVertical: spacing.sm,
  },
  heroMeta: {
    flex: 1,
    gap: spacing.sm,
  },
  heroTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    lineHeight: 26,
  },
  heroChips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
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
  scrubBlock: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
  },
  skipZones: {
    flexDirection: 'row',
    gap: spacing.sm,
  },
  skipZone: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 6,
    minHeight: 40,
    borderRadius: radii.sm,
    backgroundColor: colors.surface,
  },
  skipHint: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    color: colors.text,
    fontVariant: ['tabular-nums'],
    fontSize: 14,
    fontWeight: '600',
  },
  loopBanner: {
    flexDirection: 'row',
    alignItems: 'center',
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
  transportCard: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: spacing.sm,
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    paddingVertical: spacing.md,
    paddingHorizontal: spacing.sm,
  },
  skipControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
    flex: 1,
  },
  step: {
    minWidth: 28,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    color: colors.muted,
    fontSize: 16,
    fontWeight: '700',
  },
  roundSkip: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    minHeight: 52,
    gap: 2,
  },
  roundSkipText: {
    color: colors.muted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  play: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: spacing.md,
    borderRadius: radii.pill,
    backgroundColor: colors.surface,
    alignItems: 'center',
    justifyContent: 'center',
  },
  chipOn: {
    backgroundColor: colors.accent,
  },
  chipText: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  chipTextOn: {
    color: colors.background,
  },
  notesCard: {
    backgroundColor: colors.card,
    borderRadius: radii.lg,
    padding: spacing.md,
    gap: spacing.sm,
    marginBottom: spacing.sm,
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

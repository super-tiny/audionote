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
import type { ListenRange } from '../library/ranges';
import { locateAudioFile } from '../library/import';
import { createId } from '../media/identity';
import { formatClock, notePositionMs } from '../notes/capture';
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
import { ScrubBar } from '../ui/ScrubBar';
import { colors } from '../ui/theme';

type PlayerScreenProps = {
  itemId: string;
  onBack: () => void;
};

type LoopPoints = {
  aMs: number | null;
  bMs: number | null;
};

export function PlayerScreen({ itemId, onBack }: PlayerScreenProps) {
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

  if (!item) {
    return (
      <View style={styles.screen}>
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>Library</Text>
        </Pressable>
        <Text style={styles.message}>This lesson is no longer in the library.</Text>
      </View>
    );
  }

  return (
    <View style={styles.screen}>
      <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
        <Pressable accessibilityRole="button" onPress={onBack} style={styles.back}>
          <Text style={styles.backText}>Library</Text>
        </Pressable>
        <Text style={styles.title}>{item.title}</Text>
        <View style={styles.skipZones}>
          <GestureDetector gesture={backTap}>
            <View style={styles.skipZone}>
              <Text style={styles.skipHint}>Double-tap −{Math.round(skips.backMs / 1000)}s</Text>
            </View>
          </GestureDetector>
          <GestureDetector gesture={forwardTap}>
            <View style={styles.skipZone}>
              <Text style={styles.skipHint}>Double-tap +{Math.round(skips.forwardMs / 1000)}s</Text>
            </View>
          </GestureDetector>
        </View>
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
        {loop.aMs != null && loop.bMs != null ? (
          <Text style={styles.loopLabel}>
            Loop {formatClock(loop.aMs)} – {formatClock(loop.bMs)}
          </Text>
        ) : null}
        {message ? <Text style={styles.message}>{message}</Text> : null}
        {missing ? (
          <Pressable accessibilityRole="button" onPress={() => void onLocate()} style={styles.primary}>
            <Text style={styles.primaryText}>Locate file</Text>
          </Pressable>
        ) : null}
        <View style={styles.transport}>
          <View style={styles.skipControl}>
            <Pressable accessibilityRole="button" onPress={() => changeSkip('backMs', -5000)} style={styles.step}>
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => skipBy(-skips.backMs)} style={styles.skipButton}>
              <Text style={styles.skipText}>−{Math.round(skips.backMs / 1000)}s</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => changeSkip('backMs', 5000)} style={styles.step}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
          <Pressable accessibilityRole="button" onPress={togglePlayback} style={styles.play}>
            <Text style={styles.playText}>{playing ? 'Pause' : 'Play'}</Text>
          </Pressable>
          <View style={styles.skipControl}>
            <Pressable accessibilityRole="button" onPress={() => changeSkip('forwardMs', -5000)} style={styles.step}>
              <Text style={styles.stepText}>−</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => skipBy(skips.forwardMs)} style={styles.skipButton}>
              <Text style={styles.skipText}>+{Math.round(skips.forwardMs / 1000)}s</Text>
            </Pressable>
            <Pressable accessibilityRole="button" onPress={() => changeSkip('forwardMs', 5000)} style={styles.step}>
              <Text style={styles.stepText}>+</Text>
            </Pressable>
          </View>
        </View>
        <Text style={styles.section}>Speed</Text>
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
        <Text style={styles.section}>Sleep</Text>
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
            <Text style={styles.chipText}>Clear loop</Text>
          </Pressable>
        </View>
        <Text style={styles.section}>Notes</Text>
        <View style={styles.composer}>
          <TextInput
            value={draft}
            onChangeText={setDraft}
            placeholder={`Note at ${formatClock(notePositionMs(positionMs))}`}
            placeholderTextColor={colors.muted}
            style={styles.noteInput}
            multiline
          />
          <Pressable accessibilityRole="button" onPress={addNote} style={styles.addNote}>
            <Text style={styles.addNoteText}>Add</Text>
          </Pressable>
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
      </ScrollView>
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
  },
  content: {
    paddingTop: 56,
    paddingHorizontal: 20,
    paddingBottom: 40,
    gap: 10,
  },
  back: {
    minHeight: 44,
    justifyContent: 'center',
    alignSelf: 'flex-start',
  },
  backText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  title: {
    color: colors.text,
    fontSize: 26,
    fontWeight: '700',
  },
  skipZones: {
    flexDirection: 'row',
    gap: 8,
  },
  skipZone: {
    flex: 1,
    minHeight: 64,
    borderRadius: 12,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipHint: {
    color: colors.muted,
    fontSize: 13,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
  },
  time: {
    color: colors.text,
    fontVariant: ['tabular-nums'],
    fontSize: 15,
  },
  loopLabel: {
    color: colors.accent,
    fontSize: 14,
  },
  message: {
    color: colors.danger,
    fontSize: 15,
    lineHeight: 22,
  },
  primary: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  primaryText: {
    color: colors.background,
    fontWeight: '700',
    fontSize: 16,
  },
  transport: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    gap: 8,
    marginTop: 4,
  },
  skipControl: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 2,
  },
  step: {
    minWidth: 32,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  stepText: {
    color: colors.muted,
    fontSize: 18,
    fontWeight: '700',
  },
  skipButton: {
    minHeight: 44,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  skipText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  play: {
    minWidth: 92,
    minHeight: 52,
    borderRadius: 26,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playText: {
    color: colors.background,
    fontSize: 17,
    fontWeight: '700',
  },
  section: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
    marginTop: 6,
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  chip: {
    minHeight: 36,
    paddingHorizontal: 12,
    borderRadius: 18,
    backgroundColor: colors.card,
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
  composer: {
    flexDirection: 'row',
    gap: 8,
    alignItems: 'flex-end',
  },
  noteInput: {
    flex: 1,
    minHeight: 48,
    maxHeight: 120,
    color: colors.text,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 12,
    paddingVertical: 10,
    fontSize: 16,
  },
  addNote: {
    minHeight: 48,
    paddingHorizontal: 14,
    borderRadius: 12,
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
    gap: 12,
    alignItems: 'center',
    paddingVertical: 8,
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

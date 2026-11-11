import { Ionicons } from '@expo/vector-icons';
import type { NativeStackScreenProps } from '@react-navigation/native-stack';
import { useEffect, useRef, useState } from 'react';
import TrackPlayer from '@rntp/player';
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
import { listenedFraction, projectHeardRanges, type ListenRange } from '../library/ranges';
import { locateAudioFile } from '../library/import';
import { createId } from '../media/identity';
import { notePositionMs } from '../notes/capture';
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
import { PlayerClockProvider, usePlayerClock } from '../playback/PlayerClock';
import { currentOpenListen, subscribeListenProgress } from '../playback/persist';
import { resetItemPlayback } from '../playback/resetItem';
import { useI18n } from '../i18n/I18nProvider';
import { AppPressable } from '../ui/AppPressable';
import { ArtworkAvatar } from '../ui/ArtworkAvatar';
import { displayTitle } from '../ui/displayTitle';
import { InlineBanner } from '../ui/InlineBanner';
import { JumpHistorySheet } from '../ui/JumpHistorySheet';
import { PlaybackDock } from '../ui/PlaybackDock';
import type { ScrubSeekSource } from '../ui/ScrubBar';
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

function readPlayheadMs(): number {
  try {
    return TrackPlayer.getProgress().position * 1000;
  } catch {
    return 0;
  }
}

function readPlaying(): boolean {
  try {
    return TrackPlayer.isPlaying();
  } catch {
    return false;
  }
}

function LoopGuard({ loop, scrubbing }: { loop: LoopPoints; scrubbing: boolean }) {
  const { positionMs, playing } = usePlayerClock();
  const loopGuard = useRef(false);

  useEffect(() => {
    if (loop.aMs == null || loop.bMs == null || loop.bMs <= loop.aMs || !playing || scrubbing) {
      loopGuard.current = false;
      return;
    }
    if (positionMs >= loop.bMs && !loopGuard.current) {
      loopGuard.current = true;
      seekToMs(loop.aMs);
    } else if (positionMs < loop.bMs - 400) {
      loopGuard.current = false;
    }
  }, [positionMs, playing, loop, scrubbing]);

  return null;
}

function HeardPercent({
  itemId,
  stored,
  fallbackDurationMs,
  scrubMs,
}: {
  itemId: string;
  stored: readonly ListenRange[];
  fallbackDurationMs: number | null;
  scrubMs: number | null;
}) {
  const { t } = useI18n();
  const { positionMs, durationMs, playing } = usePlayerClock();
  const open = currentOpenListen();
  const include = open?.itemId === itemId ? open.range : null;
  const playhead = scrubMs ?? positionMs;
  const visible = projectHeardRanges(stored, include, playhead, playing && scrubMs == null);
  const fraction = listenedFraction(visible, Math.max(durationMs, fallbackDurationMs ?? 0));
  return <Text style={styles.heroChip}>{t('heardPercent', { percent: Math.round(fraction * 100) })}</Text>;
}

function NoteTimeHint({ hidden }: { hidden: boolean }) {
  const { positionMs } = usePlayerClock();
  const { t, clock, align } = useI18n();
  if (hidden) {
    return null;
  }
  return (
    <View pointerEvents="none" style={styles.noteHintWrap}>
      <Text style={[styles.noteHint, align]}>{t('noteAt', { time: clock(notePositionMs(positionMs)) })}</Text>
    </View>
  );
}

function PlayerDockHost({
  itemId,
  title,
  fallbackDurationMs,
  stored,
  scrubMs,
  markers,
  onScrub,
  onSeek,
  onScrubPreview,
  onScrubCancel,
  jumpsCount,
  onOpenJumps,
  onOpenSettings,
}: {
  itemId: string;
  title: string;
  fallbackDurationMs: number | null;
  stored: readonly ListenRange[];
  scrubMs: number | null;
  markers: readonly { id: string; positionMs: number }[];
  onScrub: (positionMs: number | null) => void;
  onSeek: (positionMs: number, fromMs: number, source: ScrubSeekSource) => void;
  onScrubPreview?: (fromMs: number, toMs: number) => void;
  onScrubCancel?: () => void;
  jumpsCount: number;
  onOpenJumps: () => void;
  onOpenSettings: () => void;
}) {
  const { positionMs, durationMs, playing } = usePlayerClock();
  const open = currentOpenListen();
  const include = open?.itemId === itemId ? open.range : null;
  const playhead = scrubMs ?? positionMs;
  const visible = projectHeardRanges(stored, include, playhead, playing && scrubMs == null);
  return (
    <PlaybackDock
      variant="full"
      title={title}
      durationMs={Math.max(durationMs, fallbackDurationMs ?? 0)}
      positionMs={playhead}
      heard={visible}
      markers={markers}
      scrubMs={scrubMs}
      onScrub={onScrub}
      onSeek={onSeek}
      onScrubPreview={onScrubPreview}
      onScrubCancel={onScrubCancel}
      jumpsCount={jumpsCount}
      onOpenJumps={onOpenJumps}
      onOpenSettings={onOpenSettings}
    />
  );
}

export function PlayerScreen(props: PlayerScreenProps) {
  return (
    <PlayerClockProvider>
      <PlayerScreenBody {...props} />
    </PlayerClockProvider>
  );
}

function PlayerScreenBody({ navigation, route, onPlayerContext }: PlayerScreenProps) {
  const { itemId, seekMs, seekToken } = route.params;
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
  const { t, clock, count, align } = useI18n();

  useEffect(() => {
    onPlayerContext(itemId, item?.title ?? null);
  }, [itemId, item?.title, onPlayerContext]);

  useEffect(() => {
    let cancelled = false;
    const current = getItem(itemId);
    setItem(current);
    setNotes(listNotes(itemId));
    setHeard(rangesForItem(itemId));
    setScrubMs(null);
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
            setMessage(t('fileMissingLong'));
            return;
          }
          if (seekToken != null && seekMs != null) {
            seekToMs(seekMs);
          }
        })
        .catch((error: unknown) => {
          if (!cancelled) {
            setMessage(error instanceof Error ? error.message : t('couldNotStart'));
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
    let openStart: number | null | undefined;
    const acceptStored = (open: ListenRange | null) => {
      const start = open?.startMs ?? null;
      if (start === openStart) {
        return;
      }
      openStart = start;
      setHeard(rangesForItem(itemId));
    };
    const current = currentOpenListen();
    acceptStored(current?.itemId === itemId ? current.range : null);
    const unsubscribe = subscribeListenProgress((update) => {
      if (update.itemId === itemId) {
        acceptStored(update.open);
      }
    });
    const handle = setInterval(() => {
      setItem((existing) => {
        const next = getItem(itemId);
        if (
          existing &&
          next &&
          existing.durationMs === next.durationMs &&
          existing.missing === next.missing &&
          existing.title === next.title &&
          existing.uri === next.uri
        ) {
          return existing;
        }
        return next;
      });
    }, 5000);
    return () => {
      unsubscribe();
      clearInterval(handle);
    };
  }, [itemId]);

  function rememberJump(fromMs: number, toMs: number, source: RecordedJumpSource, commit: 'defer' | 'now' | 'hold'): void {
    recordJumpSeek({
      itemId,
      fromMs,
      toMs,
      source,
      commit: commit === 'hold' ? 'hold' : readPlaying() ? 'defer' : 'now',
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
      positionMs: notePositionMs(readPlayheadMs()),
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
      setMessage(t('couldNotReadFile'));
      return;
    }
    const current = getItem(itemId);
    setItem(current);
    if (current) {
      const opened = await openItem(current);
      setMissing(!opened);
      setMessage(opened ? null : t('fileStillUnreadable'));
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

  if (!item) {
    return (
      <ScreenBackdrop>
        <View style={styles.screen}>
          <ScreenHeader title={t('lessonUnavailable')} onBack={() => navigation.goBack()} backLabel={t('library')} />
          <Text style={[styles.message, align]}>{t('lessonGone')}</Text>
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
              icon: 'time-outline',
              label: t('listeningHistory'),
              onPress: () => navigation.navigate({ name: 'ListenHistory', params: { itemId }, merge: false }),
            },
            {
              icon: 'options-outline',
              label: t('playbackSettings'),
              onPress: () => setSettingsOpen(true),
            },
          ]}
        />
        <ScrollView contentContainerStyle={styles.content} keyboardShouldPersistTaps="handled">
          <View style={styles.hero}>
            <ArtworkAvatar title={item.title} size={200} />
            <Text style={styles.heroTitle}>{displayTitle(item.title, 56, t('untitled'))}</Text>
            <View style={styles.heroChips}>
              <Text style={styles.heroChip}>{(item.format ?? t('audioWord')).toUpperCase()}</Text>
              <HeardPercent itemId={item.id} stored={heard} fallbackDurationMs={item.durationMs} scrubMs={scrubMs} />
              <Text style={styles.heroChip}>{count('notes', notes.length)}</Text>
              {missing ? <Text style={[styles.heroChip, styles.heroChipDanger]}>{t('missingFile')}</Text> : null}
            </View>
            <AppPressable
              accessibilityRole="button"
              accessibilityLabel={t('resetPlaybackProgress')}
              haptic
              onPress={() => setResetOpen(true)}
              style={styles.resetButton}
            >
              <Ionicons name="refresh-outline" size={16} color={colors.muted} />
              <Text style={styles.resetButtonText}>{t('resetProgress')}</Text>
            </AppPressable>
          </View>

          {loop.aMs != null && loop.bMs != null && loop.bMs > loop.aMs ? (
            <View style={styles.loopBanner}>
              <Ionicons name="repeat" size={16} color={colors.accent} />
              <Text style={styles.loopLabel}>
                {t('loopRange', { start: clock(loop.aMs), end: clock(loop.bMs) })}
              </Text>
            </View>
          ) : null}

          {message ? <InlineBanner message={message} tone="error" onDismiss={() => setMessage(null)} /> : null}
          {missing ? (
            <Pressable accessibilityRole="button" onPress={() => void onLocate()} style={styles.primary}>
              <Ionicons name="locate-outline" size={18} color={colors.background} />
              <Text style={styles.primaryText}>{t('locateFile')}</Text>
            </Pressable>
          ) : null}

          <View style={styles.notesCard}>
            <Text style={[styles.notesTitle, align]}>{t('notes')}</Text>
            <View style={styles.composer}>
              <View style={styles.noteField}>
                <TextInput
                  value={draft}
                  onChangeText={setDraft}
                  placeholder=""
                  placeholderTextColor={colors.muted}
                  accessibilityLabel={t('notes')}
                  style={[styles.noteInput, align]}
                  multiline
                />
                <NoteTimeHint hidden={draft.length > 0} />
              </View>
              <AppPressable
                accessibilityRole="button"
                haptic
                onPress={() => {
                  actionHaptic();
                  addNote();
                }}
                style={styles.addNote}
              >
                <Text style={styles.addNoteText}>{t('add')}</Text>
              </AppPressable>
            </View>
            {notes.length === 0 ? (
              <Text style={[styles.noteEmpty, align]}>{t('notesHint')}</Text>
            ) : (
              notes.map((note) => (
                <View key={note.id} style={styles.noteRow}>
                  <Pressable
                    accessibilityRole="button"
                    onPress={() => {
                      const fromMs = readPlayheadMs();
                      seekToMs(note.positionMs);
                      rememberJump(fromMs, note.positionMs, 'note', 'defer');
                    }}
                    style={styles.noteMain}
                  >
                    <Text style={styles.noteTime}>{clock(note.positionMs)}</Text>
                    <Text style={[styles.noteText, align]}>{note.text}</Text>
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
                    <Text style={styles.deleteNote}>{pendingDeleteId === note.id ? t('confirm') : t('delete')}</Text>
                  </Pressable>
                </View>
              ))
            )}
          </View>
        </ScrollView>

        <PlayerDockHost
          itemId={item.id}
          title={item.title}
          fallbackDurationMs={item.durationMs}
          stored={heard}
          scrubMs={scrubMs}
          markers={notes.map((note) => ({ id: note.id, positionMs: note.positionMs }))}
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
        <LoopGuard loop={loop} scrubbing={scrubMs != null} />
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
  noteField: {
    flex: 1,
  },
  noteHintWrap: {
    ...StyleSheet.absoluteFill,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
  },
  noteHint: {
    color: colors.muted,
    fontSize: 16,
  },
  noteInput: {
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

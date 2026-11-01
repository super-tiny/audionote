import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';

import { SLEEP_MINUTES, SPEEDS, replayLastTenSeconds, type SkipSettings } from '../playback/engine';
import { formatClock } from '../notes/capture';
import { AppPressable } from './AppPressable';
import { colors, radii, spacing } from './theme';

export type LoopPoints = {
  aMs: number | null;
  bMs: number | null;
};

type Panel = 'root' | 'speed' | 'sleep' | 'loop' | 'skip';

type PlaybackSettingsSheetProps = {
  visible: boolean;
  onClose: () => void;
  speed: number;
  onSpeed: (value: number) => void;
  sleepMinutes: number | null;
  onSleep: (minutes: number | null) => void;
  loop: LoopPoints;
  onLoop: (loop: LoopPoints) => void;
  positionMs: number;
  skips: SkipSettings;
  onSkips: (skips: SkipSettings) => void;
};

function MenuRow({
  icon,
  label,
  value,
  onPress,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  value: string;
  onPress: () => void;
}) {
  return (
    <AppPressable accessibilityRole="button" haptic onPress={onPress} style={styles.row}>
      <Ionicons name={icon} size={22} color={colors.text} />
      <Text style={styles.rowLabel}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
      <Ionicons name="chevron-forward" size={18} color={colors.muted} />
    </AppPressable>
  );
}

export function PlaybackSettingsSheet({
  visible,
  onClose,
  speed,
  onSpeed,
  sleepMinutes,
  onSleep,
  loop,
  onLoop,
  positionMs,
  skips,
  onSkips,
}: PlaybackSettingsSheetProps) {
  const insets = useSafeAreaInsets();
  const [panel, setPanel] = useState<Panel>('root');

  function closeAll(): void {
    setPanel('root');
    onClose();
  }

  const loopOn = loop.aMs != null && loop.bMs != null && loop.bMs > loop.aMs;
  const sleepLabel = sleepMinutes != null ? `${sleepMinutes} min` : 'Off';
  const loopLabel = loopOn ? `${formatClock(loop.aMs!)} – ${formatClock(loop.bMs!)}` : 'Off';
  const speedLabel = speed === 1 ? 'Normal' : `${speed}×`;

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={closeAll}>
      <Pressable style={styles.backdrop} onPress={closeAll} accessibilityLabel="Close settings" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View style={styles.handle} />
        {panel !== 'root' ? (
          <View style={styles.subHeader}>
            <AppPressable accessibilityRole="button" onPress={() => setPanel('root')} style={styles.subBack}>
              <Ionicons name="chevron-back" size={22} color={colors.text} />
            </AppPressable>
            <Text style={styles.subTitle}>
              {panel === 'speed' ? 'Playback speed' : panel === 'sleep' ? 'Sleep timer' : panel === 'loop' ? 'Loop' : 'Skip intervals'}
            </Text>
          </View>
        ) : (
          <Text style={styles.title}>Playback settings</Text>
        )}

        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          {panel === 'root' ? (
            <>
              <MenuRow icon="speedometer-outline" label="Speed" value={speedLabel} onPress={() => setPanel('speed')} />
              <MenuRow icon="moon-outline" label="Sleep timer" value={sleepLabel} onPress={() => setPanel('sleep')} />
              <MenuRow icon="repeat-outline" label="A–B loop" value={loopLabel} onPress={() => setPanel('loop')} />
              <MenuRow
                icon="play-skip-forward-outline"
                label="Skip intervals"
                value={`−${Math.round(skips.backMs / 1000)}s / +${Math.round(skips.forwardMs / 1000)}s`}
                onPress={() => setPanel('skip')}
              />
            </>
          ) : null}

          {panel === 'speed' ? (
            <View style={styles.chips}>
              {SPEEDS.map((value) => (
                <AppPressable
                  key={value}
                  accessibilityRole="button"
                  haptic
                  onPress={() => {
                    onSpeed(value);
                    setPanel('root');
                  }}
                  style={[styles.chip, speed === value && styles.chipOn]}
                >
                  <Text style={[styles.chipText, speed === value && styles.chipTextOn]}>
                    {value === 1 ? 'Normal' : `${value}×`}
                  </Text>
                </AppPressable>
              ))}
            </View>
          ) : null}

          {panel === 'sleep' ? (
            <View style={styles.chips}>
              {SLEEP_MINUTES.map((minutes) => (
                <AppPressable
                  key={minutes}
                  accessibilityRole="button"
                  haptic
                  onPress={() => {
                    onSleep(sleepMinutes === minutes ? null : minutes);
                    setPanel('root');
                  }}
                  style={[styles.chip, sleepMinutes === minutes && styles.chipOn]}
                >
                  <Text style={[styles.chipText, sleepMinutes === minutes && styles.chipTextOn]}>{minutes} min</Text>
                </AppPressable>
              ))}
              <AppPressable accessibilityRole="button" haptic onPress={() => { onSleep(null); setPanel('root'); }} style={styles.chip}>
                <Text style={styles.chipText}>Off</Text>
              </AppPressable>
            </View>
          ) : null}

          {panel === 'loop' ? (
            <View style={styles.loopPanel}>
              <View style={styles.loopToggleRow}>
                <Text style={styles.rowLabel}>Loop section</Text>
                <Switch
                  value={loopOn}
                  onValueChange={(on) => {
                    if (!on) {
                      onLoop({ aMs: null, bMs: null });
                    } else if (loop.aMs == null || loop.bMs == null) {
                      onLoop({ aMs: Math.round(positionMs), bMs: Math.round(positionMs) + 10_000 });
                    }
                  }}
                  trackColor={{ false: colors.line, true: colors.accentSoft }}
                  thumbColor={loopOn ? colors.accent : colors.muted}
                />
              </View>
              <AppPressable accessibilityRole="button" haptic onPress={replayLastTenSeconds} style={styles.loopAction}>
                <Text style={styles.loopActionText}>Replay last 10 seconds</Text>
              </AppPressable>
              <AppPressable
                accessibilityRole="button"
                haptic
                onPress={() => onLoop({ ...loop, aMs: Math.round(positionMs) })}
                style={styles.loopAction}
              >
                <Text style={styles.loopActionText}>Set A at {formatClock(positionMs)}</Text>
              </AppPressable>
              <AppPressable
                accessibilityRole="button"
                haptic
                onPress={() => onLoop({ ...loop, bMs: Math.round(positionMs) })}
                style={styles.loopAction}
              >
                <Text style={styles.loopActionText}>Set B at {formatClock(positionMs)}</Text>
              </AppPressable>
              {loopOn ? (
                <Text style={styles.loopHint}>
                  Looping {formatClock(loop.aMs!)} – {formatClock(loop.bMs!)}
                </Text>
              ) : null}
            </View>
          ) : null}

          {panel === 'skip' ? (
            <View style={styles.skipPanel}>
              <Text style={styles.skipHeading}>Rewind</Text>
              <View style={styles.skipRow}>
                <AppPressable
                  accessibilityRole="button"
                  onPress={() => onSkips({ ...skips, backMs: skips.backMs - 5000 })}
                  style={styles.skipStep}
                >
                  <Text style={styles.skipStepText}>−5s</Text>
                </AppPressable>
                <Text style={styles.skipValue}>{Math.round(skips.backMs / 1000)} sec</Text>
                <AppPressable
                  accessibilityRole="button"
                  onPress={() => onSkips({ ...skips, backMs: skips.backMs + 5000 })}
                  style={styles.skipStep}
                >
                  <Text style={styles.skipStepText}>+5s</Text>
                </AppPressable>
              </View>
              <Text style={styles.skipHeading}>Skip forward</Text>
              <View style={styles.skipRow}>
                <AppPressable
                  accessibilityRole="button"
                  onPress={() => onSkips({ ...skips, forwardMs: skips.forwardMs - 5000 })}
                  style={styles.skipStep}
                >
                  <Text style={styles.skipStepText}>−5s</Text>
                </AppPressable>
                <Text style={styles.skipValue}>{Math.round(skips.forwardMs / 1000)} sec</Text>
                <AppPressable
                  accessibilityRole="button"
                  onPress={() => onSkips({ ...skips, forwardMs: skips.forwardMs + 5000 })}
                  style={styles.skipStep}
                >
                  <Text style={styles.skipStepText}>+5s</Text>
                </AppPressable>
              </View>
            </View>
          ) : null}
        </ScrollView>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    backgroundColor: colors.cardRaised,
    borderTopLeftRadius: radii.lg + 4,
    borderTopRightRadius: radii.lg + 4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '72%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  subHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginBottom: spacing.md,
  },
  subBack: {
    minWidth: 40,
    minHeight: 40,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: -8,
  },
  subTitle: {
    color: colors.text,
    fontSize: 18,
    fontWeight: '700',
  },
  scroll: {
    flexGrow: 0,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
    paddingVertical: spacing.sm,
    borderBottomWidth: StyleSheet.hairlineWidth,
    borderBottomColor: colors.line,
  },
  rowLabel: {
    flex: 1,
    color: colors.text,
    fontSize: 16,
  },
  rowValue: {
    color: colors.muted,
    fontSize: 14,
    fontVariant: ['tabular-nums'],
  },
  chips: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  chip: {
    minHeight: 40,
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
    fontSize: 15,
    fontWeight: '600',
  },
  chipTextOn: {
    color: colors.background,
  },
  loopPanel: {
    gap: spacing.sm,
    paddingBottom: spacing.lg,
  },
  loopToggleRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 48,
  },
  loopAction: {
    minHeight: 48,
    justifyContent: 'center',
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  loopActionText: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '600',
  },
  loopHint: {
    color: colors.accent,
    fontSize: 14,
    marginTop: spacing.sm,
  },
  skipPanel: {
    gap: spacing.md,
    paddingBottom: spacing.lg,
  },
  skipHeading: {
    color: colors.muted,
    fontSize: 13,
    fontWeight: '600',
    textTransform: 'uppercase',
  },
  skipRow: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    backgroundColor: colors.surface,
    borderRadius: radii.md,
    padding: spacing.sm,
  },
  skipStep: {
    minWidth: 56,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
  skipStepText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  skipValue: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
  },
});

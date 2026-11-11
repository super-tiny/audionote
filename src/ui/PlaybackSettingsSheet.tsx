import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';

import { SLEEP_MINUTES, SPEEDS, replayLastTenSeconds, type SkipSettings } from '../playback/engine';
import { usePlayerClock } from '../playback/PlayerClock';
import { useI18n } from '../i18n/I18nProvider';
import { directionalIcon } from './direction';
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
  const { isRtl, align } = useI18n();
  return (
    <AppPressable accessibilityRole="button" haptic onPress={onPress} style={styles.row}>
      <Ionicons name={icon} size={22} color={colors.text} />
      <Text style={[styles.rowLabel, align]}>{label}</Text>
      <Text style={styles.rowValue}>{value}</Text>
      <Ionicons name={directionalIcon('chevron-forward', isRtl)} size={18} color={colors.muted} />
    </AppPressable>
  );
}

function LoopPointEditor({
  loop,
  loopOn,
  onLoop,
}: {
  loop: LoopPoints;
  loopOn: boolean;
  onLoop: (loop: LoopPoints) => void;
}) {
  const { positionMs } = usePlayerClock();
  const { t, clock, align } = useI18n();
  const playhead = Math.round(positionMs);

  return (
    <View style={styles.loopPanel}>
      <View style={styles.loopToggleRow}>
        <Text style={[styles.rowLabel, align]}>{t('loopSection')}</Text>
        <Switch
          value={loopOn}
          onValueChange={(on) => {
            if (!on) {
              onLoop({ aMs: null, bMs: null });
            } else if (loop.aMs == null || loop.bMs == null) {
              onLoop({ aMs: playhead, bMs: playhead + 10_000 });
            }
          }}
          trackColor={{ false: colors.line, true: colors.accentSoft }}
          thumbColor={loopOn ? colors.accent : colors.muted}
        />
      </View>
      <AppPressable accessibilityRole="button" haptic onPress={replayLastTenSeconds} style={styles.loopAction}>
        <Text style={[styles.loopActionText, align]}>{t('replayLast10')}</Text>
      </AppPressable>
      <AppPressable
        accessibilityRole="button"
        haptic
        onPress={() => onLoop({ ...loop, aMs: playhead })}
        style={styles.loopAction}
      >
        <Text style={[styles.loopActionText, align]}>{t('setA', { time: clock(playhead) })}</Text>
      </AppPressable>
      <AppPressable
        accessibilityRole="button"
        haptic
        onPress={() => onLoop({ ...loop, bMs: playhead })}
        style={styles.loopAction}
      >
        <Text style={[styles.loopActionText, align]}>{t('setB', { time: clock(playhead) })}</Text>
      </AppPressable>
      {loopOn ? (
        <Text style={[styles.loopHint, align]}>
          {t('looping', { start: clock(loop.aMs!), end: clock(loop.bMs!) })}
        </Text>
      ) : null}
    </View>
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
  skips,
  onSkips,
}: PlaybackSettingsSheetProps) {
  const insets = useSafeAreaInsets();
  const [panel, setPanel] = useState<Panel>('root');
  const { t, clock, direction, isRtl, align } = useI18n();

  function closeAll(): void {
    setPanel('root');
    onClose();
  }

  const loopOn = loop.aMs != null && loop.bMs != null && loop.bMs > loop.aMs;
  const sleepLabel = sleepMinutes != null ? t('minutes', { count: sleepMinutes }) : t('off');
  const loopLabel = loopOn ? `${clock(loop.aMs!)} – ${clock(loop.bMs!)}` : t('off');
  const speedLabel = speed === 1 ? t('normal') : `${speed}×`;

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={closeAll}>
      <View style={[styles.fill, { direction }]}>
      <Pressable style={styles.backdrop} onPress={closeAll} accessibilityLabel={t('closeSettings')} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View style={styles.handle} />
        {panel !== 'root' ? (
          <View style={styles.subHeader}>
            <AppPressable accessibilityRole="button" onPress={() => setPanel('root')} style={styles.subBack}>
              <Ionicons name={directionalIcon('chevron-back', isRtl)} size={22} color={colors.text} />
            </AppPressable>
            <Text style={styles.subTitle}>
              {panel === 'speed' ? t('playbackSpeed') : panel === 'sleep' ? t('sleepTimer') : panel === 'loop' ? t('loop') : t('skipIntervals')}
            </Text>
          </View>
        ) : (
          <Text style={[styles.title, align]}>{t('playbackSettings')}</Text>
        )}

        <ScrollView style={styles.scroll} keyboardShouldPersistTaps="handled">
          {panel === 'root' ? (
            <>
              <MenuRow icon="speedometer-outline" label={t('speed')} value={speedLabel} onPress={() => setPanel('speed')} />
              <MenuRow icon="moon-outline" label={t('sleepTimer')} value={sleepLabel} onPress={() => setPanel('sleep')} />
              <MenuRow icon="repeat-outline" label={t('loop')} value={loopLabel} onPress={() => setPanel('loop')} />
              <MenuRow
                icon="play-skip-forward-outline"
                label={t('skipIntervals')}
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
                    {value === 1 ? t('normal') : `${value}×`}
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
                  <Text style={[styles.chipText, sleepMinutes === minutes && styles.chipTextOn]}>{t('minutes', { count: minutes })}</Text>
                </AppPressable>
              ))}
              <AppPressable accessibilityRole="button" haptic onPress={() => { onSleep(null); setPanel('root'); }} style={styles.chip}>
                <Text style={styles.chipText}>{t('off')}</Text>
              </AppPressable>
            </View>
          ) : null}

          {panel === 'loop' ? <LoopPointEditor loop={loop} loopOn={loopOn} onLoop={onLoop} /> : null}

          {panel === 'skip' ? (
            <View style={styles.skipPanel}>
              <Text style={styles.skipHeading}>{t('rewind')}</Text>
              <View style={styles.skipRow}>
                <AppPressable
                  accessibilityRole="button"
                  onPress={() => onSkips({ ...skips, backMs: skips.backMs - 5000 })}
                  style={styles.skipStep}
                >
                  <Text style={styles.skipStepText}>−5s</Text>
                </AppPressable>
                <Text style={styles.skipValue}>{t('seconds', { count: Math.round(skips.backMs / 1000) })}</Text>
                <AppPressable
                  accessibilityRole="button"
                  onPress={() => onSkips({ ...skips, backMs: skips.backMs + 5000 })}
                  style={styles.skipStep}
                >
                  <Text style={styles.skipStepText}>+5s</Text>
                </AppPressable>
              </View>
              <Text style={styles.skipHeading}>{t('skipForward')}</Text>
              <View style={styles.skipRow}>
                <AppPressable
                  accessibilityRole="button"
                  onPress={() => onSkips({ ...skips, forwardMs: skips.forwardMs - 5000 })}
                  style={styles.skipStep}
                >
                  <Text style={styles.skipStepText}>−5s</Text>
                </AppPressable>
                <Text style={styles.skipValue}>{t('seconds', { count: Math.round(skips.forwardMs / 1000) })}</Text>
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
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    justifyContent: 'flex-end',
  },
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
    marginStart: -8,
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

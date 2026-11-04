import { Ionicons } from '@expo/vector-icons';
import { Modal, Switch } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { useState } from 'react';
import { ScrollView, Text, XStack, YStack } from 'tamagui';

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
    <AppPressable
      accessibilityRole="button"
      haptic
      onPress={onPress}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: 52,
        paddingVertical: spacing.sm,
        borderBottomWidth: 0.5,
        borderBottomColor: colors.line,
      }}
    >
      <Ionicons name={icon} size={22} color={colors.text} />
      <Text color="text" fontSize={16} style={{ flex: 1 }}>
        {label}
      </Text>
      <Text color="muted" fontSize={14} fontVariant={['tabular-nums']}>
        {value}
      </Text>
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
      <YStack style={{ flex: 1, justifyContent: 'flex-end' }}>
        <YStack
          onPress={closeAll}
          accessibilityLabel="Close settings"
          style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.55)' }}
        />
        <YStack
          backgroundColor="cardRaised"
          style={
            {
              borderTopLeftRadius: radii.lg + 4,
              borderTopRightRadius: radii.lg + 4,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.sm,
              maxHeight: '72%',
              paddingBottom: Math.max(insets.bottom, spacing.lg),
            } as ViewStyle
          }
        >
          <YStack
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.line,
              marginBottom: spacing.md,
            }}
          />
          {panel !== 'root' ? (
            <XStack style={{ alignItems: 'center', marginBottom: spacing.md, gap: spacing.sm }}>
              <AppPressable
                accessibilityRole="button"
                onPress={() => setPanel('root')}
                style={{
                  minWidth: 40,
                  minHeight: 40,
                  alignItems: 'center',
                  justifyContent: 'center',
                  marginLeft: -8,
                }}
              >
                <Ionicons name="chevron-back" size={22} color={colors.text} />
              </AppPressable>
              <Text color="text" fontSize={18} fontWeight="700">
                {panel === 'speed'
                  ? 'Playback speed'
                  : panel === 'sleep'
                    ? 'Sleep timer'
                    : panel === 'loop'
                      ? 'Loop'
                      : 'Skip intervals'}
              </Text>
            </XStack>
          ) : (
            <Text color="text" fontSize={18} fontWeight="700" style={{ marginBottom: spacing.md }}>
              Playback settings
            </Text>
          )}

          <ScrollView style={{ flexGrow: 0 }} keyboardShouldPersistTaps="handled">
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
              <XStack style={{ flexWrap: 'wrap', paddingBottom: spacing.lg, gap: spacing.sm }}>
                {SPEEDS.map((value) => (
                  <AppPressable
                    key={value}
                    accessibilityRole="button"
                    haptic
                    onPress={() => {
                      onSpeed(value);
                      setPanel('root');
                    }}
                    style={{
                      minHeight: 40,
                      paddingHorizontal: spacing.md,
                      borderRadius: radii.pill,
                      backgroundColor: speed === value ? colors.accent : colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text color={speed === value ? 'background' : 'text'} fontSize={15} fontWeight="600">
                      {value === 1 ? 'Normal' : `${value}×`}
                    </Text>
                  </AppPressable>
                ))}
              </XStack>
            ) : null}

            {panel === 'sleep' ? (
              <XStack style={{ flexWrap: 'wrap', paddingBottom: spacing.lg, gap: spacing.sm }}>
                {SLEEP_MINUTES.map((minutes) => (
                  <AppPressable
                    key={minutes}
                    accessibilityRole="button"
                    haptic
                    onPress={() => {
                      onSleep(sleepMinutes === minutes ? null : minutes);
                      setPanel('root');
                    }}
                    style={{
                      minHeight: 40,
                      paddingHorizontal: spacing.md,
                      borderRadius: radii.pill,
                      backgroundColor: sleepMinutes === minutes ? colors.accent : colors.surface,
                      alignItems: 'center',
                      justifyContent: 'center',
                    }}
                  >
                    <Text color={sleepMinutes === minutes ? 'background' : 'text'} fontSize={15} fontWeight="600">
                      {minutes} min
                    </Text>
                  </AppPressable>
                ))}
                <AppPressable
                  accessibilityRole="button"
                  haptic
                  onPress={() => {
                    onSleep(null);
                    setPanel('root');
                  }}
                  style={{
                    minHeight: 40,
                    paddingHorizontal: spacing.md,
                    borderRadius: radii.pill,
                    backgroundColor: colors.surface,
                    alignItems: 'center',
                    justifyContent: 'center',
                  }}
                >
                  <Text color="text" fontSize={15} fontWeight="600">
                    Off
                  </Text>
                </AppPressable>
              </XStack>
            ) : null}

            {panel === 'loop' ? (
              <YStack style={{ gap: spacing.sm, paddingBottom: spacing.lg }}>
                <XStack style={{ alignItems: 'center', justifyContent: 'space-between', minHeight: 48 }}>
                  <Text color="text" fontSize={16}>
                    Loop section
                  </Text>
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
                </XStack>
                <AppPressable
                  accessibilityRole="button"
                  haptic
                  onPress={replayLastTenSeconds}
                  style={{
                    minHeight: 48,
                    justifyContent: 'center',
                    paddingHorizontal: spacing.md,
                    borderRadius: radii.md,
                    backgroundColor: colors.surface,
                  }}
                >
                  <Text color="text" fontSize={15} fontWeight="600">
                    Replay last 10 seconds
                  </Text>
                </AppPressable>
                <AppPressable
                  accessibilityRole="button"
                  haptic
                  onPress={() => onLoop({ ...loop, aMs: Math.round(positionMs) })}
                  style={{
                    minHeight: 48,
                    justifyContent: 'center',
                    paddingHorizontal: spacing.md,
                    borderRadius: radii.md,
                    backgroundColor: colors.surface,
                  }}
                >
                  <Text color="text" fontSize={15} fontWeight="600">
                    Set A at {formatClock(positionMs)}
                  </Text>
                </AppPressable>
                <AppPressable
                  accessibilityRole="button"
                  haptic
                  onPress={() => onLoop({ ...loop, bMs: Math.round(positionMs) })}
                  style={{
                    minHeight: 48,
                    justifyContent: 'center',
                    paddingHorizontal: spacing.md,
                    borderRadius: radii.md,
                    backgroundColor: colors.surface,
                  }}
                >
                  <Text color="text" fontSize={15} fontWeight="600">
                    Set B at {formatClock(positionMs)}
                  </Text>
                </AppPressable>
                {loopOn ? (
                  <Text color="accent" fontSize={14} style={{ marginTop: spacing.sm }}>
                    Looping {formatClock(loop.aMs!)} – {formatClock(loop.bMs!)}
                  </Text>
                ) : null}
              </YStack>
            ) : null}

            {panel === 'skip' ? (
              <YStack style={{ gap: spacing.md, paddingBottom: spacing.lg }}>
                <Text color="muted" fontSize={13} fontWeight="600" textTransform="uppercase">
                  Rewind
                </Text>
                <XStack
                  style={{
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: colors.surface,
                    borderRadius: radii.md,
                    padding: spacing.sm,
                  }}
                >
                  <AppPressable
                    accessibilityRole="button"
                    onPress={() => onSkips({ ...skips, backMs: skips.backMs - 5000 })}
                    style={{ minWidth: 56, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text color="accent" fontSize={15} fontWeight="700">
                      −5s
                    </Text>
                  </AppPressable>
                  <Text color="text" fontSize={17} fontWeight="700" fontVariant={['tabular-nums']}>
                    {Math.round(skips.backMs / 1000)} sec
                  </Text>
                  <AppPressable
                    accessibilityRole="button"
                    onPress={() => onSkips({ ...skips, backMs: skips.backMs + 5000 })}
                    style={{ minWidth: 56, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text color="accent" fontSize={15} fontWeight="700">
                      +5s
                    </Text>
                  </AppPressable>
                </XStack>
                <Text color="muted" fontSize={13} fontWeight="600" textTransform="uppercase">
                  Skip forward
                </Text>
                <XStack
                  style={{
                    alignItems: 'center',
                    justifyContent: 'space-between',
                    backgroundColor: colors.surface,
                    borderRadius: radii.md,
                    padding: spacing.sm,
                  }}
                >
                  <AppPressable
                    accessibilityRole="button"
                    onPress={() => onSkips({ ...skips, forwardMs: skips.forwardMs - 5000 })}
                    style={{ minWidth: 56, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text color="accent" fontSize={15} fontWeight="700">
                      −5s
                    </Text>
                  </AppPressable>
                  <Text color="text" fontSize={17} fontWeight="700" fontVariant={['tabular-nums']}>
                    {Math.round(skips.forwardMs / 1000)} sec
                  </Text>
                  <AppPressable
                    accessibilityRole="button"
                    onPress={() => onSkips({ ...skips, forwardMs: skips.forwardMs + 5000 })}
                    style={{ minWidth: 56, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                  >
                    <Text color="accent" fontSize={15} fontWeight="700">
                      +5s
                    </Text>
                  </AppPressable>
                </XStack>
              </YStack>
            ) : null}
          </ScrollView>
        </YStack>
      </YStack>
    </Modal>
  );
}

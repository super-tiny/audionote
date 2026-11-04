import { Ionicons } from '@expo/vector-icons';
import { useIsPlaying, useProgress } from '@rntp/player';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';

import type { ListenRange } from '../library/ranges';
import { formatClock } from '../notes/capture';
import { readSkips, skipBy, togglePlayback } from '../playback/engine';
import { AppPressable } from './AppPressable';
import { ArtworkAvatar } from './ArtworkAvatar';
import { ScrubBar, type ScrubSeekSource } from './ScrubBar';
import { displayTitle } from './displayTitle';
import { actionHaptic } from './haptics';
import { colors, elevation, spacing } from './theme';

type Marker = { id: string; positionMs: number };

type PlaybackDockFullProps = {
  variant: 'full';
  title: string;
  durationMs: number;
  positionMs: number;
  heard: readonly ListenRange[];
  markers: readonly Marker[];
  scrubMs: number | null;
  onScrub: (positionMs: number | null) => void;
  onSeek: (positionMs: number, fromMs: number, source: ScrubSeekSource) => void;
  onScrubPreview?: (fromMs: number, toMs: number) => void;
  onScrubCancel?: () => void;
  jumpsCount?: number;
  onOpenJumps?: () => void;
  onOpenSettings: () => void;
};

type PlaybackDockMiniProps = {
  variant: 'mini';
  title: string;
  onOpen: () => void;
};

export type PlaybackDockProps = PlaybackDockFullProps | PlaybackDockMiniProps;

export function PlaybackDock(props: PlaybackDockProps) {
  const playing = useIsPlaying();
  const progress = useProgress(0.5);
  const insets = useSafeAreaInsets();
  const skips = readSkips();
  const miniDurationMs = Math.max(0, progress.duration * 1000);
  const miniPositionMs = progress.position * 1000;

  function onPlayPause(): void {
    actionHaptic();
    togglePlayback();
  }

  function onSkipBack(): void {
    actionHaptic();
    skipBy(-skips.backMs);
  }

  function onSkipForward(): void {
    actionHaptic();
    skipBy(skips.forwardMs);
  }

  if (props.variant === 'mini') {
    return (
      <XStack
        style={{
          alignItems: 'center',
          borderTopWidth: 0.5,
          borderTopColor: colors.line,
          backgroundColor: '#1A2E28',
          paddingTop: spacing.sm,
          paddingHorizontal: spacing.md,
          paddingBottom: Math.max(insets.bottom, spacing.sm),
          gap: spacing.sm,
          ...elevation.card,
        }}
      >
        <AppPressable
          accessibilityRole="button"
          onPress={props.onOpen}
          style={{ flex: 1, flexDirection: 'row', alignItems: 'center', gap: spacing.md, minHeight: 56 }}
        >
          <ArtworkAvatar title={props.title} size={44} />
          <YStack style={{ flex: 1, gap: 2 }}>
            <Text numberOfLines={1} color="text" fontSize={15} fontWeight="700">
              {displayTitle(props.title, 40)}
            </Text>
            <Text color="muted" fontSize={12} fontVariant={['tabular-nums']}>
              {formatClock(miniPositionMs)}
              {miniDurationMs ? ` / ${formatClock(miniDurationMs)}` : ''}
            </Text>
          </YStack>
        </AppPressable>
        <XStack style={{ alignItems: 'center', gap: spacing.sm }}>
          <AppPressable
            accessibilityLabel={`Rewind ${Math.round(skips.backMs / 1000)} seconds`}
            haptic
            onPress={onSkipBack}
            style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="play-back" size={26} color={colors.text} />
          </AppPressable>
          <AppPressable
            accessibilityLabel={playing ? 'Pause' : 'Play'}
            haptic
            onPress={onPlayPause}
            style={{
              width: 46,
              height: 46,
              borderRadius: 23,
              backgroundColor: colors.accent,
              alignItems: 'center',
              justifyContent: 'center',
            }}
          >
            <Ionicons name={playing ? 'pause' : 'play'} size={26} color={colors.background} />
          </AppPressable>
          <AppPressable
            accessibilityLabel={`Skip forward ${Math.round(skips.forwardMs / 1000)} seconds`}
            haptic
            onPress={onSkipForward}
            style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="play-forward" size={26} color={colors.text} />
          </AppPressable>
        </XStack>
      </XStack>
    );
  }

  return (
    <YStack
      backgroundColor="surface"
      style={{
        borderTopWidth: 0.5,
        borderTopColor: colors.line,
        paddingTop: spacing.sm,
        paddingHorizontal: spacing.lg,
        paddingBottom: Math.max(insets.bottom, spacing.sm),
        gap: spacing.xs,
        ...elevation.card,
      }}
    >
      <ScrubBar
        durationMs={props.durationMs}
        positionMs={props.scrubMs ?? props.positionMs}
        heard={props.heard}
        markers={props.markers}
        onSeek={props.onSeek}
        onScrub={props.onScrub}
        onScrubPreview={props.onScrubPreview}
        onScrubCancel={props.onScrubCancel}
      />
      <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginTop: -4 }}>
        <Text color="muted" fontSize={12} fontVariant={['tabular-nums']} fontWeight="600">
          {formatClock(props.scrubMs ?? props.positionMs)}
        </Text>
        {props.onOpenJumps ? (
          <AppPressable
            accessibilityRole="button"
            accessibilityLabel={props.jumpsCount ? `Jumps, ${props.jumpsCount}` : 'Jumps'}
            accessibilityHint="Opens positions you can return to"
            onPress={props.onOpenJumps}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              justifyContent: 'center',
              gap: 4,
              minHeight: 32,
              paddingHorizontal: spacing.sm,
            }}
          >
            <Ionicons
              name="time-outline"
              size={15}
              color={props.jumpsCount ? colors.accent : colors.muted}
            />
            <Text color={props.jumpsCount ? 'accent' : 'muted'} fontSize={12} fontWeight="700">
              Jumps{props.jumpsCount ? ` ${props.jumpsCount}` : ''}
            </Text>
          </AppPressable>
        ) : null}
        <Text color="muted" fontSize={12} fontVariant={['tabular-nums']} fontWeight="600">
          {props.durationMs ? formatClock(props.durationMs) : '—'}
        </Text>
      </XStack>
      <YStack style={{ position: 'relative', minHeight: 72, justifyContent: 'center', paddingVertical: spacing.sm }}>
        <XStack style={{ alignItems: 'center', justifyContent: 'space-between', zIndex: 1 }}>
          <AppPressable
            accessibilityLabel={`Rewind ${Math.round(skips.backMs / 1000)} seconds`}
            haptic
            onPress={onSkipBack}
            style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
          >
            <Ionicons name="play-back" size={30} color={colors.text} />
          </AppPressable>
          <XStack style={{ alignItems: 'center', gap: spacing.xs }}>
            <AppPressable
              accessibilityLabel={`Skip forward ${Math.round(skips.forwardMs / 1000)} seconds`}
              haptic
              onPress={onSkipForward}
              style={{ minWidth: 48, minHeight: 48, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="play-forward" size={30} color={colors.text} />
            </AppPressable>
            <AppPressable
              accessibilityLabel="Playback settings"
              haptic
              onPress={props.onOpenSettings}
              style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
            >
              <Ionicons name="settings-outline" size={24} color={colors.text} />
            </AppPressable>
          </XStack>
        </XStack>
        <AppPressable
          accessibilityLabel={playing ? 'Pause' : 'Play'}
          haptic
          onPress={onPlayPause}
          style={{
            position: 'absolute',
            top: '50%',
            left: '50%',
            width: 64,
            height: 64,
            marginTop: -32,
            marginLeft: -32,
            borderRadius: 32,
            backgroundColor: colors.accent,
            alignItems: 'center',
            justifyContent: 'center',
            zIndex: 2,
          }}
        >
          <Ionicons name={playing ? 'pause' : 'play'} size={32} color={colors.background} />
        </AppPressable>
      </YStack>
    </YStack>
  );
}

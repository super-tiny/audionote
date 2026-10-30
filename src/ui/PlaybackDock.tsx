import { Ionicons } from '@expo/vector-icons';
import { useIsPlaying, useProgress } from '@rntp/player';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ListenRange } from '../library/ranges';
import { formatClock } from '../notes/capture';
import { readSkips, skipBy, togglePlayback } from '../playback/engine';
import { AppPressable } from './AppPressable';
import { ArtworkAvatar } from './ArtworkAvatar';
import { ScrubBar } from './ScrubBar';
import { displayTitle } from './displayTitle';
import { actionHaptic } from './haptics';
import { colors, elevation, radii, spacing } from './theme';

type Marker = { id: string; positionMs: number };

type PlaybackDockBase = {
  title: string;
  durationMs: number;
  positionMs: number;
};

type PlaybackDockFullProps = PlaybackDockBase & {
  variant: 'full';
  heard: readonly ListenRange[];
  markers: readonly Marker[];
  scrubMs: number | null;
  onScrub: (positionMs: number | null) => void;
  onSeek: (positionMs: number) => void;
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
      <View style={[styles.miniWrap, elevation.card, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
        <Pressable accessibilityRole="button" onPress={props.onOpen} style={styles.miniMain}>
          <ArtworkAvatar title={props.title} size={44} />
          <View style={styles.miniMeta}>
            <Text numberOfLines={1} style={styles.miniTitle}>
              {displayTitle(props.title, 40)}
            </Text>
            <Text style={styles.miniTime}>
              {formatClock(miniPositionMs)}
              {miniDurationMs ? ` / ${formatClock(miniDurationMs)}` : ''}
            </Text>
          </View>
        </Pressable>
        <View style={styles.controls}>
          <AppPressable accessibilityLabel={`Rewind ${Math.round(skips.backMs / 1000)} seconds`} haptic onPress={onSkipBack} style={styles.controlBtn}>
            <Ionicons name="play-skip-back" size={24} color={colors.text} />
          </AppPressable>
          <AppPressable accessibilityLabel={playing ? 'Pause' : 'Play'} haptic onPress={onPlayPause} style={styles.playBtn}>
            <Ionicons name={playing ? 'pause' : 'play'} size={26} color={colors.background} />
          </AppPressable>
          <AppPressable accessibilityLabel={`Skip forward ${Math.round(skips.forwardMs / 1000)} seconds`} haptic onPress={onSkipForward} style={styles.controlBtn}>
            <Ionicons name="play-skip-forward" size={24} color={colors.text} />
          </AppPressable>
        </View>
      </View>
    );
  }

  return (
    <View style={[styles.fullWrap, elevation.card, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <ScrubBar
        durationMs={props.durationMs}
        positionMs={props.scrubMs ?? props.positionMs}
        heard={props.heard}
        markers={props.markers}
        onSeek={props.onSeek}
        onScrub={props.onScrub}
      />
      <View style={styles.times}>
        <Text style={styles.time}>{formatClock(props.scrubMs ?? props.positionMs)}</Text>
        <Text style={styles.time}>{props.durationMs ? formatClock(props.durationMs) : '—'}</Text>
      </View>
      <View style={styles.controls}>
        <AppPressable accessibilityLabel={`Rewind ${Math.round(skips.backMs / 1000)} seconds`} haptic onPress={onSkipBack} style={styles.controlBtn}>
          <Ionicons name="play-skip-back" size={28} color={colors.text} />
        </AppPressable>
        <AppPressable accessibilityLabel={playing ? 'Pause' : 'Play'} haptic onPress={onPlayPause} style={styles.playBtnLarge}>
          <Ionicons name={playing ? 'pause' : 'play'} size={32} color={colors.background} />
        </AppPressable>
        <AppPressable accessibilityLabel={`Skip forward ${Math.round(skips.forwardMs / 1000)} seconds`} haptic onPress={onSkipForward} style={styles.controlBtn}>
          <Ionicons name="play-skip-forward" size={28} color={colors.text} />
        </AppPressable>
        <AppPressable accessibilityLabel="Playback settings" haptic onPress={props.onOpenSettings} style={styles.settingsBtn}>
          <Ionicons name="settings-outline" size={24} color={colors.text} />
        </AppPressable>
      </View>
    </View>
  );
}

const styles = StyleSheet.create({
  fullWrap: {
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  times: {
    flexDirection: 'row',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  time: {
    color: colors.muted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  controls: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: spacing.md,
    paddingVertical: spacing.sm,
  },
  controlBtn: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnLarge: {
    width: 64,
    height: 64,
    borderRadius: 32,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
  settingsBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginLeft: spacing.xs,
  },
  miniWrap: {
    flexDirection: 'row',
    alignItems: 'center',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: '#1A2E28',
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  miniMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
  },
  miniMeta: {
    flex: 1,
    gap: 2,
  },
  miniTitle: {
    color: colors.text,
    fontSize: 15,
    fontWeight: '700',
  },
  miniTime: {
    color: colors.muted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
  },
  playBtn: {
    width: 46,
    height: 46,
    borderRadius: 23,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

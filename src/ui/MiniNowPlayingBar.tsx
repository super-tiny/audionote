import { Ionicons } from '@expo/vector-icons';
import { useIsPlaying, useProgress } from '@rntp/player';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { formatClock } from '../notes/capture';
import { AppPressable } from './AppPressable';
import { ArtworkAvatar } from './ArtworkAvatar';
import { displayTitle } from './displayTitle';
import { togglePlayback } from '../playback/engine';
import { colors, radii, spacing } from './theme';

type MiniNowPlayingBarProps = {
  title: string;
  onOpen: () => void;
};

export function MiniNowPlayingBar({ title, onOpen }: MiniNowPlayingBarProps) {
  const playing = useIsPlaying();
  const progress = useProgress(0.5);
  const durationMs = progress.duration * 1000;
  const positionMs = progress.position * 1000;
  const fraction = durationMs > 0 ? Math.min(1, positionMs / durationMs) : 0;

  return (
    <Pressable accessibilityRole="button" onPress={onOpen} style={styles.wrap}>
      <ArtworkAvatar title={title} size={40} />
      <View style={styles.meta}>
        <Text numberOfLines={1} style={styles.title}>
          {displayTitle(title, 36)}
        </Text>
        <View style={styles.progressTrack}>
          <View style={[styles.progressFill, { width: `${fraction * 100}%` }]} />
        </View>
        <Text style={styles.time}>
          {formatClock(positionMs)}
          {durationMs ? ` / ${formatClock(durationMs)}` : ''}
        </Text>
      </View>
      <AppPressable
        accessibilityRole="button"
        accessibilityLabel={playing ? 'Pause' : 'Play'}
        haptic
        onPress={togglePlayback}
        style={styles.play}
      >
        <Ionicons name={playing ? 'pause' : 'play'} size={20} color={colors.background} />
      </AppPressable>
    </Pressable>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    padding: spacing.sm,
    borderRadius: radii.lg,
    backgroundColor: colors.cardRaised,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  meta: {
    flex: 1,
    gap: 4,
  },
  title: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  progressTrack: {
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    overflow: 'hidden',
  },
  progressFill: {
    height: 4,
    backgroundColor: colors.accent,
  },
  time: {
    color: colors.muted,
    fontSize: 11,
    fontVariant: ['tabular-nums'],
  },
  play: {
    width: 40,
    height: 40,
    borderRadius: 20,
    backgroundColor: colors.accent,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

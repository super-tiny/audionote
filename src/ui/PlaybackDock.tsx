import { Ionicons } from '@expo/vector-icons';
import { useIsPlaying, useProgress } from '@rntp/player';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { ListenRange } from '../library/ranges';
import { useI18n } from '../i18n/I18nProvider';
import { readSkips, skipBy, togglePlayback } from '../playback/engine';
import { AppPressable } from './AppPressable';
import { ArtworkAvatar } from './ArtworkAvatar';
import { ScrubBar, type ScrubSeekSource } from './ScrubBar';
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
  important?: readonly ListenRange[];
  markers: readonly Marker[];
  scrubMs: number | null;
  onScrub: (positionMs: number | null) => void;
  onSeek: (positionMs: number, fromMs: number, source: ScrubSeekSource) => void;
  onScrubPreview?: (fromMs: number, toMs: number) => void;
  onScrubCancel?: () => void;
  jumpsCount?: number;
  onOpenJumps?: () => void;
  onOpenSettings: () => void;
  importantHintHidden?: boolean;
  onDismissImportantHint?: () => void;
  onShowImportantHint?: () => void;
};

type PlaybackDockMiniProps = {
  variant: 'mini';
  title: string;
  onOpen: () => void;
};

export type PlaybackDockProps = PlaybackDockFullProps | PlaybackDockMiniProps;

function useTransport() {
  const playing = useIsPlaying();
  const skips = readSkips();

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

  return { playing, skips, onPlayPause, onSkipBack, onSkipForward };
}

function MiniPlaybackDock({ title, onOpen }: { title: string; onOpen: () => void }) {
  const progress = useProgress(1);
  const insets = useSafeAreaInsets();
  const { playing, skips, onPlayPause, onSkipBack, onSkipForward } = useTransport();
  const { t, clock, align } = useI18n();
  const miniDurationMs = Math.max(0, progress.duration * 1000);
  const miniPositionMs = progress.position * 1000;

  return (
    <View style={[styles.miniWrap, elevation.card, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <Pressable accessibilityRole="button" onPress={onOpen} style={styles.miniMain}>
        <ArtworkAvatar title={title} size={44} />
        <View style={styles.miniMeta}>
          <Text numberOfLines={1} style={[styles.miniTitle, align]}>
            {displayTitle(title, 40, t('untitled'))}
          </Text>
          <Text style={[styles.miniTime, align]}>
            {clock(miniPositionMs)}
            {miniDurationMs ? ` / ${clock(miniDurationMs)}` : ''}
          </Text>
        </View>
      </Pressable>
      <View style={styles.miniControls}>
        <AppPressable accessibilityLabel={t('rewindSeconds', { count: Math.round(skips.backMs / 1000) })} haptic onPress={onSkipBack} style={styles.controlBtn}>
          <Ionicons name="play-back" size={26} color={colors.text} />
        </AppPressable>
        <AppPressable accessibilityLabel={playing ? t('pause') : t('play')} haptic onPress={onPlayPause} style={styles.playBtn}>
          <Ionicons name={playing ? 'pause' : 'play'} size={26} color={colors.background} />
        </AppPressable>
        <AppPressable accessibilityLabel={t('skipForwardSeconds', { count: Math.round(skips.forwardMs / 1000) })} haptic onPress={onSkipForward} style={styles.controlBtn}>
          <Ionicons name="play-forward" size={26} color={colors.text} />
        </AppPressable>
      </View>
    </View>
  );
}

function FullPlaybackDock(props: PlaybackDockFullProps) {
  const insets = useSafeAreaInsets();
  const { playing, skips, onPlayPause, onSkipBack, onSkipForward } = useTransport();
  const { t, clock } = useI18n();

  return (
    <View style={[styles.fullWrap, elevation.card, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <ScrubBar
        durationMs={props.durationMs}
        positionMs={props.scrubMs ?? props.positionMs}
        heard={props.heard}
        important={props.important}
        markers={props.markers}
        onSeek={props.onSeek}
        onScrub={props.onScrub}
        onScrubPreview={props.onScrubPreview}
        onScrubCancel={props.onScrubCancel}
      />
      {props.important && props.important.length > 0 && !props.importantHintHidden ? (
        <View style={styles.importantHintRow}>
          <Text style={styles.importantHint}>{t('highlightHint')}</Text>
          {props.onDismissImportantHint ? (
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={t('hideHighlightHint')}
              hitSlop={8}
              onPress={props.onDismissImportantHint}
              style={styles.importantHintClose}
            >
              <Ionicons name="close" size={18} color={colors.muted} />
            </Pressable>
          ) : null}
        </View>
      ) : props.important && props.important.length > 0 && props.importantHintHidden && props.onShowImportantHint ? (
        <Pressable
          accessibilityRole="button"
          accessibilityLabel={t('showHighlightHint')}
          onPress={props.onShowImportantHint}
          style={styles.importantHintShow}
        >
          <Text style={styles.importantHintShowText}>{t('showHighlightHint')}</Text>
        </Pressable>
      ) : null}
      <View style={styles.times}>
        <Text style={styles.time}>{clock(props.scrubMs ?? props.positionMs)}</Text>
        {props.onOpenJumps ? (
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={props.jumpsCount ? t('jumpsWithCount', { count: props.jumpsCount }) : t('jumps')}
            accessibilityHint={t('jumpsHint')}
            onPress={props.onOpenJumps}
            style={styles.jumpsButton}
          >
            <Ionicons name="time-outline" size={15} color={props.jumpsCount ? colors.accent : colors.muted} />
            <Text style={[styles.jumpsLabel, props.jumpsCount ? styles.jumpsLabelOn : null]}>
              {props.jumpsCount ? t('jumpsLabelCount', { count: props.jumpsCount }) : t('jumps')}
            </Text>
          </Pressable>
        ) : null}
        <Text style={styles.time}>{props.durationMs ? clock(props.durationMs) : '—'}</Text>
      </View>
      <View style={styles.fullControls}>
        <View style={styles.fullControlsSides}>
          <AppPressable accessibilityLabel={t('rewindSeconds', { count: Math.round(skips.backMs / 1000) })} haptic onPress={onSkipBack} style={styles.controlBtn}>
            <Ionicons name="play-back" size={30} color={colors.text} />
          </AppPressable>
          <View style={styles.fullControlsRight}>
            <AppPressable accessibilityLabel={t('skipForwardSeconds', { count: Math.round(skips.forwardMs / 1000) })} haptic onPress={onSkipForward} style={styles.controlBtn}>
              <Ionicons name="play-forward" size={30} color={colors.text} />
            </AppPressable>
            <AppPressable accessibilityLabel={t('playbackSettings')} haptic onPress={props.onOpenSettings} style={styles.settingsBtn}>
              <Ionicons name="settings-outline" size={24} color={colors.text} />
            </AppPressable>
          </View>
        </View>
        <AppPressable accessibilityLabel={playing ? t('pause') : t('play')} haptic onPress={onPlayPause} style={styles.playBtnLarge}>
          <Ionicons name={playing ? 'pause' : 'play'} size={32} color={colors.background} />
        </AppPressable>
      </View>
    </View>
  );
}

export function PlaybackDock(props: PlaybackDockProps) {
  if (props.variant === 'mini') {
    return <MiniPlaybackDock title={props.title} onOpen={props.onOpen} />;
  }
  return <FullPlaybackDock {...props} />;
}

const styles = StyleSheet.create({
  fullWrap: {
    direction: 'ltr',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.lg,
    gap: spacing.xs,
  },
  importantHintRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  importantHint: {
    flex: 1,
    color: colors.important,
    fontSize: 12,
    fontWeight: '700',
  },
  importantHintClose: {
    minWidth: 32,
    minHeight: 32,
    alignItems: 'center',
    justifyContent: 'center',
  },
  importantHintShow: {
    alignSelf: 'flex-start',
    minHeight: 28,
    justifyContent: 'center',
  },
  importantHintShowText: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
    textDecorationLine: 'underline',
  },
  times: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginTop: -4,
  },
  jumpsButton: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 32,
    paddingHorizontal: spacing.sm,
  },
  jumpsLabel: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '700',
  },
  jumpsLabelOn: {
    color: colors.accent,
  },
  time: {
    color: colors.muted,
    fontSize: 12,
    fontVariant: ['tabular-nums'],
    fontWeight: '600',
  },
  fullControls: {
    position: 'relative',
    minHeight: 72,
    justifyContent: 'center',
    paddingVertical: spacing.sm,
  },
  fullControlsSides: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    zIndex: 1,
  },
  fullControlsRight: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.xs,
  },
  miniControls: {
    direction: 'ltr',
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
  },
  controlBtn: {
    minWidth: 48,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  playBtnLarge: {
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
  },
  settingsBtn: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
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

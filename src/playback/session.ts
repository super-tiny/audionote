import TrackPlayer, { Event, PlaybackState, PlayerCommand } from '@rntp/player';

import { ensureDatabase } from '../db/open';
import { writeSkips, readSkips } from './engine';
import { cancelPausedJumpFlush, flushJumpHistoryIfStillPaused } from './jumpHistory';
import { flushProgress, recordSyncedProgress, startProgressTicker } from './persist';

/**
 * Process-scoped playback setup. Registered from the entry file so lock-screen
 * and headset events still have a player after the UI unmounts.
 */
export function registerPlaybackSession(): void {
  TrackPlayer.registerPlaybackSession(() => {
    ensureDatabase();
    TrackPlayer.setupPlayer({
      contentType: 'speech',
      handleAudioBecomingNoisy: true,
      // Native samples keep arriving while the app is minimized or the screen is locked.
      progressSync: { intervalSeconds: 1 },
      android: {
        wakeMode: 'network',
        taskRemovedBehavior: 'continue',
      },
    });

    const skips = readSkips();
    TrackPlayer.setCommands({
      capabilities: [
        PlayerCommand.PlayPause,
        PlayerCommand.Seek,
        PlayerCommand.SkipBackward,
        PlayerCommand.SkipForward,
      ],
      backwardInterval: Math.round(skips.backMs / 1000),
      forwardInterval: Math.round(skips.forwardMs / 1000),
    });

    TrackPlayer.addEventListener(Event.PlaybackError, ({ code }) => {
      if (code === 'network') {
        TrackPlayer.retry();
      }
    });
    TrackPlayer.addEventListener(Event.IsPlayingChanged, ({ playing }) => {
      if (!playing) {
        flushProgress();
        flushJumpHistoryIfStillPaused();
      } else {
        cancelPausedJumpFlush();
        flushProgress();
      }
    });
    TrackPlayer.addEventListener(Event.PlaybackStateChanged, ({ state }) => {
      if (state === PlaybackState.Ended) {
        flushProgress({ ended: true });
      }
    });
    TrackPlayer.addEventListener(Event.PlaybackProgressUpdated, (event) => {
      recordSyncedProgress(event);
    });
    startProgressTicker();
  });
}

export { writeSkips };

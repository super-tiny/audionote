import TrackPlayer, { Event, PlayerCommand } from '@rntp/player';

/**
 * Process-scoped playback setup. Registered from the entry file so lock-screen
 * and headset events still have a player after the UI unmounts.
 */
export function registerPlaybackSession(): void {
  TrackPlayer.registerPlaybackSession(() => {
    TrackPlayer.setupPlayer({
      contentType: 'speech',
      handleAudioBecomingNoisy: true,
      android: {
        wakeMode: 'network',
        taskRemovedBehavior: 'continue',
      },
    });

    TrackPlayer.setCommands({
      capabilities: [
        PlayerCommand.PlayPause,
        PlayerCommand.Seek,
        PlayerCommand.SkipBackward,
        PlayerCommand.SkipForward,
      ],
      backwardInterval: 15,
      forwardInterval: 30,
    });

    TrackPlayer.addEventListener(Event.PlaybackError, ({ code }) => {
      if (code === 'network') {
        TrackPlayer.retry();
      }
    });
  });
}

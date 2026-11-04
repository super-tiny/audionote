import TrackPlayer from '@rntp/player';

import { resetStoredProgress, savePlayback } from '../db/library';
import { dropPendingJump } from './jumpHistory';
import { beginProgressReset } from './persist';

/**
 * Clears listened ranges, resume position, and jump history for one lesson.
 * Notes, speed, and the audio file are left as they are. If this lesson is
 * loaded, the playhead returns to the start so the next samples do not
 * rewrite the progress that was just cleared.
 */
export function resetItemPlayback(itemId: string): void {
  beginProgressReset(itemId);
  dropPendingJump(itemId);
  resetStoredProgress(itemId);
  try {
    if (TrackPlayer.getActiveMediaItem()?.mediaId === itemId) {
      const speed = TrackPlayer.getPlaybackSpeed();
      TrackPlayer.seekTo(0);
      savePlayback(itemId, 0, speed);
    }
  } catch {
    // The stored rows are already cleared. Playback can catch up on the next open.
  }
}

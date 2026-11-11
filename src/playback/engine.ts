import TrackPlayer, { PlayerCommand } from '@rntp/player';

import { getSetting, savePlayback, setSetting } from '../db/library';
import type { AudioItem } from '../db/types';
import { parseLocale } from '../i18n/languages';
import { messages } from '../i18n/messages';
import { releaseItem, resolveItemUri } from '../library/files';
import { flushJumpHistory } from './jumpHistory';
import { flushProgress } from './persist';

export const SPEEDS = [0.5, 0.75, 1, 1.25, 1.5, 1.75, 2, 2.5, 3] as const;
export const SLEEP_MINUTES = [15, 30, 45, 60] as const;

const SKIP_BACK_KEY = 'skip_back_ms';
const SKIP_FORWARD_KEY = 'skip_forward_ms';

export type SkipSettings = {
  backMs: number;
  forwardMs: number;
};

let heldBookmark: string | null = null;

export function readSkips(): SkipSettings {
  const back = Number(getSetting(SKIP_BACK_KEY));
  const forward = Number(getSetting(SKIP_FORWARD_KEY));
  return {
    backMs: Number.isFinite(back) && back >= 5000 ? back : 15_000,
    forwardMs: Number.isFinite(forward) && forward >= 5000 ? forward : 30_000,
  };
}

export function writeSkips(skips: SkipSettings): void {
  const backMs = clampSkip(skips.backMs);
  const forwardMs = clampSkip(skips.forwardMs);
  setSetting(SKIP_BACK_KEY, String(backMs));
  setSetting(SKIP_FORWARD_KEY, String(forwardMs));
  TrackPlayer.setCommands({
    capabilities: [
      PlayerCommand.PlayPause,
      PlayerCommand.Seek,
      PlayerCommand.SkipBackward,
      PlayerCommand.SkipForward,
    ],
    backwardInterval: Math.round(backMs / 1000),
    forwardInterval: Math.round(forwardMs / 1000),
  });
}

function clampSkip(ms: number): number {
  return Math.min(120_000, Math.max(5_000, Math.round(ms / 5000) * 5000));
}

export async function openItem(item: AudioItem): Promise<boolean> {
  flushProgress();
  flushJumpHistory();
  if (heldBookmark && heldBookmark !== item.bookmark) {
    releaseItem({ bookmark: heldBookmark });
    heldBookmark = null;
  }
  const uri = await resolveItemUri(item);
  if (!uri) {
    return false;
  }
  heldBookmark = item.bookmark;
  const active = TrackPlayer.getActiveMediaItem();
  if (active?.mediaId !== item.id) {
    TrackPlayer.setMediaItem({
      mediaId: item.id,
      url: uri,
      title: item.title,
      artist: messages[parseLocale(getSetting('locale')) ?? 'en'].appName,
      mimeType: item.format === 'mp3' ? 'audio/mpeg' : item.format === 'm4a' ? 'audio/mp4' : undefined,
      duration: item.durationMs ? item.durationMs / 1000 : undefined,
    });
    TrackPlayer.setPlaybackSpeed(item.speed || 1);
    if (item.positionMs > 500) {
      TrackPlayer.seekTo(item.positionMs / 1000);
    }
  }
  TrackPlayer.play();
  return true;
}

export function togglePlayback(): void {
  if (TrackPlayer.isPlaying()) {
    TrackPlayer.pause();
    flushProgress();
    flushJumpHistory();
  } else {
    TrackPlayer.play();
  }
}

export function seekToMs(positionMs: number): void {
  flushProgress();
  TrackPlayer.seekTo(Math.max(0, positionMs) / 1000);
}

/** Skip buttons, double-tap, and replay. These are not jump history. */
export function skipBy(ms: number): void {
  flushProgress();
  TrackPlayer.seekBy(ms / 1000);
}

export function setSpeed(speed: number): void {
  TrackPlayer.setPlaybackSpeed(speed);
  const item = TrackPlayer.getActiveMediaItem();
  if (item?.mediaId) {
    const positionMs = TrackPlayer.getProgress().position * 1000;
    savePlayback(item.mediaId, positionMs, speed);
  }
}

export function replayLastTenSeconds(): void {
  skipBy(-10_000);
}

export function startSleep(minutes: number): void {
  TrackPlayer.sleepAfterTime(minutes * 60);
}

export function stopSleep(): void {
  TrackPlayer.cancelSleepTimer();
}

import type { PickAudioResult, ResolvedBookmark } from './types';

export type { PickAudioResult, PickedAudio, ResolvedBookmark } from './types';

export function pickAudio(): Promise<PickAudioResult> {
  return Promise.reject(new Error('Audio import is available in the Android and iOS app.'));
}

export function resolveBookmark(_bookmark: string): Promise<ResolvedBookmark> {
  return Promise.reject(new Error('Bookmarks are available in the iOS app.'));
}

export function releaseAccess(_bookmark: string): void {}

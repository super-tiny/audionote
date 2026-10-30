import { requireNativeModule } from 'expo-modules-core';

import type { PickAudioResult, ResolvedBookmark } from './types';

export type { PickAudioResult, PickedAudio, ResolvedBookmark } from './types';

type AudioNoteFileAccessModule = {
  pickAudio(): Promise<PickAudioResult>;
  resolveBookmark(bookmark: string): Promise<ResolvedBookmark>;
  releaseAccess(bookmark: string): void;
};

const native = requireNativeModule<AudioNoteFileAccessModule>('AudioNoteFileAccess');

export function pickAudio(): Promise<PickAudioResult> {
  return native.pickAudio();
}

export function resolveBookmark(bookmark: string): Promise<ResolvedBookmark> {
  return native.resolveBookmark(bookmark);
}

export function releaseAccess(bookmark: string): void {
  native.releaseAccess(bookmark);
}

export type PickedAudio = {
  uri: string;
  name: string;
  size: number;
  mimeType: string | null;
  bookmark: string | null;
};

export type PickAudioResult = { canceled: true } | { canceled: false; files: PickedAudio[] };

export type ResolvedBookmark = {
  uri: string;
  bookmark: string | null;
  stale: boolean;
};

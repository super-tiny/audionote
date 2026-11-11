import { createContext, useContext, useMemo, type ReactNode } from 'react';
import { useIsPlaying, useProgress } from '@rntp/player';

export type PlayerClock = {
  positionMs: number;
  durationMs: number;
  playing: boolean;
};

const PlayerClockContext = createContext<PlayerClock | null>(null);

/**
 * One playback poll for the whole player screen.
 * Children passed in from a parent that does not use this clock stay put,
 * so the notes list does not redraw on every playhead sample.
 */
export function PlayerClockProvider({ children }: { children: ReactNode }) {
  const playing = useIsPlaying();
  const progress = useProgress(0.25);
  const value = useMemo<PlayerClock>(
    () => ({
      positionMs: progress.position * 1000,
      durationMs: progress.duration * 1000,
      playing,
    }),
    [progress.position, progress.duration, playing],
  );
  return <PlayerClockContext.Provider value={value}>{children}</PlayerClockContext.Provider>;
}

export function usePlayerClock(): PlayerClock {
  const value = useContext(PlayerClockContext);
  if (!value) {
    throw new Error('usePlayerClock must be used within PlayerClockProvider');
  }
  return value;
}

import { useMemo, useRef, useState } from 'react';
import type { ViewStyle } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';
import { Text, YStack } from 'tamagui';

import type { ListenRange } from '../library/ranges';
import { formatClock } from '../notes/capture';
import { colors, radii, spacing } from './theme';

type Marker = {
  id: string;
  positionMs: number;
};

export type ScrubSeekSource = 'scrub' | 'timeline';

type ScrubBarProps = {
  durationMs: number;
  positionMs: number;
  heard: readonly ListenRange[];
  markers: readonly Marker[];
  onSeek: (positionMs: number, fromMs: number, source: ScrubSeekSource) => void;
  onScrub: (positionMs: number | null) => void;
  onScrubPreview?: (fromMs: number, toMs: number) => void;
  onScrubCancel?: () => void;
};

function clamp(value: number, max: number): number {
  if (max <= 0) {
    return 0;
  }
  return Math.min(max, Math.max(0, value));
}

export function ScrubBar({
  durationMs,
  positionMs,
  heard,
  markers,
  onSeek,
  onScrub,
  onScrubPreview,
  onScrubCancel,
}: ScrubBarProps) {
  const widthRef = useRef(1);
  const durationRef = useRef(durationMs);
  const positionRef = useRef(positionMs);
  const originRef = useRef(0);
  const previewRef = useRef<number | null>(null);
  const seekRef = useRef(onSeek);
  const scrubRef = useRef(onScrub);
  const previewSeekRef = useRef(onScrubPreview);
  const cancelScrubRef = useRef(onScrubCancel);
  const [preview, setPreview] = useState<number | null>(null);

  durationRef.current = durationMs;
  positionRef.current = positionMs;
  seekRef.current = onSeek;
  scrubRef.current = onScrub;
  previewSeekRef.current = onScrubPreview;
  cancelScrubRef.current = onScrubCancel;

  const gesture = useMemo(() => {
    const tap = Gesture.Tap()
      .runOnJS(true)
      .onEnd((event) => {
        const duration = durationRef.current;
        if (duration <= 0) {
          return;
        }
        const from = positionRef.current;
        const next = clamp((event.x / widthRef.current) * duration, duration);
        seekRef.current(next, from, 'timeline');
      });

    const pan = Gesture.Pan()
      .runOnJS(true)
      .onBegin(() => {
        originRef.current = positionRef.current;
      })
      .onUpdate((event) => {
        const duration = durationRef.current;
        if (duration <= 0) {
          return;
        }
        const sensitivity = 1 / (1 + Math.abs(event.translationY) / 100);
        const next = clamp(
          originRef.current + (event.translationX / widthRef.current) * duration * sensitivity,
          duration,
        );
        previewRef.current = next;
        setPreview(next);
        scrubRef.current(next);
        previewSeekRef.current?.(originRef.current, next);
      })
      .onFinalize((_event, success) => {
        const landed = previewRef.current;
        const origin = originRef.current;
        previewRef.current = null;
        setPreview(null);
        scrubRef.current(null);
        if (landed == null) {
          return;
        }
        if (success) {
          seekRef.current(landed, origin, 'scrub');
        } else {
          cancelScrubRef.current?.();
        }
      });

    return Gesture.Exclusive(tap, pan);
  }, []);

  const shown = preview ?? positionMs;
  const fraction = durationMs > 0 ? shown / durationMs : 0;

  return (
    <GestureDetector gesture={gesture}>
      <YStack
        accessibilityRole="adjustable"
        accessibilityLabel="Playback position"
        style={{ paddingTop: 28, paddingBottom: spacing.sm }}
        onLayout={(event) => {
          widthRef.current = Math.max(1, event.nativeEvent.layout.width);
        }}
      >
        {preview != null ? (
          <Text
            color="background"
            fontSize={13}
            fontWeight="700"
            style={
              {
                position: 'absolute',
                top: 0,
                left: `${Math.min(92, Math.max(0, fraction * 100))}%`,
                backgroundColor: colors.accent,
                overflow: 'hidden',
                borderRadius: radii.sm,
                paddingHorizontal: spacing.sm,
                paddingVertical: 2,
              } as ViewStyle
            }
          >
            {formatClock(preview)}
          </Text>
        ) : (
          <YStack style={{ height: 22 }} />
        )}
        <YStack style={{ height: 32, justifyContent: 'center' }}>
          <YStack
            style={{
              position: 'absolute',
              left: 0,
              right: 0,
              top: 13,
              height: 8,
              borderRadius: 4,
              backgroundColor: colors.line,
            }}
          />
          {heard.map((range) => {
            if (durationMs <= 0) {
              return null;
            }
            const start = (range.startMs / durationMs) * 100;
            const width = ((range.endMs - range.startMs) / durationMs) * 100;
            return (
              <YStack
                key={`${range.startMs}-${range.endMs}`}
                backgroundColor="heard"
                style={{
                  position: 'absolute',
                  top: 13,
                  height: 8,
                  borderRadius: 4,
                  left: `${start}%`,
                  width: `${Math.max(0.4, width)}%`,
                }}
              />
            );
          })}
          {markers.map((marker) => (
            <YStack
              key={marker.id}
              backgroundColor="accent"
              style={{
                position: 'absolute',
                top: 8,
                width: 3,
                height: 18,
                marginLeft: -1,
                borderRadius: 2,
                left: `${durationMs > 0 ? (marker.positionMs / durationMs) * 100 : 0}%`,
              }}
            />
          ))}
          <YStack
            style={{
              position: 'absolute',
              top: 8,
              width: 20,
              height: 20,
              marginLeft: -10,
              borderRadius: 10,
              backgroundColor: colors.white,
              borderWidth: 3,
              borderColor: colors.accent,
              left: `${fraction * 100}%`,
            }}
          />
        </YStack>
      </YStack>
    </GestureDetector>
  );
}

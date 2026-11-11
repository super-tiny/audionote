import { useMemo, useRef, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { Gesture, GestureDetector } from 'react-native-gesture-handler';

import type { ListenRange } from '../library/ranges';
import { useI18n } from '../i18n/I18nProvider';
import { colors } from './theme';

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
  /** Finger is down and moving. History stays in memory until release. */
  onScrubPreview?: (fromMs: number, toMs: number) => void;
  /** The drag was cancelled and should not replace an earlier pending jump. */
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
  const { t, clock } = useI18n();

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
      <View
        accessibilityRole="adjustable"
        accessibilityLabel={t('playbackPosition')}
        style={styles.wrap}
        onLayout={(event) => {
          widthRef.current = Math.max(1, event.nativeEvent.layout.width);
        }}
      >
        {preview != null ? (
          <Text style={[styles.bubble, { left: `${Math.min(92, Math.max(0, fraction * 100))}%` }]}>
            {clock(preview)}
          </Text>
        ) : (
          <View style={styles.bubbleSpacer} />
        )}
        <View style={styles.track}>
          <View style={styles.line} />
          {heard.map((range) => {
            if (durationMs <= 0) {
              return null;
            }
            const start = (range.startMs / durationMs) * 100;
            const width = ((range.endMs - range.startMs) / durationMs) * 100;
            return (
              <View
                key={`${range.startMs}-${range.endMs}`}
                style={[styles.heard, { left: `${start}%`, width: `${Math.max(0.4, width)}%` }]}
              />
            );
          })}
          {markers.map((marker) => (
            <View
              key={marker.id}
              style={[
                styles.marker,
                { left: `${durationMs > 0 ? (marker.positionMs / durationMs) * 100 : 0}%` },
              ]}
            />
          ))}
          <View style={[styles.thumb, { left: `${fraction * 100}%` }]} />
        </View>
      </View>
    </GestureDetector>
  );
}

const styles = StyleSheet.create({
  wrap: {
    direction: 'ltr',
    paddingTop: 28,
    paddingBottom: 8,
  },
  bubbleSpacer: {
    height: 22,
  },
  bubble: {
    position: 'absolute',
    top: 0,
    color: colors.background,
    backgroundColor: colors.accent,
    overflow: 'hidden',
    borderRadius: 8,
    paddingHorizontal: 8,
    paddingVertical: 2,
    fontSize: 13,
    fontWeight: '700',
  },
  track: {
    height: 32,
    justifyContent: 'center',
  },
  line: {
    position: 'absolute',
    left: 0,
    right: 0,
    top: 13,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.line,
  },
  heard: {
    position: 'absolute',
    top: 13,
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.heard,
  },
  marker: {
    position: 'absolute',
    top: 8,
    width: 3,
    height: 18,
    marginLeft: -1,
    borderRadius: 2,
    backgroundColor: colors.accent,
  },
  thumb: {
    position: 'absolute',
    top: 8,
    width: 20,
    height: 20,
    marginLeft: -10,
    borderRadius: 10,
    backgroundColor: colors.white,
    borderWidth: 3,
    borderColor: colors.accent,
  },
});

import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { colors, elevation, radii, spacing } from './theme';

export type BottomNavTab = 'library' | 'player';

type BottomNavProps = {
  active: BottomNavTab;
  playerItemId: string | null;
  playerTitle: string | null;
  onLibrary: () => void;
  onPlayer: () => void;
};

export function BottomNav({ active, playerItemId, playerTitle, onLibrary, onPlayer }: BottomNavProps) {
  const insets = useSafeAreaInsets();
  const playerEnabled = playerItemId != null;

  return (
    <View style={[styles.bar, elevation.card, { paddingBottom: Math.max(insets.bottom, spacing.sm) }]}>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: active === 'library' }}
        onPress={onLibrary}
        style={[styles.tab, active === 'library' && styles.tabActive]}
      >
        <Ionicons
          name={active === 'library' ? 'albums' : 'albums-outline'}
          size={22}
          color={active === 'library' ? colors.accent : colors.muted}
        />
        <Text style={[styles.label, active === 'library' && styles.labelActive]}>Library</Text>
      </Pressable>
      <Pressable
        accessibilityRole="tab"
        accessibilityState={{ selected: active === 'player', disabled: !playerEnabled }}
        disabled={!playerEnabled}
        onPress={onPlayer}
        style={[styles.tab, active === 'player' && styles.tabActive, !playerEnabled && styles.tabDisabled]}
      >
        <Ionicons
          name={active === 'player' ? 'headset' : 'headset-outline'}
          size={22}
          color={active === 'player' ? colors.accent : playerEnabled ? colors.muted : colors.line}
        />
        <Text
          numberOfLines={1}
          style={[styles.label, active === 'player' && styles.labelActive, !playerEnabled && styles.labelDisabled]}
        >
          {playerEnabled ? (playerTitle ?? 'Now playing') : 'Now playing'}
        </Text>
      </Pressable>
    </View>
  );
}

const styles = StyleSheet.create({
  bar: {
    flexDirection: 'row',
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
    backgroundColor: colors.surface,
    paddingTop: spacing.sm,
    paddingHorizontal: spacing.md,
    gap: spacing.sm,
  },
  tab: {
    flex: 1,
    alignItems: 'center',
    justifyContent: 'center',
    gap: 4,
    minHeight: 52,
    borderRadius: radii.md,
    paddingHorizontal: spacing.sm,
  },
  tabActive: {
    backgroundColor: colors.cardRaised,
  },
  tabDisabled: {
    opacity: 0.55,
  },
  label: {
    color: colors.muted,
    fontSize: 12,
    fontWeight: '600',
    maxWidth: '100%',
  },
  labelActive: {
    color: colors.accent,
  },
  labelDisabled: {
    color: colors.line,
  },
});

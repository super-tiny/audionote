import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { AppPressable } from './AppPressable';
import { colors, radii, spacing } from './theme';

export type NavigationMenuItem = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail?: string;
  disabled?: boolean;
  onPress: () => void;
};

type NavigationMenuProps = {
  visible: boolean;
  onClose: () => void;
  items: NavigationMenuItem[];
};

export function NavigationMenu({ visible, onClose, items }: NavigationMenuProps) {
  const insets = useSafeAreaInsets();

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close menu" />
      <View style={[styles.panel, { paddingTop: insets.top + spacing.lg, paddingBottom: insets.bottom + spacing.lg }]}>
        <View style={styles.panelHeader}>
          <Text style={styles.panelTitle}>Menu</Text>
          <Pressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose}>
            <Ionicons name="close" size={24} color={colors.muted} />
          </Pressable>
        </View>
        {items.map((item) => (
          <AppPressable
            key={item.label}
            accessibilityRole="button"
            disabled={item.disabled}
            haptic
            onPress={() => {
              onClose();
              item.onPress();
            }}
            style={[styles.item, item.disabled && styles.itemDisabled]}
          >
            <Ionicons name={item.icon} size={22} color={item.disabled ? colors.line : colors.accent} />
            <View style={styles.itemText}>
              <Text style={[styles.itemLabel, item.disabled && styles.itemLabelDisabled]}>{item.label}</Text>
              {item.detail ? <Text style={styles.itemDetail}>{item.detail}</Text> : null}
            </View>
            <Ionicons name="chevron-forward" size={18} color={colors.muted} />
          </AppPressable>
        ))}
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  panel: {
    width: '82%',
    maxWidth: 320,
    height: '100%',
    backgroundColor: colors.surface,
    borderRightWidth: StyleSheet.hairlineWidth,
    borderRightColor: colors.line,
    paddingHorizontal: spacing.lg,
    gap: spacing.sm,
  },
  panelHeader: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    marginBottom: spacing.md,
  },
  panelTitle: {
    color: colors.text,
    fontSize: 22,
    fontWeight: '700',
  },
  item: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.card,
  },
  itemDisabled: {
    opacity: 0.5,
  },
  itemText: {
    flex: 1,
    gap: 2,
  },
  itemLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  itemLabelDisabled: {
    color: colors.muted,
  },
  itemDetail: {
    color: colors.muted,
    fontSize: 13,
  },
});

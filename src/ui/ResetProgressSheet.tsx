import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { displayTitle } from './displayTitle';
import { colors, radii, spacing } from './theme';

type ResetProgressSheetProps = {
  visible: boolean;
  title: string;
  onCancel: () => void;
  onConfirm: () => void;
};

export function ResetProgressSheet({ visible, title, onCancel, onConfirm }: ResetProgressSheetProps) {
  const insets = useSafeAreaInsets();
  const lesson = displayTitle(title, 48);

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onCancel}>
      <View style={styles.fill}>
        <Pressable accessibilityRole="button" accessibilityLabel="Cancel reset" onPress={onCancel} style={styles.backdrop} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <Text style={styles.title}>Reset playback progress?</Text>
          <Text style={styles.lesson}>{lesson}</Text>
          <Text style={styles.body}>
            Listened portions, resume position, and jump history go back to the start. The heard percentage returns to
            0%. Notes stay exactly as they are.
          </Text>
          <View style={styles.actions}>
            <Pressable accessibilityRole="button" onPress={onCancel} style={styles.cancel}>
              <Text style={styles.cancelText}>Cancel</Text>
            </Pressable>
            <Pressable
              accessibilityRole="button"
              accessibilityLabel={`Reset playback progress for ${lesson}. Notes stay.`}
              onPress={onConfirm}
              style={styles.confirm}
            >
              <Text style={styles.confirmText}>Reset progress</Text>
            </Pressable>
          </View>
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    backgroundColor: colors.cardRaised,
    borderTopLeftRadius: radii.lg + 4,
    borderTopRightRadius: radii.lg + 4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.xl,
    gap: spacing.sm,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  lesson: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  actions: {
    flexDirection: 'row',
    gap: spacing.sm,
    marginTop: spacing.md,
  },
  cancel: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
  },
  cancelText: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
  },
  confirm: {
    flex: 1,
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: colors.danger,
    alignItems: 'center',
    justifyContent: 'center',
  },
  confirmText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
});

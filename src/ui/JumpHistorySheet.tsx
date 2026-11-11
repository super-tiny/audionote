import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import type { Jump } from '../db/types';
import { useI18n } from '../i18n/I18nProvider';
import { colors, radii, spacing } from './theme';

type JumpHistorySheetProps = {
  visible: boolean;
  jumps: readonly Jump[];
  onClose: () => void;
  onReturn: (jump: Jump) => void;
  onDelete: (jump: Jump) => void;
  onClear: () => void;
};

export function JumpHistorySheet({
  visible,
  jumps,
  onClose,
  onReturn,
  onDelete,
  onClear,
}: JumpHistorySheetProps) {
  const insets = useSafeAreaInsets();
  const { t, clock, direction, align } = useI18n();

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <View style={[styles.fill, { direction }]}>
        <Pressable accessibilityRole="button" accessibilityLabel={t('closeJumps')} onPress={onClose} style={styles.backdrop} />
        <View style={[styles.sheet, { paddingBottom: insets.bottom + spacing.lg }]}>
          <View style={styles.handle} />
          <View style={styles.header}>
            <View style={styles.headerText}>
              <Text style={[styles.title, align]}>{t('jumps')}</Text>
              <Text style={[styles.subtitle, align]}>{t('jumpsSubtitle')}</Text>
            </View>
            <Pressable accessibilityRole="button" accessibilityLabel={t('closeJumps')} onPress={onClose} hitSlop={8}>
              <Ionicons name="close" size={24} color={colors.muted} />
            </Pressable>
          </View>
          <Pressable
            accessibilityRole="button"
            accessibilityLabel={t('clearAllJumps')}
            disabled={jumps.length === 0}
            onPress={onClear}
            style={styles.clear}
          >
            <Text style={[styles.clearText, jumps.length === 0 && styles.clearTextDisabled]}>{t('clearAll')}</Text>
          </Pressable>
          {jumps.length === 0 ? (
            <Text style={[styles.empty, align]}>{t('jumpsEmpty')}</Text>
          ) : (
            <ScrollView style={styles.scroll} contentContainerStyle={styles.list} keyboardShouldPersistTaps="handled">
              {jumps.map((jump) => {
                const from = clock(jump.fromMs);
                const to = clock(jump.toMs);
                return (
                  <View key={jump.id} style={styles.row}>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('returnTo', { time: from })}
                      onPress={() => onReturn(jump)}
                      style={[styles.rowMain, styles.timesLtr]}
                    >
                      <Text style={styles.from}>{from}</Text>
                      <Text style={styles.arrow}>→</Text>
                      <Text style={styles.to}>{to}</Text>
                    </Pressable>
                    <Pressable
                      accessibilityRole="button"
                      accessibilityLabel={t('deleteJump', { from, to })}
                      onPress={() => onDelete(jump)}
                      hitSlop={8}
                      style={styles.delete}
                    >
                      <Ionicons name="close" size={18} color={colors.danger} />
                    </Pressable>
                  </View>
                );
              })}
            </ScrollView>
          )}
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
    maxHeight: '75%',
    backgroundColor: colors.card,
    borderTopLeftRadius: radii.lg,
    borderTopRightRadius: radii.lg,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 36,
    height: 4,
    borderRadius: radii.pill,
    backgroundColor: colors.line,
    marginBottom: spacing.sm,
  },
  header: {
    flexDirection: 'row',
    alignItems: 'flex-start',
    justifyContent: 'space-between',
    gap: spacing.md,
  },
  headerText: {
    flex: 1,
    gap: 2,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  subtitle: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  clear: {
    alignSelf: 'flex-start',
    minHeight: 36,
    justifyContent: 'center',
  },
  clearText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '700',
  },
  clearTextDisabled: {
    color: colors.line,
  },
  scroll: {
    flexShrink: 1,
  },
  empty: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    paddingBottom: spacing.md,
  },
  list: {
    paddingBottom: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    borderTopWidth: StyleSheet.hairlineWidth,
    borderTopColor: colors.line,
  },
  rowMain: {
    flex: 1,
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 52,
  },
  timesLtr: {
    direction: 'ltr',
  },
  from: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
    fontVariant: ['tabular-nums'],
    minWidth: 88,
  },
  arrow: {
    color: colors.muted,
    fontSize: 16,
  },
  to: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
    fontVariant: ['tabular-nums'],
  },
  delete: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
  },
});

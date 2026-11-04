import { Ionicons } from '@expo/vector-icons';
import { Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ViewStyle } from 'react-native';
import { ScrollView, Text, XStack, YStack } from 'tamagui';

import type { Jump } from '../db/types';
import { formatClock } from '../notes/capture';
import { AppPressable } from './AppPressable';
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

  return (
    <Modal animationType="fade" transparent visible={visible} onRequestClose={onClose}>
      <YStack style={{ flex: 1, justifyContent: 'flex-end' }}>
        <YStack
          onPress={onClose}
          accessibilityRole="button"
          accessibilityLabel="Close jumps"
          style={{
            position: 'absolute',
            top: 0,
            left: 0,
            right: 0,
            bottom: 0,
            backgroundColor: 'rgba(0, 0, 0, 0.55)',
          }}
        />
        <YStack
          backgroundColor="card"
          style={
            {
              maxHeight: '75%',
              gap: spacing.sm,
              borderTopLeftRadius: radii.lg,
              borderTopRightRadius: radii.lg,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.sm,
              paddingBottom: insets.bottom + spacing.lg,
            } as ViewStyle
          }
        >
          <YStack
            style={{
              alignSelf: 'center',
              width: 36,
              height: 4,
              borderRadius: radii.pill,
              backgroundColor: colors.line,
              marginBottom: spacing.sm,
            }}
          />
          <XStack style={{ alignItems: 'flex-start', justifyContent: 'space-between', gap: spacing.md }}>
            <YStack style={{ flex: 1, gap: 2 }}>
              <Text color="text" fontSize={20} fontWeight="700">
                Jumps
              </Text>
              <Text color="muted" fontSize={13} lineHeight={18}>
                Tap a row to go back to where you were.
              </Text>
            </YStack>
            <AppPressable
              accessibilityRole="button"
              accessibilityLabel="Close jumps"
              onPress={onClose}
              hitSlop={8}
            >
              <Ionicons name="close" size={24} color={colors.muted} />
            </AppPressable>
          </XStack>
          <AppPressable
            accessibilityRole="button"
            accessibilityLabel="Clear all jumps"
            disabled={jumps.length === 0}
            onPress={onClear}
            style={{ alignSelf: 'flex-start', minHeight: 36, justifyContent: 'center' }}
          >
            <Text color={jumps.length === 0 ? 'line' : 'accent'} fontSize={15} fontWeight="700">
              Clear all
            </Text>
          </AppPressable>
          {jumps.length === 0 ? (
            <Text color="muted" fontSize={15} lineHeight={22} style={{ paddingBottom: spacing.md }}>
              Scrub the timeline or open a note and the jump shows up here. Skip buttons stay off this list.
            </Text>
          ) : (
            <ScrollView
              keyboardShouldPersistTaps="handled"
              contentContainerStyle={{ paddingBottom: spacing.sm }}
              style={{ flexShrink: 1 }}
            >
              {jumps.map((jump) => {
                const from = formatClock(jump.fromMs);
                const to = formatClock(jump.toMs);
                return (
                  <XStack
                    key={jump.id}
                    style={{
                      alignItems: 'center',
                      gap: spacing.sm,
                      borderTopWidth: 0.5,
                      borderTopColor: colors.line,
                    }}
                  >
                    <AppPressable
                      accessibilityRole="button"
                      accessibilityLabel={`Return to ${from}`}
                      onPress={() => onReturn(jump)}
                      style={{
                        flex: 1,
                        flexDirection: 'row',
                        alignItems: 'center',
                        gap: spacing.md,
                        minHeight: 52,
                      }}
                    >
                      <Text
                        color="accent"
                        fontSize={16}
                        fontWeight="700"
                        fontVariant={['tabular-nums']}
                        style={{ minWidth: 88 }}
                      >
                        {from}
                      </Text>
                      <Text color="muted" fontSize={16}>
                        →
                      </Text>
                      <Text color="text" fontSize={16} fontWeight="600" fontVariant={['tabular-nums']}>
                        {to}
                      </Text>
                    </AppPressable>
                    <AppPressable
                      accessibilityRole="button"
                      accessibilityLabel={`Delete jump from ${from} to ${to}`}
                      onPress={() => onDelete(jump)}
                      hitSlop={8}
                      style={{ minWidth: 44, minHeight: 44, alignItems: 'center', justifyContent: 'center' }}
                    >
                      <Ionicons name="close" size={18} color={colors.danger} />
                    </AppPressable>
                  </XStack>
                );
              })}
            </ScrollView>
          )}
        </YStack>
      </YStack>
    </Modal>
  );
}

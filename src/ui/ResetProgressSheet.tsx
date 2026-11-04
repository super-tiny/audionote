import { Modal } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import type { ViewStyle } from 'react-native';
import { Text, XStack, YStack } from 'tamagui';

import { AppPressable } from './AppPressable';
import { displayTitle } from './displayTitle';
import { colors, spacing } from './theme';

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
      <YStack style={{ flex: 1, justifyContent: 'flex-end' }}>
        <YStack
          onPress={onCancel}
          accessibilityRole="button"
          accessibilityLabel="Cancel reset"
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
          backgroundColor="cardRaised"
          style={
            {
              borderTopLeftRadius: 20,
              borderTopRightRadius: 20,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.xl,
              gap: spacing.sm,
              paddingBottom: insets.bottom + spacing.lg,
            } as ViewStyle
          }
        >
          <Text color="text" fontSize={20} fontWeight="700">
            Reset playback progress?
          </Text>
          <Text color="accent" fontSize={15} fontWeight="600">
            {lesson}
          </Text>
          <Text color="muted" fontSize={15} style={{ lineHeight: 22 }}>
            Listened portions, resume position, and jump history go back to the start. The heard percentage returns to
            0%. Notes stay exactly as they are.
          </Text>
          <XStack style={{ gap: spacing.sm, marginTop: spacing.md }}>
            <AppPressable
              accessibilityRole="button"
              onPress={onCancel}
              backgroundColor="card"
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text color="text" fontSize={16} fontWeight="700">
                Cancel
              </Text>
            </AppPressable>
            <AppPressable
              accessibilityRole="button"
              accessibilityLabel={`Reset playback progress for ${lesson}. Notes stay.`}
              onPress={onConfirm}
              backgroundColor="danger"
              style={{
                flex: 1,
                minHeight: 48,
                borderRadius: 12,
                alignItems: 'center',
                justifyContent: 'center',
              }}
            >
              <Text color={colors.background} fontSize={16} fontWeight="700">
                Reset progress
              </Text>
            </AppPressable>
          </XStack>
        </YStack>
      </YStack>
    </Modal>
  );
}

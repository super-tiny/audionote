import { Ionicons } from '@expo/vector-icons';
import { StyleSheet } from 'react-native';
import { Text, XStack } from 'tamagui';

import { AppPressable } from './AppPressable';
import { colors, spacing } from './theme';

type InlineBannerProps = {
  message: string;
  tone?: 'info' | 'success' | 'error';
  onDismiss?: () => void;
};

const toneStyles = {
  info: {
    background: colors.cardRaised,
    border: colors.line,
    icon: 'information-circle-outline' as const,
    text: colors.text,
  },
  success: {
    background: 'rgba(63, 122, 98, 0.22)',
    border: '#3F7A62',
    icon: 'checkmark-circle-outline' as const,
    text: colors.text,
  },
  error: {
    background: 'rgba(240, 164, 164, 0.14)',
    border: colors.danger,
    icon: 'alert-circle-outline' as const,
    text: colors.danger,
  },
};

export function InlineBanner({ message, tone = 'info', onDismiss }: InlineBannerProps) {
  const palette = toneStyles[tone];

  return (
    <XStack
      style={{
        alignItems: 'center',
        gap: spacing.sm,
        marginHorizontal: spacing.lg,
        marginBottom: spacing.sm,
        paddingHorizontal: spacing.md,
        paddingVertical: spacing.sm,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
        backgroundColor: palette.background,
        borderColor: palette.border,
      }}
    >
      <Ionicons name={palette.icon} size={18} color={palette.text} />
      <Text color={palette.text} style={{ flex: 1, fontSize: 14, lineHeight: 20 }}>
        {message}
      </Text>
      {onDismiss ? (
        <AppPressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} hitSlop={8}>
          <Ionicons name="close" size={18} color={palette.text} />
        </AppPressable>
      ) : null}
    </XStack>
  );
}

import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';

import { colors, radii, spacing } from './theme';

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
    <View style={[styles.wrap, { backgroundColor: palette.background, borderColor: palette.border }]}>
      <Ionicons name={palette.icon} size={18} color={palette.text} />
      <Text style={[styles.text, { color: palette.text }]}>{message}</Text>
      {onDismiss ? (
        <Pressable accessibilityRole="button" accessibilityLabel="Dismiss" onPress={onDismiss} hitSlop={8}>
          <Ionicons name="close" size={18} color={palette.text} />
        </Pressable>
      ) : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.sm,
    marginHorizontal: spacing.lg,
    marginBottom: spacing.sm,
    paddingHorizontal: spacing.md,
    paddingVertical: spacing.sm,
    borderRadius: radii.md,
    borderWidth: StyleSheet.hairlineWidth,
  },
  text: {
    flex: 1,
    fontSize: 14,
    lineHeight: 20,
  },
});

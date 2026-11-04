import { Ionicons } from '@expo/vector-icons';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';

import { AppPressable } from './AppPressable';
import { colors, spacing } from './theme';

type HeaderAction = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  backIcon?: keyof typeof Ionicons.glyphMap;
  onMenu?: () => void;
  actions?: HeaderAction[];
};

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backLabel = 'Back',
  backIcon = 'chevron-back',
  onMenu,
  actions = [],
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();

  return (
    <YStack
      backgroundColor="background"
      style={{
        paddingHorizontal: spacing.lg,
        paddingBottom: spacing.sm,
        gap: 4,
        paddingTop: insets.top + spacing.sm,
      }}
    >
      <XStack style={{ alignItems: 'center', justifyContent: 'space-between', minHeight: 40 }}>
        {onBack ? (
          <AppPressable
            accessibilityRole="button"
            accessibilityLabel={backLabel}
            onPress={onBack}
            style={{
              flexDirection: 'row',
              alignItems: 'center',
              marginLeft: -6,
              paddingRight: spacing.sm,
              minHeight: 44,
            }}
          >
            <Ionicons name={backIcon} size={24} color={colors.accent} />
            {backLabel ? (
              <Text color="accent" fontSize={16} fontWeight="600">
                {backLabel}
              </Text>
            ) : null}
          </AppPressable>
        ) : onMenu ? (
          <AppPressable
            accessibilityRole="button"
            accessibilityLabel="Open menu"
            onPress={onMenu}
            style={{
              minWidth: 44,
              minHeight: 44,
              alignItems: 'center',
              justifyContent: 'center',
              marginLeft: -8,
            }}
          >
            <Ionicons name="menu" size={26} color={colors.text} />
          </AppPressable>
        ) : (
          <YStack style={{ width: 1 }} />
        )}
        <XStack style={{ alignItems: 'center', gap: 4 }}>
          {actions.map((action) => (
            <AppPressable
              key={action.label}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              disabled={action.disabled}
              onPress={action.onPress}
              style={{
                minWidth: 44,
                minHeight: 44,
                alignItems: 'center',
                justifyContent: 'center',
                borderRadius: 22,
                opacity: action.disabled ? 0.45 : 1,
              }}
            >
              <Ionicons name={action.icon} size={22} color={colors.accent} />
            </AppPressable>
          ))}
        </XStack>
      </XStack>
      {title ? (
        <Text color="text" fontSize={28} fontWeight="700" style={{ letterSpacing: -0.3 }} numberOfLines={2}>
          {title}
        </Text>
      ) : null}
      {subtitle ? (
        <Text color="muted" fontSize={15}>
          {subtitle}
        </Text>
      ) : null}
    </YStack>
  );
}

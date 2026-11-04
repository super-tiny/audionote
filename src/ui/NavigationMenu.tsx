import { Ionicons } from '@expo/vector-icons';
import { Modal } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { Text, XStack, YStack } from 'tamagui';

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
      <YStack style={{ flex: 1 }}>
        <YStack
          onPress={onClose}
          accessibilityLabel="Close menu"
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
          backgroundColor="surface"
          style={
            {
              width: '82%',
              maxWidth: 320,
              height: '100%',
              borderRightWidth: 0.5,
              borderRightColor: colors.line,
              paddingHorizontal: spacing.lg,
              paddingTop: insets.top + spacing.lg,
              paddingBottom: insets.bottom + spacing.lg,
              gap: spacing.sm,
            } as ViewStyle
          }
        >
          <XStack style={{ alignItems: 'center', justifyContent: 'space-between', marginBottom: spacing.md }}>
            <Text color="text" fontSize={22} fontWeight="700">
              Menu
            </Text>
            <AppPressable accessibilityRole="button" accessibilityLabel="Close menu" onPress={onClose}>
              <Ionicons name="close" size={24} color={colors.muted} />
            </AppPressable>
          </XStack>
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
              backgroundColor="card"
              style={{
                flexDirection: 'row',
                alignItems: 'center',
                gap: spacing.md,
                minHeight: 56,
                paddingHorizontal: spacing.md,
                borderRadius: radii.md,
                opacity: item.disabled ? 0.5 : 1,
              }}
            >
              <Ionicons name={item.icon} size={22} color={item.disabled ? colors.line : colors.accent} />
              <YStack style={{ flex: 1, gap: 2 }}>
                <Text color={item.disabled ? 'muted' : 'text'} fontSize={16} fontWeight="600">
                  {item.label}
                </Text>
                {item.detail ? (
                  <Text color="muted" fontSize={13}>
                    {item.detail}
                  </Text>
                ) : null}
              </YStack>
              <Ionicons name="chevron-forward" size={18} color={colors.muted} />
            </AppPressable>
          ))}
        </YStack>
      </YStack>
    </Modal>
  );
}

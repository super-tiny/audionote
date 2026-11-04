import { Ionicons } from '@expo/vector-icons';
import { useState, type ReactNode } from 'react';
import { Text, YStack } from 'tamagui';

import { AppPressable } from './AppPressable';
import { colors, spacing } from './theme';

type CollapsibleSectionProps = {
  title: string;
  summary?: string;
  defaultOpen?: boolean;
  children: ReactNode;
};

export function CollapsibleSection({
  title,
  summary,
  defaultOpen = false,
  children,
}: CollapsibleSectionProps) {
  const [open, setOpen] = useState(defaultOpen);

  return (
    <YStack backgroundColor="card" style={{ borderRadius: 16, overflow: 'hidden' }}>
      <AppPressable
        accessibilityRole="button"
        accessibilityState={{ expanded: open }}
        onPress={() => setOpen((value) => !value)}
        style={{
          flexDirection: 'row',
          alignItems: 'center',
          justifyContent: 'space-between',
          paddingHorizontal: spacing.md,
          paddingVertical: spacing.sm + 2,
          minHeight: 52,
        }}
      >
        <YStack style={{ flex: 1, gap: 2, paddingRight: spacing.sm }}>
          <Text color="text" fontSize={16} fontWeight="600">
            {title}
          </Text>
          {!open && summary ? (
            <Text color="muted" fontSize={13}>
              {summary}
            </Text>
          ) : null}
        </YStack>
        <Ionicons name={open ? 'chevron-up' : 'chevron-down'} size={20} color={colors.muted} />
      </AppPressable>
      {open ? (
        <YStack style={{ paddingHorizontal: spacing.md, paddingBottom: spacing.md, gap: spacing.sm }}>
          {children}
        </YStack>
      ) : null}
    </YStack>
  );
}

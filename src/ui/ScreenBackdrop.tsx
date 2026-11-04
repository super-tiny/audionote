import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet } from 'react-native';
import { YStack } from 'tamagui';

import { colors } from './theme';

type ScreenBackdropProps = {
  children: ReactNode;
};

export function ScreenBackdrop({ children }: ScreenBackdropProps) {
  return (
    <YStack backgroundColor="background" style={{ flex: 1 }}>
      <LinearGradient colors={['#152433', colors.background, colors.background]} style={StyleSheet.absoluteFill} />
      {children}
    </YStack>
  );
}

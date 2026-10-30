import { LinearGradient } from 'expo-linear-gradient';
import type { ReactNode } from 'react';
import { StyleSheet, View } from 'react-native';

import { colors } from './theme';

type ScreenBackdropProps = {
  children: ReactNode;
};

export function ScreenBackdrop({ children }: ScreenBackdropProps) {
  return (
    <View style={styles.root}>
      <LinearGradient colors={['#152433', colors.background, colors.background]} style={StyleSheet.absoluteFill} />
      {children}
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.background,
  },
});

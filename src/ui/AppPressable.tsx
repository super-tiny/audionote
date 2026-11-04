import { useState } from 'react';
import type { StyleProp, ViewStyle } from 'react-native';
import type { YStackProps } from 'tamagui';
import { YStack } from 'tamagui';

import { tapHaptic } from './haptics';

type AppPressableProps = YStackProps & {
  haptic?: boolean;
};

export function AppPressable({ haptic = false, onPress, style, ...rest }: AppPressableProps) {
  const [pressed, setPressed] = useState(false);

  const pressedStyle: ViewStyle = pressed
    ? { opacity: 0.82, transform: [{ scale: 0.98 }] }
    : {};

  return (
    <YStack
      {...rest}
      onPressIn={() => setPressed(true)}
      onPressOut={() => setPressed(false)}
      onPress={(event) => {
        if (haptic) {
          tapHaptic();
        }
        onPress?.(event);
      }}
      style={[style as StyleProp<ViewStyle>, pressedStyle]}
    />
  );
}

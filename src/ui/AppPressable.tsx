import { Pressable, type PressableProps, StyleSheet } from 'react-native';

import { tapHaptic } from './haptics';

type AppPressableProps = PressableProps & {
  haptic?: boolean;
};

export function AppPressable({ haptic = false, onPress, style, ...rest }: AppPressableProps) {
  return (
    <Pressable
      {...rest}
      onPress={(event) => {
        if (haptic) {
          tapHaptic();
        }
        onPress?.(event);
      }}
      style={(state) => {
        const base = typeof style === 'function' ? style(state) : style;
        return [base, state.pressed && styles.pressed];
      }}
    />
  );
}

const styles = StyleSheet.create({
  pressed: {
    opacity: 0.82,
    transform: [{ scale: 0.98 }],
  },
});

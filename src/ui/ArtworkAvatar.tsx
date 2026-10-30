import { StyleSheet, Text, View } from 'react-native';

import { displayTitle, titleAccentColor, titleInitials } from './displayTitle';
import { colors, radii } from './theme';

type ArtworkAvatarProps = {
  title: string;
  size?: number;
};

export function ArtworkAvatar({ title, size = 48 }: ArtworkAvatarProps) {
  const backgroundColor = titleAccentColor(displayTitle(title));
  const fontSize = Math.min(48, Math.max(12, Math.round(size * 0.34)));

  return (
    <View
      style={[
        styles.avatar,
        {
          width: size,
          height: size,
          borderRadius: size / 2,
          backgroundColor,
        },
      ]}
    >
      <Text style={[styles.initials, { fontSize }]}>{titleInitials(title)}</Text>
    </View>
  );
}

const styles = StyleSheet.create({
  avatar: {
    alignItems: 'center',
    justifyContent: 'center',
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  initials: {
    color: colors.text,
    fontWeight: '700',
    letterSpacing: 0.5,
  },
});

import { Text, YStack } from 'tamagui';

import { displayTitle, titleAccentColor, titleInitials } from './displayTitle';
import { colors } from './theme';

type ArtworkAvatarProps = {
  title: string;
  size?: number;
};

export function ArtworkAvatar({ title, size = 48 }: ArtworkAvatarProps) {
  const backgroundColor = titleAccentColor(displayTitle(title));
  const fontSize = Math.min(48, Math.max(12, Math.round(size * 0.34)));

  return (
    <YStack
      style={{
        width: size,
        height: size,
        borderRadius: size / 2,
        backgroundColor,
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: 0.5,
        borderColor: colors.line,
      }}
    >
      <Text color="text" fontWeight="700" style={{ letterSpacing: 0.5, fontSize }}>
        {titleInitials(title)}
      </Text>
    </YStack>
  );
}

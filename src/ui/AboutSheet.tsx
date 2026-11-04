import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Linking, Modal } from 'react-native';
import type { ViewStyle } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';
import { ScrollView, Text, XStack, YStack } from 'tamagui';

import { githubUrls } from '../constants/github';
import { AppPressable } from './AppPressable';
import { colors, radii, spacing } from './theme';

type AboutSheetProps = {
  visible: boolean;
  onClose: () => void;
};

async function openUrl(url: string): Promise<void> {
  const supported = await Linking.canOpenURL(url);
  if (supported) {
    await Linking.openURL(url);
  }
}

function LinkRow({
  icon,
  label,
  detail,
  url,
}: {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  detail: string;
  url: string;
}) {
  return (
    <AppPressable
      accessibilityRole="link"
      haptic
      onPress={() => void openUrl(url)}
      style={{
        flexDirection: 'row',
        alignItems: 'center',
        gap: spacing.md,
        minHeight: 56,
        paddingHorizontal: spacing.md,
        borderRadius: radii.md,
        backgroundColor: colors.surface,
      }}
    >
      <Ionicons name={icon} size={22} color={colors.accent} />
      <YStack style={{ flex: 1, gap: 2 }}>
        <Text color="text" fontSize={16} fontWeight="600">
          {label}
        </Text>
        <Text color="muted" fontSize={13} lineHeight={18}>
          {detail}
        </Text>
      </YStack>
      <Ionicons name="open-outline" size={18} color={colors.muted} />
    </AppPressable>
  );
}

export function AboutSheet({ visible, onClose }: AboutSheetProps) {
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version ?? '0.1.0';

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <YStack style={{ flex: 1, justifyContent: 'flex-end' }}>
        <YStack
          onPress={onClose}
          accessibilityLabel="Close about"
          style={{ flex: 1, backgroundColor: 'rgba(0, 0, 0, 0.55)' }}
        />
        <YStack
          backgroundColor="cardRaised"
          style={
            {
              borderTopLeftRadius: radii.lg + 4,
              borderTopRightRadius: radii.lg + 4,
              paddingHorizontal: spacing.lg,
              paddingTop: spacing.sm,
              maxHeight: '85%',
              paddingBottom: Math.max(insets.bottom, spacing.lg),
            } as ViewStyle
          }
        >
          <YStack
            style={{
              alignSelf: 'center',
              width: 40,
              height: 4,
              borderRadius: 2,
              backgroundColor: colors.line,
              marginBottom: spacing.md,
            }}
          />
          <Text color="text" fontSize={20} fontWeight="700" style={{ marginBottom: spacing.md }}>
            About AudioNote
          </Text>
          <ScrollView style={{ flexGrow: 0 }} showsVerticalScrollIndicator={false}>
            <Text color="text" fontSize={16} lineHeight={24} style={{ marginBottom: spacing.sm }}>
              AudioNote helps you listen through long local lessons, return to the last point you played, see how much you have actually heard, step back through jump history, and capture timestamped notes—all on your device.
            </Text>
            <Text color="muted" fontSize={14} style={{ marginBottom: spacing.lg }}>
              Version {version}
            </Text>
            <Text color="text" fontSize={16} fontWeight="700" style={{ marginBottom: spacing.sm }}>
              Open source on GitHub
            </Text>
            <Text color="muted" fontSize={15} lineHeight={22} style={{ marginBottom: spacing.md }}>
              AudioNote is developed in the open. We welcome contributions, bug reports, and ideas for what to build next.
            </Text>
            <YStack style={{ gap: spacing.sm, marginBottom: spacing.lg }}>
              <LinkRow
                icon="logo-github"
                label="View repository"
                detail={githubUrls.repository.replace('https://', '')}
                url={githubUrls.repository}
              />
              <LinkRow
                icon="git-pull-request-outline"
                label="Contribute"
                detail="Pull requests and improvements welcome"
                url={githubUrls.contributing}
              />
              <LinkRow
                icon="bug-outline"
                label="Report an issue"
                detail="Something broken? Tell us on GitHub"
                url={githubUrls.newIssue}
              />
              <LinkRow
                icon="bulb-outline"
                label="Request a feature"
                detail="Share what would make AudioNote better for you"
                url={githubUrls.newFeature}
              />
            </YStack>
            <Text color="muted" fontSize={14} lineHeight={21} style={{ marginBottom: spacing.md }}>
              Thank you for using AudioNote and for helping improve it for everyone who learns from long-form audio.
            </Text>
          </ScrollView>
          <AppPressable
            accessibilityRole="button"
            haptic
            onPress={onClose}
            style={{
              minHeight: 48,
              borderRadius: radii.md,
              backgroundColor: colors.card,
              alignItems: 'center',
              justifyContent: 'center',
              marginTop: spacing.sm,
            }}
          >
            <Text color="accent" fontSize={16} fontWeight="700">
              Close
            </Text>
          </AppPressable>
        </YStack>
      </YStack>
    </Modal>
  );
}

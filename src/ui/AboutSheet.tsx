import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

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
      style={styles.linkRow}
    >
      <Ionicons name={icon} size={22} color={colors.accent} />
      <View style={styles.linkText}>
        <Text style={styles.linkLabel}>{label}</Text>
        <Text style={styles.linkDetail}>{detail}</Text>
      </View>
      <Ionicons name="open-outline" size={18} color={colors.muted} />
    </AppPressable>
  );
}

export function AboutSheet({ visible, onClose }: AboutSheetProps) {
  const insets = useSafeAreaInsets();
  const version = Constants.expoConfig?.version ?? '0.1.0';

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel="Close about" />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View style={styles.handle} />
        <Text style={styles.title}>About AudioNote</Text>
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={styles.lead}>
            AudioNote helps you listen through long local lessons, return to the last point you played, see how much you have actually heard, step back through jump history, and capture timestamped notes—all on your device.
          </Text>
          <Text style={styles.version}>Version {version}</Text>
          <Text style={styles.sectionTitle}>Open source on GitHub</Text>
          <Text style={styles.body}>
            AudioNote is developed in the open. We welcome contributions, bug reports, and ideas for what to build next.
          </Text>
          <View style={styles.links}>
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
          </View>
          <Text style={styles.footer}>
            Thank you for using AudioNote and for helping improve it for everyone who learns from long-form audio.
          </Text>
        </ScrollView>
        <AppPressable accessibilityRole="button" haptic onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>Close</Text>
        </AppPressable>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  backdrop: {
    flex: 1,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    backgroundColor: colors.cardRaised,
    borderTopLeftRadius: radii.lg + 4,
    borderTopRightRadius: radii.lg + 4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    maxHeight: '85%',
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: spacing.md,
  },
  title: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
    marginBottom: spacing.md,
  },
  scroll: {
    flexGrow: 0,
  },
  lead: {
    color: colors.text,
    fontSize: 16,
    lineHeight: 24,
    marginBottom: spacing.sm,
  },
  version: {
    color: colors.muted,
    fontSize: 14,
    marginBottom: spacing.lg,
  },
  sectionTitle: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '700',
    marginBottom: spacing.sm,
  },
  body: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
    marginBottom: spacing.md,
  },
  links: {
    gap: spacing.sm,
    marginBottom: spacing.lg,
  },
  linkRow: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 56,
    paddingHorizontal: spacing.md,
    borderRadius: radii.md,
    backgroundColor: colors.surface,
  },
  linkText: {
    flex: 1,
    gap: 2,
  },
  linkLabel: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  linkDetail: {
    color: colors.muted,
    fontSize: 13,
    lineHeight: 18,
  },
  footer: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 21,
    marginBottom: spacing.md,
  },
  closeBtn: {
    minHeight: 48,
    borderRadius: radii.md,
    backgroundColor: colors.card,
    alignItems: 'center',
    justifyContent: 'center',
    marginTop: spacing.sm,
  },
  closeBtnText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '700',
  },
});

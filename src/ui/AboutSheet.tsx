import { Ionicons } from '@expo/vector-icons';
import Constants from 'expo-constants';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { githubUrls } from '../constants/github';
import { useI18n } from '../i18n/I18nProvider';
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
  const { align } = useI18n();
  return (
    <AppPressable
      accessibilityRole="link"
      haptic
      onPress={() => void openUrl(url)}
      style={styles.linkRow}
    >
      <Ionicons name={icon} size={22} color={colors.accent} />
      <View style={styles.linkText}>
        <Text style={[styles.linkLabel, align]}>{label}</Text>
        <Text style={[styles.linkDetail, align]}>{detail}</Text>
      </View>
      <Ionicons name="open-outline" size={18} color={colors.muted} />
    </AppPressable>
  );
}

export function AboutSheet({ visible, onClose }: AboutSheetProps) {
  const insets = useSafeAreaInsets();
  const { t, align, direction } = useI18n();
  const version = Constants.expoConfig?.version ?? '0.1.0';

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={[styles.fill, { direction }]}>
      <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('closeAbout')} />
      <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
        <View style={styles.handle} />
        <Text style={[styles.title, align]}>{t('about')}</Text>
        <ScrollView style={styles.scroll} showsVerticalScrollIndicator={false}>
          <Text style={[styles.lead, align]}>{t('aboutLead')}</Text>
          <Text style={[styles.version, align]}>{t('version', { version })}</Text>
          <Text style={[styles.sectionTitle, align]}>{t('openSourceTitle')}</Text>
          <Text style={[styles.body, align]}>{t('openSourceBody')}</Text>
          <View style={styles.links}>
            <LinkRow
              icon="logo-github"
              label={t('viewRepository')}
              detail={githubUrls.repository.replace('https://', '')}
              url={githubUrls.repository}
            />
            <LinkRow
              icon="git-pull-request-outline"
              label={t('contribute')}
              detail={t('contributeDetail')}
              url={githubUrls.contributing}
            />
            <LinkRow
              icon="bug-outline"
              label={t('reportIssue')}
              detail={t('reportIssueDetail')}
              url={githubUrls.newIssue}
            />
            <LinkRow
              icon="bulb-outline"
              label={t('requestFeature')}
              detail={t('requestFeatureDetail')}
              url={githubUrls.newFeature}
            />
          </View>
          <Text style={[styles.footer, align]}>{t('aboutFooter')}</Text>
        </ScrollView>
        <AppPressable accessibilityRole="button" haptic onPress={onClose} style={styles.closeBtn}>
          <Text style={styles.closeBtnText}>{t('close')}</Text>
        </AppPressable>
      </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  fill: {
    flex: 1,
  },
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

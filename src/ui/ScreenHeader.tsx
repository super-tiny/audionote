import { Ionicons } from '@expo/vector-icons';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { useI18n } from '../i18n/I18nProvider';
import { directionalIcon } from './direction';
import { colors, spacing } from './theme';

type HeaderAction = {
  icon: keyof typeof Ionicons.glyphMap;
  label: string;
  onPress: () => void;
  disabled?: boolean;
};

type ScreenHeaderProps = {
  title: string;
  subtitle?: string;
  onBack?: () => void;
  backLabel?: string;
  backIcon?: keyof typeof Ionicons.glyphMap;
  onMenu?: () => void;
  actions?: HeaderAction[];
};

export function ScreenHeader({
  title,
  subtitle,
  onBack,
  backLabel,
  backIcon = 'chevron-back',
  onMenu,
  actions = [],
}: ScreenHeaderProps) {
  const insets = useSafeAreaInsets();
  const { t, isRtl, align } = useI18n();
  const resolvedBack = backLabel ?? t('back');
  const icon = directionalIcon(backIcon, isRtl);

  return (
    <View style={[styles.wrap, { paddingTop: insets.top + spacing.sm }]}>
      <View style={styles.row}>
        {onBack ? (
          <Pressable accessibilityRole="button" accessibilityLabel={resolvedBack || t('back')} onPress={onBack} style={styles.back}>
            <Ionicons name={icon} size={24} color={colors.accent} />
            {resolvedBack ? <Text style={styles.backText}>{resolvedBack}</Text> : null}
          </Pressable>
        ) : onMenu ? (
          <Pressable accessibilityRole="button" accessibilityLabel={t('openMenu')} onPress={onMenu} style={styles.menu}>
            <Ionicons name="menu" size={26} color={colors.text} />
          </Pressable>
        ) : (
          <View style={styles.backPlaceholder} />
        )}
        <View style={styles.actions}>
          {actions.map((action) => (
            <Pressable
              key={action.label}
              accessibilityRole="button"
              accessibilityLabel={action.label}
              disabled={action.disabled}
              onPress={action.onPress}
              style={[styles.action, action.disabled && styles.actionDisabled]}
            >
              <Ionicons name={action.icon} size={22} color={colors.accent} />
            </Pressable>
          ))}
        </View>
      </View>
      {title ? (
        <Text style={[styles.title, align]} numberOfLines={2}>
          {title}
        </Text>
      ) : null}
      {subtitle ? <Text style={[styles.subtitle, align]}>{subtitle}</Text> : null}
    </View>
  );
}

const styles = StyleSheet.create({
  wrap: {
    paddingHorizontal: spacing.lg,
    paddingBottom: spacing.sm,
    gap: 4,
    backgroundColor: colors.background,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    justifyContent: 'space-between',
    minHeight: 40,
  },
  back: {
    flexDirection: 'row',
    alignItems: 'center',
    marginStart: -6,
    paddingEnd: spacing.sm,
    minHeight: 44,
  },
  backText: {
    color: colors.accent,
    fontSize: 16,
    fontWeight: '600',
  },
  backPlaceholder: {
    width: 1,
  },
  menu: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    marginStart: -8,
  },
  actions: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: 4,
  },
  action: {
    minWidth: 44,
    minHeight: 44,
    alignItems: 'center',
    justifyContent: 'center',
    borderRadius: 22,
  },
  actionDisabled: {
    opacity: 0.45,
  },
  title: {
    color: colors.text,
    fontSize: 28,
    fontWeight: '700',
    letterSpacing: -0.3,
  },
  subtitle: {
    color: colors.muted,
    fontSize: 15,
  },
});

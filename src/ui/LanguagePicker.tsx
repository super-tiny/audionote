import { Ionicons } from '@expo/vector-icons';
import { Modal, Pressable, StyleSheet, Text, View } from 'react-native';
import { useSafeAreaInsets } from 'react-native-safe-area-context';

import { LANGUAGES, type Locale } from '../i18n/languages';
import { useI18n } from '../i18n/I18nProvider';
import { AppPressable } from './AppPressable';
import { ScreenBackdrop } from './ScreenBackdrop';
import { colors, radii, spacing } from './theme';

type LanguageListProps = {
  selected: Locale | null;
  onSelect: (locale: Locale) => void;
};

export function LanguageList({ selected, onSelect }: LanguageListProps) {
  const { isRtl } = useI18n();

  return (
    <View style={styles.list}>
      {LANGUAGES.map((language) => {
        const active = language.code === selected;
        return (
          <AppPressable
            key={language.code}
            accessibilityRole="button"
            accessibilityState={{ selected: active }}
            accessibilityLabel={language.nativeName}
            haptic
            onPress={() => onSelect(language.code)}
            style={[styles.row, active && styles.rowOn]}
          >
            <Text
              accessible={false}
              importantForAccessibility="no"
              style={styles.flag}
            >
              {language.flag}
            </Text>
            <View style={styles.rowText}>
              <Text
                style={[
                  styles.nativeName,
                  { textAlign: isRtl ? 'right' : 'left', writingDirection: language.direction },
                ]}
              >
                {language.nativeName}
              </Text>
              {language.nativeName !== language.englishName ? (
                <Text style={[styles.englishName, { textAlign: isRtl ? 'right' : 'left' }]}>
                  {language.englishName}
                </Text>
              ) : null}
            </View>
            {active ? <Ionicons name="checkmark" size={22} color={colors.accent} /> : null}
          </AppPressable>
        );
      })}
    </View>
  );
}

export function LanguageGate({ onSelect }: { onSelect: (locale: Locale) => void }) {
  const insets = useSafeAreaInsets();

  return (
    <ScreenBackdrop>
      <View style={[styles.gate, { direction: 'ltr', paddingTop: insets.top + spacing.xxl, paddingBottom: insets.bottom + spacing.lg }]}>
        <Text style={styles.brand}>AudioNote</Text>
        <Text style={styles.kicker}>Language · Langue · Sprache · اللغة · زبان</Text>
        <LanguageList selected={null} onSelect={onSelect} />
      </View>
    </ScreenBackdrop>
  );
}

export function LanguageSheet({ visible, onClose }: { visible: boolean; onClose: () => void }) {
  const insets = useSafeAreaInsets();
  const { locale, setLocale, direction, t } = useI18n();

  return (
    <Modal animationType="slide" transparent visible={visible} onRequestClose={onClose}>
      <View style={[styles.sheetFill, { direction }]}>
        <Pressable style={styles.backdrop} onPress={onClose} accessibilityLabel={t('close')} />
        <View style={[styles.sheet, { paddingBottom: Math.max(insets.bottom, spacing.lg) }]}>
          <View style={styles.handle} />
          <Text style={styles.sheetTitle}>{t('language')}</Text>
          <Text style={styles.sheetHint}>{t('languageHint')}</Text>
          <LanguageList
            selected={locale}
            onSelect={(next) => {
              setLocale(next);
              onClose();
            }}
          />
        </View>
      </View>
    </Modal>
  );
}

const styles = StyleSheet.create({
  gate: {
    flex: 1,
    paddingHorizontal: spacing.lg,
    gap: spacing.lg,
  },
  brand: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '700',
    letterSpacing: -0.4,
  },
  kicker: {
    color: colors.muted,
    fontSize: 15,
    lineHeight: 22,
  },
  list: {
    gap: spacing.sm,
  },
  row: {
    flexDirection: 'row',
    alignItems: 'center',
    gap: spacing.md,
    minHeight: 68,
    paddingHorizontal: spacing.md,
    borderRadius: radii.lg,
    backgroundColor: colors.card,
    borderWidth: StyleSheet.hairlineWidth,
    borderColor: colors.line,
  },
  rowOn: {
    borderColor: colors.accent,
    backgroundColor: '#1A2838',
  },
  flag: {
    width: 40,
    fontSize: 28,
    lineHeight: 36,
    textAlign: 'center',
    writingDirection: 'ltr',
  },
  rowText: {
    flex: 1,
    gap: 2,
  },
  nativeName: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  englishName: {
    color: colors.muted,
    fontSize: 13,
  },
  sheetFill: {
    flex: 1,
    justifyContent: 'flex-end',
  },
  backdrop: {
    ...StyleSheet.absoluteFill,
    backgroundColor: 'rgba(0, 0, 0, 0.55)',
  },
  sheet: {
    backgroundColor: colors.cardRaised,
    borderTopLeftRadius: radii.lg + 4,
    borderTopRightRadius: radii.lg + 4,
    paddingHorizontal: spacing.lg,
    paddingTop: spacing.sm,
    gap: spacing.sm,
  },
  handle: {
    alignSelf: 'center',
    width: 40,
    height: 4,
    borderRadius: 2,
    backgroundColor: colors.line,
    marginBottom: spacing.sm,
  },
  sheetTitle: {
    color: colors.text,
    fontSize: 20,
    fontWeight: '700',
  },
  sheetHint: {
    color: colors.muted,
    fontSize: 14,
    lineHeight: 20,
    marginBottom: spacing.sm,
  },
});

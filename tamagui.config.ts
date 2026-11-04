import { defaultConfig } from '@tamagui/config/v6';
import { createTamagui } from 'tamagui';

/** AudioNote palette — shared with `src/ui/theme.ts`. */
export const audionotePalette = {
  background: '#0B1016',
  surface: '#0F1419',
  card: '#18222E',
  cardRaised: '#243244',
  text: '#F4F7FB',
  muted: '#9BB0C4',
  accent: '#7EB6FF',
  accentSoft: 'rgba(126, 182, 255, 0.16)',
  heard: '#4E86B8',
  danger: '#F0A4A4',
  line: '#2C3B4C',
  white: '#FFFFFF',
} as const;

export const tamaguiConfig = createTamagui({
  ...defaultConfig,
  tokens: {
    ...defaultConfig.tokens,
    color: {
      ...defaultConfig.tokens.color,
      ...audionotePalette,
    },
    radius: {
      ...defaultConfig.tokens.radius,
      sm: 8,
      md: 12,
      lg: 16,
      pill: 999,
    },
  },
  themes: {
    ...defaultConfig.themes,
    dark: {
      ...defaultConfig.themes.dark,
      background: audionotePalette.background,
      backgroundHover: audionotePalette.surface,
      backgroundPress: audionotePalette.card,
      backgroundFocus: audionotePalette.card,
      color: audionotePalette.text,
      colorHover: audionotePalette.text,
      colorPress: audionotePalette.muted,
      colorFocus: audionotePalette.text,
      borderColor: audionotePalette.line,
      placeholderColor: audionotePalette.muted,
      surface: audionotePalette.surface,
      card: audionotePalette.card,
      cardRaised: audionotePalette.cardRaised,
      muted: audionotePalette.muted,
      accent: audionotePalette.accent,
      accentSoft: audionotePalette.accentSoft,
      heard: audionotePalette.heard,
      danger: audionotePalette.danger,
      line: audionotePalette.line,
    },
  },
});

export default tamaguiConfig;

export type Conf = typeof tamaguiConfig;

declare module 'tamagui' {
  interface TamaguiCustomConfig extends Conf {}
}

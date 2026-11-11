import type { ConfigContext, ExpoConfig } from 'expo/config';

/** Matches `colors.surface` in src/ui/theme.ts — keep in sync for native splash/root chrome. */
const APP_SURFACE = '#0F1419';

const version = process.env.APP_VERSION ?? '0.1.0';
const iosBuildNumber = process.env.IOS_BUILD_NUMBER ?? '1';
const androidVersionCode = Number(process.env.ANDROID_VERSION_CODE ?? '1');

if (!Number.isInteger(androidVersionCode) || androidVersionCode < 1) {
  throw new Error(
    `ANDROID_VERSION_CODE must be a positive integer, received "${process.env.ANDROID_VERSION_CODE}".`,
  );
}

export default ({ config }: ConfigContext): ExpoConfig => ({
  ...config,
  name: 'AudioNote',
  slug: 'audionote',
  scheme: 'audionote',
  version,
  orientation: 'portrait',
  icon: './assets/icon.png',
  userInterfaceStyle: 'dark',
  backgroundColor: APP_SURFACE,
  ios: {
    supportsTablet: true,
    bundleIdentifier: 'app.audionote',
    buildNumber: iosBuildNumber,
    infoPlist: {
      UIBackgroundModes: ['audio'],
    },
    ...(process.env.APPLE_TEAM_ID
      ? { appleTeamId: process.env.APPLE_TEAM_ID }
      : {}),
  },
  android: {
    package: 'app.audionote',
    versionCode: androidVersionCode,
    predictiveBackGestureEnabled: false,
    adaptiveIcon: {
      backgroundColor: APP_SURFACE,
      foregroundImage: './assets/android-icon-foreground.png',
      backgroundImage: './assets/android-icon-background.png',
      monochromeImage: './assets/android-icon-monochrome.png',
    },
  },
  web: {
    favicon: './assets/favicon.png',
  },
  plugins: [
    [
      'expo-splash-screen',
      {
        image: './assets/splash-icon.png',
        resizeMode: 'contain',
        backgroundColor: APP_SURFACE,
      },
    ],
    'expo-dev-client',
    'expo-sqlite',
    'expo-status-bar',
    [
      'expo-build-properties',
      {
        ios: {
          deploymentTarget: '16.4',
        },
        android: {
          // @rntp/player ships no consumer ProGuard rules. Leave R8 off until
          // a release build is verified with minify enabled.
          enableMinifyInReleaseBuilds: false,
        },
      },
    ],
    './plugins/withAndroidReleaseSigning',
  ],
  extra: {
    eas: process.env.EAS_PROJECT_ID
      ? { projectId: process.env.EAS_PROJECT_ID }
      : {},
  },
});

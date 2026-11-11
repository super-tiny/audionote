import { StatusBar } from 'expo-status-bar';
import * as SystemUI from 'expo-system-ui';
import { useEffect } from 'react';
import { AppState, StyleSheet, View } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';

import { I18nProvider, useI18n } from './i18n/I18nProvider';
import { RootNavigator } from './navigation/RootNavigator';
import { flushJumpHistory } from './playback/jumpHistory';
import { flushProgress } from './playback/persist';
import { LanguageGate } from './ui/LanguagePicker';
import { colors } from './ui/theme';

export default function App() {
  useEffect(() => {
    void SystemUI.setBackgroundColorAsync(colors.surface);
  }, []);

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        flushProgress();
        flushJumpHistory();
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <SafeAreaProvider>
        <I18nProvider>
          <StatusBar style="light" />
          <LocalizedApp />
        </I18nProvider>
      </SafeAreaProvider>
    </GestureHandlerRootView>
  );
}

function LocalizedApp() {
  const { locale, setLocale, direction } = useI18n();
  if (!locale) {
    return <LanguageGate onSelect={setLocale} />;
  }
  return (
    <View style={[styles.root, { direction }]}>
      <RootNavigator />
    </View>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
    backgroundColor: colors.surface,
  },
});

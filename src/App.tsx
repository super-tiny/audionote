import { StatusBar } from 'expo-status-bar';
import { useEffect } from 'react';
import { AppState } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';
import { SafeAreaProvider } from 'react-native-safe-area-context';
import { TamaguiProvider, YStack } from 'tamagui';

import { tamaguiConfig } from '../tamagui.config';
import { RootNavigator } from './navigation/RootNavigator';
import { flushJumpHistory } from './playback/jumpHistory';
import { flushProgress } from './playback/persist';

export default function App() {
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
    <TamaguiProvider config={tamaguiConfig} defaultTheme="dark">
      <GestureHandlerRootView style={{ flex: 1 }}>
        <SafeAreaProvider>
          <YStack backgroundColor="background" style={{ flex: 1 }}>
            <StatusBar style="light" />
            <RootNavigator />
          </YStack>
        </SafeAreaProvider>
      </GestureHandlerRootView>
    </TamaguiProvider>
  );
}

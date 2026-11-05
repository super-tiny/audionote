import {
  DarkTheme,
  NavigationContainer,
  createNavigationContainerRef,
} from '@react-navigation/native';
import { createNativeStackNavigator } from '@react-navigation/native-stack';
import { useCallback, useState } from 'react';

import { LibraryScreen } from '../screens/LibraryScreen';
import { ListenHistoryScreen } from '../screens/ListenHistoryScreen';
import { PlayerScreen } from '../screens/PlayerScreen';
import { flushJumpHistory } from '../playback/jumpHistory';
import { flushProgress } from '../playback/persist';
import { colors } from '../ui/theme';
import type { RootStackParamList } from './types';

const Stack = createNativeStackNavigator<RootStackParamList>();

const navigationTheme = {
  ...DarkTheme,
  colors: {
    ...DarkTheme.colors,
    background: colors.surface,
    card: colors.surface,
  },
};

export const navigationRef = createNavigationContainerRef<RootStackParamList>();

export function RootNavigator() {
  const [playerItemId, setPlayerItemId] = useState<string | null>(null);
  const [playerTitle, setPlayerTitle] = useState<string | null>(null);

  const onPlayerContext = useCallback((itemId: string | null, title: string | null) => {
    setPlayerItemId(itemId);
    setPlayerTitle(title);
  }, []);

  return (
    <NavigationContainer
      ref={navigationRef}
      theme={navigationTheme}
      onStateChange={() => {
        const route = navigationRef.getCurrentRoute();
        if (route?.name === 'Library') {
          flushProgress();
          flushJumpHistory();
        }
      }}
    >
      <Stack.Navigator
        screenOptions={{
          headerShown: false,
          animation: 'slide_from_right',
          contentStyle: { backgroundColor: colors.surface },
        }}
      >
        <Stack.Screen name="Library">
          {(props) => (
            <LibraryScreen
              {...props}
              playerItemId={playerItemId}
              playerTitle={playerTitle}
              onPlayerContext={onPlayerContext}
            />
          )}
        </Stack.Screen>
        <Stack.Screen name="Player">
          {(props) => (
            <PlayerScreen {...props} playerItemId={playerItemId} playerTitle={playerTitle} onPlayerContext={onPlayerContext} />
          )}
        </Stack.Screen>
        <Stack.Screen name="ListenHistory">
          {(props) => <ListenHistoryScreen {...props} onPlayerContext={onPlayerContext} />}
        </Stack.Screen>
      </Stack.Navigator>
    </NavigationContainer>
  );
}

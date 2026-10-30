import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { AppState, StyleSheet } from 'react-native';
import { GestureHandlerRootView } from 'react-native-gesture-handler';

import { LibraryScreen } from './screens/LibraryScreen';
import { PlayerScreen } from './screens/PlayerScreen';
import { flushProgress } from './playback/persist';

type Route = { name: 'library' } | { name: 'player'; itemId: string };

export default function App() {
  const [route, setRoute] = useState<Route>({ name: 'library' });

  useEffect(() => {
    const subscription = AppState.addEventListener('change', (state) => {
      if (state !== 'active') {
        flushProgress();
      }
    });
    return () => subscription.remove();
  }, []);

  return (
    <GestureHandlerRootView style={styles.root}>
      <StatusBar style="light" />
      {route.name === 'library' ? (
        <LibraryScreen onOpen={(itemId) => setRoute({ name: 'player', itemId })} />
      ) : (
        <PlayerScreen
          itemId={route.itemId}
          onBack={() => {
            flushProgress();
            setRoute({ name: 'library' });
          }}
        />
      )}
    </GestureHandlerRootView>
  );
}

const styles = StyleSheet.create({
  root: {
    flex: 1,
  },
});

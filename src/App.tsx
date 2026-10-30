import { FlashList } from '@shopify/flash-list';
import { useIsPlaying } from '@rntp/player';
import { StatusBar } from 'expo-status-bar';
import { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';

import { ensureDatabase } from './db/open';

export default function App() {
  const playing = useIsPlaying();
  const [databaseReady, setDatabaseReady] = useState(false);
  const [databaseError, setDatabaseError] = useState<string | null>(null);

  useEffect(() => {
    try {
      ensureDatabase();
      setDatabaseReady(true);
    } catch (error) {
      setDatabaseError(error instanceof Error ? error.message : 'Could not open the library database.');
    }
  }, []);

  const status = databaseError
    ? databaseError
    : databaseReady
      ? playing
        ? 'Playing'
        : 'Player ready'
      : 'Opening library…';

  return (
    <View style={styles.screen}>
      <StatusBar style="light" />
      <View style={styles.header}>
        <Text style={styles.title}>AudioNote</Text>
        <Text style={styles.status}>{status}</Text>
      </View>
      <FlashList
        data={[]}
        renderItem={() => null}
        ListEmptyComponent={
          <Text style={styles.empty}>No audio yet. Library import arrives in a later milestone.</Text>
        }
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: '#0F1419',
  },
  header: {
    paddingTop: 64,
    paddingHorizontal: 24,
    paddingBottom: 16,
    gap: 8,
  },
  title: {
    color: '#F4F7FB',
    fontSize: 32,
    fontWeight: '700',
  },
  status: {
    color: '#9BB0C4',
    fontSize: 16,
  },
  empty: {
    color: '#C5D2DE',
    fontSize: 16,
    lineHeight: 24,
    paddingHorizontal: 24,
  },
});

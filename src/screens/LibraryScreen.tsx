import { FlashList } from '@shopify/flash-list';
import { useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, TextInput, View } from 'react-native';

import {
  continueListening,
  deleteItem,
  listItems,
  rangesForItem,
  rangesSince,
} from '../db/library';
import type { AudioItem } from '../db/types';
import { importAudioFiles, locateAudioFile, type ImportSummary } from '../library/import';
import { refreshPresence } from '../library/files';
import { coveredMs, listenedFraction } from '../library/ranges';
import { formatClock, formatHours } from '../notes/capture';
import { colors } from '../ui/theme';

type Row = {
  item: AudioItem;
  heard: number;
};

type LibraryScreenProps = {
  onOpen: (itemId: string) => void;
};

function startOfToday(): number {
  const start = new Date();
  start.setHours(0, 0, 0, 0);
  return start.getTime();
}

function loadLibrary(query: string): { rows: Row[]; resume: AudioItem[]; todayMs: number } {
  const rows = listItems(query).map((item) => ({
    item,
    heard: listenedFraction(rangesForItem(item.id), item.durationMs),
  }));
  return {
    rows,
    resume: query.trim() ? [] : continueListening(),
    todayMs: coveredMs(rangesSince(startOfToday())),
  };
}

function summaryText(summary: ImportSummary): string {
  const parts = [
    summary.added ? `Added ${summary.added}` : '',
    summary.updated ? `Updated ${summary.updated}` : '',
    summary.unreadable ? `Unreadable ${summary.unreadable}` : '',
  ].filter(Boolean);
  return parts.length ? parts.join(' · ') : 'No audio files in that selection.';
}

export function LibraryScreen({ onOpen }: LibraryScreenProps) {
  const [query, setQuery] = useState('');
  const [applied, setApplied] = useState('');
  const [revision, setRevision] = useState(0);
  const [rows, setRows] = useState<Row[]>([]);
  const [resume, setResume] = useState<AudioItem[]>([]);
  const [todayMs, setTodayMs] = useState(0);
  const [busy, setBusy] = useState(false);
  const [status, setStatus] = useState<string | null>(null);
  const [pendingDeleteId, setPendingDeleteId] = useState<string | null>(null);

  useEffect(() => {
    const handle = setTimeout(() => setApplied(query), 200);
    return () => clearTimeout(handle);
  }, [query]);

  useEffect(() => {
    const loaded = loadLibrary(applied);
    setRows(loaded.rows);
    setResume(loaded.resume);
    setTodayMs(loaded.todayMs);
  }, [applied, revision]);

  useEffect(() => {
    let cancelled = false;
    void refreshPresence(rows.map((row) => row.item)).then((changed) => {
      if (!cancelled && changed) {
        setRevision((value) => value + 1);
      }
    });
    return () => {
      cancelled = true;
    };
  }, [rows]);

  async function onImport(): Promise<void> {
    setBusy(true);
    setStatus(null);
    try {
      const summary = await importAudioFiles();
      if (summary) {
        setStatus(summaryText(summary));
        setRevision((value) => value + 1);
      }
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not import audio.');
    } finally {
      setBusy(false);
    }
  }

  async function onLocate(itemId: string): Promise<void> {
    setBusy(true);
    try {
      const found = await locateAudioFile(itemId);
      setStatus(found ? 'File linked. Notes stay on this lesson.' : 'Could not read that file.');
      setRevision((value) => value + 1);
    } catch (error) {
      setStatus(error instanceof Error ? error.message : 'Could not locate the file.');
    } finally {
      setBusy(false);
    }
  }

  return (
    <View style={styles.screen}>
      <View style={styles.header}>
        <Text style={styles.title}>AudioNote</Text>
        <Text style={styles.today}>Today {formatHours(todayMs)}</Text>
        <TextInput
          value={query}
          onChangeText={setQuery}
          placeholder="Search titles"
          placeholderTextColor={colors.muted}
          style={styles.search}
          autoCorrect={false}
          autoCapitalize="none"
          clearButtonMode="while-editing"
        />
        <Pressable
          accessibilityRole="button"
          disabled={busy}
          onPress={() => void onImport()}
          style={[styles.import, busy && styles.disabled]}
        >
          <Text style={styles.importText}>{busy ? 'Working…' : 'Import audio'}</Text>
        </Pressable>
        {status ? <Text style={styles.status}>{status}</Text> : null}
      </View>
      <FlashList
        data={rows}
        keyExtractor={(row) => row.item.id}
        style={styles.list}
        contentContainerStyle={styles.listContent}
        ListHeaderComponent={
          resume.length ? (
            <View style={styles.resumeBlock}>
              <Text style={styles.section}>Continue</Text>
              <View style={styles.resumeRow}>
                {resume.map((item) => (
                  <Pressable key={item.id} onPress={() => onOpen(item.id)} style={styles.resumeCard}>
                    <Text numberOfLines={2} style={styles.resumeTitle}>
                      {item.title}
                    </Text>
                    <Text style={styles.meta}>{formatClock(item.positionMs)}</Text>
                  </Pressable>
                ))}
              </View>
            </View>
          ) : null
        }
        ListEmptyComponent={
          <Text style={styles.empty}>
            {applied.trim()
              ? 'No titles match that search.'
              : 'Import a lesson. The file stays where it is, and notes stay with this entry.'}
          </Text>
        }
        renderItem={({ item: row }) => {
          const { item, heard } = row;
          const positionFraction =
            item.durationMs && item.durationMs > 0 ? Math.min(1, item.positionMs / item.durationMs) : 0;
          return (
            <View style={styles.card}>
              <Pressable accessibilityRole="button" onPress={() => onOpen(item.id)} style={styles.cardMain}>
                <Text numberOfLines={2} style={styles.cardTitle}>
                  {item.title}
                </Text>
                <Text style={styles.meta}>
                  {(item.format ?? 'audio').toUpperCase()}
                  {item.durationMs ? ` · ${formatClock(item.durationMs)}` : ''}
                  {` · at ${formatClock(item.positionMs)}`}
                  {item.durationMs ? ` · ${Math.round(heard * 100)}% heard` : ''}
                </Text>
                <View style={styles.track}>
                  <View style={[styles.heard, { width: `${heard * 100}%` }]} />
                  <View style={[styles.position, { left: `${positionFraction * 100}%` }]} />
                </View>
                {item.missing ? <Text style={styles.missing}>File missing</Text> : null}
              </Pressable>
              <View style={styles.actions}>
                {item.missing ? (
                  <Pressable
                    accessibilityRole="button"
                    disabled={busy}
                    onPress={() => void onLocate(item.id)}
                    style={styles.action}
                  >
                    <Text style={styles.actionText}>Locate</Text>
                  </Pressable>
                ) : null}
                <Pressable
                  accessibilityRole="button"
                  onPress={() => {
                    if (pendingDeleteId === item.id) {
                      deleteItem(item.id);
                      setPendingDeleteId(null);
                      setRevision((value) => value + 1);
                    } else {
                      setPendingDeleteId(item.id);
                    }
                  }}
                  style={styles.action}
                >
                  <Text style={[styles.actionText, pendingDeleteId === item.id && styles.dangerText]}>
                    {pendingDeleteId === item.id ? 'Confirm delete' : 'Delete'}
                  </Text>
                </Pressable>
              </View>
            </View>
          );
        }}
      />
    </View>
  );
}

const styles = StyleSheet.create({
  screen: {
    flex: 1,
    backgroundColor: colors.background,
    paddingTop: 56,
  },
  header: {
    paddingHorizontal: 20,
    gap: 10,
    paddingBottom: 8,
  },
  title: {
    color: colors.text,
    fontSize: 32,
    fontWeight: '700',
  },
  today: {
    color: colors.muted,
    fontSize: 15,
  },
  search: {
    color: colors.text,
    backgroundColor: colors.card,
    borderRadius: 12,
    paddingHorizontal: 14,
    paddingVertical: 12,
    fontSize: 16,
  },
  import: {
    backgroundColor: colors.accent,
    borderRadius: 12,
    minHeight: 48,
    alignItems: 'center',
    justifyContent: 'center',
  },
  disabled: {
    opacity: 0.6,
  },
  importText: {
    color: colors.background,
    fontSize: 16,
    fontWeight: '700',
  },
  status: {
    color: colors.muted,
    fontSize: 14,
  },
  list: {
    flex: 1,
  },
  listContent: {
    paddingHorizontal: 20,
    paddingBottom: 32,
  },
  resumeBlock: {
    marginBottom: 16,
    gap: 8,
  },
  section: {
    color: colors.text,
    fontSize: 16,
    fontWeight: '600',
  },
  resumeRow: {
    flexDirection: 'row',
    flexWrap: 'wrap',
    gap: 8,
  },
  resumeCard: {
    width: 148,
    minHeight: 84,
    backgroundColor: colors.cardRaised,
    borderRadius: 12,
    padding: 12,
    justifyContent: 'space-between',
  },
  resumeTitle: {
    color: colors.text,
    fontSize: 14,
    fontWeight: '600',
  },
  empty: {
    color: colors.muted,
    fontSize: 16,
    lineHeight: 24,
    paddingTop: 12,
  },
  card: {
    backgroundColor: colors.card,
    borderRadius: 14,
    marginBottom: 10,
    padding: 14,
    gap: 8,
  },
  cardMain: {
    gap: 6,
  },
  cardTitle: {
    color: colors.text,
    fontSize: 17,
    fontWeight: '600',
  },
  meta: {
    color: colors.muted,
    fontSize: 13,
  },
  track: {
    height: 8,
    borderRadius: 4,
    backgroundColor: colors.line,
    overflow: 'hidden',
    marginTop: 4,
  },
  heard: {
    height: 8,
    backgroundColor: colors.heard,
  },
  position: {
    position: 'absolute',
    width: 2,
    height: 8,
    backgroundColor: colors.white,
  },
  missing: {
    color: colors.danger,
    fontSize: 13,
    fontWeight: '600',
  },
  actions: {
    flexDirection: 'row',
    gap: 8,
  },
  action: {
    minHeight: 40,
    justifyContent: 'center',
    paddingHorizontal: 4,
  },
  actionText: {
    color: colors.accent,
    fontSize: 15,
    fontWeight: '600',
  },
  dangerText: {
    color: colors.danger,
  },
});

import React, { useCallback, useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { memoryOperations } from '../database/operations';
import { isMemoryEnabled, setMemoryEnabled } from '../memory/memorySettings';

type MemoryRow = { id: number; fact: string; category: string; updated_at: number };

type Theme = ReturnType<typeof import('../theme').getTheme>;

export default function MemorySettings({ theme }: { theme: Theme }) {
    const c = theme.colors;
    const [enabled, setEnabled] = useState(true);
    const [query, setQuery] = useState('');
    const [rows, setRows] = useState<MemoryRow[]>([]);
    const [editingId, setEditingId] = useState<number | null>(null);
    const [editText, setEditText] = useState('');

    const load = useCallback(async () => {
        setEnabled(await isMemoryEnabled());
        setRows((await memoryOperations.search(query)) as MemoryRow[]);
    }, [query]);

    useEffect(() => {
        load();
    }, [load]);

    const clearAll = () => {
        Alert.alert('Clear all memories?', 'Ampi will forget everything it saved about you.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Clear all',
                style: 'destructive',
                onPress: async () => {
                    await memoryOperations.clearAll();
                    await load();
                },
            },
        ]);
    };

    return (
        <View style={styles.wrap}>
            <Text style={[styles.title, { color: c.text.primary }]} accessibilityRole="header">Memory</Text>
            <Text style={[styles.body, { color: c.text.secondary }]}>
                Facts Ampi saves on this device (likes, household, equipment, and goals). They are sent to your AI provider only when you allow AI requests. Allergies stay in Allergies &amp; diet.
            </Text>
            <View style={styles.row}>
                <Text style={[styles.rowText, { color: c.text.primary }]}>Ampi can remember things</Text>
                <Switch
                    value={enabled}
                    onValueChange={async (v) => {
                        setEnabled(v);
                        await setMemoryEnabled(v);
                    }}
                    accessibilityLabel="Ampi can remember things"
                />
            </View>
            <TextInput
                value={query}
                onChangeText={setQuery}
                placeholder="Search memories"
                placeholderTextColor={c.text.tertiary}
                style={[styles.input, { color: c.text.primary, borderColor: c.border, backgroundColor: c.surface }]}
            />
            {rows.map((row) => (
                <View key={row.id} style={[styles.memCard, { borderColor: c.border, backgroundColor: c.surface }]}>
                    <Text style={[styles.cat, { color: c.text.tertiary }]}>{row.category}</Text>
                    {editingId === row.id ? (
                        <TextInput
                            value={editText}
                            onChangeText={setEditText}
                            style={[styles.input, { color: c.text.primary, borderColor: c.border }]}
                        />
                    ) : (
                        <Text style={{ color: c.text.primary }}>{row.fact}</Text>
                    )}
                    <View style={styles.memActions}>
                        {editingId === row.id ? (
                            <Pressable
                                onPress={async () => {
                                    await memoryOperations.update(row.id, editText.trim());
                                    setEditingId(null);
                                    await load();
                                }}
                                accessibilityRole="button"
                            >
                                <Text style={{ color: theme.primary[600], fontWeight: '700' }}>Save</Text>
                            </Pressable>
                        ) : (
                            <Pressable
                                onPress={() => {
                                    setEditingId(row.id);
                                    setEditText(row.fact);
                                }}
                                accessibilityRole="button"
                            >
                                <Text style={{ color: theme.primary[600], fontWeight: '700' }}>Edit</Text>
                            </Pressable>
                        )}
                        <Pressable
                            onPress={async () => {
                                await memoryOperations.delete(row.id);
                                await load();
                            }}
                            accessibilityRole="button"
                        >
                            <Text style={{ color: c.error, fontWeight: '700' }}>Delete</Text>
                        </Pressable>
                    </View>
                </View>
            ))}
            {rows.length === 0 ? <Text style={[styles.body, { color: c.text.tertiary }]}>No memories saved yet.</Text> : null}
            <Pressable onPress={clearAll} style={[styles.clearBtn, { borderColor: c.border }]} accessibilityRole="button">
                <Text style={{ color: c.error, fontWeight: '700' }}>Clear all</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { gap: 10 },
    title: { fontSize: 18, fontWeight: '600' },
    body: { fontSize: 14, lineHeight: 20 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between' },
    rowText: { fontSize: 16, flex: 1, marginRight: 12 },
    input: { borderWidth: 1, borderRadius: 10, paddingHorizontal: 12, paddingVertical: 10, fontSize: 16 },
    memCard: { borderWidth: 1, borderRadius: 12, padding: 12, gap: 6 },
    cat: { fontSize: 12, fontWeight: '700', textTransform: 'uppercase' },
    memActions: { flexDirection: 'row', gap: 16, marginTop: 4 },
    clearBtn: { alignSelf: 'flex-start', borderWidth: 1, borderRadius: 999, paddingHorizontal: 16, paddingVertical: 10, marginTop: 4 },
});

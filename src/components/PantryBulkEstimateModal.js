import React, { useState } from 'react';
import { Modal, View, Text, StyleSheet, ScrollView, Pressable, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import PantryPctSliders from './PantryPctSliders';
import { pantryOperations } from '../database/operations';
import { runSyncPush } from '../sync/engine';

export default function PantryBulkEstimateModal({ visible, theme, estimates, onClose, onSaved }) {
    const [rows, setRows] = useState([]);
    const [saving, setSaving] = useState(false);

    React.useEffect(() => {
        if (visible && estimates?.length) {
            setRows(
                estimates.map((e) => ({
                    ...e,
                    freshnessAi: true,
                    amountAi: true,
                }))
            );
        }
    }, [visible, estimates]);

    const updateRow = (id, patch) => {
        setRows((prev) => prev.map((r) => (r.id === id ? { ...r, ...patch } : r)));
    };

    const save = async () => {
        setSaving(true);
        try {
            for (const row of rows) {
                const existing = await pantryOperations.getById(row.id);
                if (!existing) continue;
                await pantryOperations.update(row.id, {
                    name: existing.name,
                    category: existing.category,
                    quantity: existing.quantity,
                    unit: existing.unit,
                    barcode: existing.barcode,
                    imageUri: existing.image_uri,
                    expirationDate: existing.expiration_date,
                    location: existing.location,
                    notes: existing.notes,
                    freshness_pct: row.freshness_pct,
                    amount_pct: row.amount_pct,
                });
            }
            await runSyncPush();
            onSaved?.();
            onClose();
        } finally {
            setSaving(false);
        }
    };

    return (
        <Modal visible={visible} animationType="slide" transparent onRequestClose={onClose}>
            <View style={styles.overlay}>
                <View style={[styles.sheet, { backgroundColor: theme.colors.surface }]}>
                    <Text style={[styles.title, { color: theme.colors.text.primary }]}>Photo estimates</Text>
                    <Text style={[styles.sub, { color: theme.colors.text.secondary }]}>
                        Adjust sliders, then save. Photos are not stored on the server.
                    </Text>
                    <ScrollView style={styles.scroll}>
                        {rows.map((row) => (
                            <View key={row.id} style={[styles.card, { borderColor: theme.colors.border }]}>
                                <Text style={[styles.name, { color: theme.colors.text.primary }]}>{row.name}</Text>
                                <PantryPctSliders
                                    theme={theme}
                                    freshnessPct={row.freshness_pct}
                                    amountPct={row.amount_pct}
                                    freshnessAi={row.freshnessAi}
                                    amountAi={row.amountAi}
                                    onFreshnessChange={(v) =>
                                        updateRow(row.id, { freshness_pct: v, freshnessAi: false })
                                    }
                                    onAmountChange={(v) => updateRow(row.id, { amount_pct: v, amountAi: false })}
                                />
                            </View>
                        ))}
                    </ScrollView>
                    <View style={styles.actions}>
                        <Pressable onPress={onClose} style={styles.cancel} accessibilityRole="button">
                            <Text style={{ color: theme.colors.text.secondary }}>Cancel</Text>
                        </Pressable>
                        <Pressable
                            onPress={() => void save()}
                            disabled={saving || !rows.length}
                            style={[styles.save, { backgroundColor: theme.primary[500], opacity: saving ? 0.7 : 1 }]}
                            accessibilityRole="button"
                        >
                            {saving ? (
                                <ActivityIndicator color="#fff" />
                            ) : (
                                <>
                                    <Ionicons name="checkmark" size={18} color="#fff" />
                                    <Text style={styles.saveText}>Save updates</Text>
                                </>
                            )}
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

const styles = StyleSheet.create({
    overlay: { flex: 1, backgroundColor: 'rgba(0,0,0,0.45)', justifyContent: 'flex-end' },
    sheet: { maxHeight: '90%', borderTopLeftRadius: 16, borderTopRightRadius: 16, padding: 16 },
    title: { fontSize: 20, fontWeight: '700' },
    sub: { fontSize: 14, marginTop: 4, marginBottom: 12 },
    scroll: { maxHeight: 420 },
    card: { borderWidth: 1, borderRadius: 12, padding: 12, marginBottom: 12 },
    name: { fontSize: 16, fontWeight: '600', marginBottom: 4 },
    actions: { flexDirection: 'row', justifyContent: 'flex-end', alignItems: 'center', gap: 16, marginTop: 8 },
    cancel: { padding: 12 },
    save: { flexDirection: 'row', alignItems: 'center', gap: 6, paddingHorizontal: 16, paddingVertical: 12, borderRadius: 10 },
    saveText: { color: '#fff', fontWeight: '700' },
});

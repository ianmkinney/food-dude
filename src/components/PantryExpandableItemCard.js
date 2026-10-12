import React, { useCallback, useEffect, useRef, useState } from 'react';
import { View, Text, StyleSheet, TextInput, ActivityIndicator } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ElevatedCard from './ElevatedCard';
import AnimatedPressable from './AnimatedPressable';
import PantryExpirationBadge from './PantryExpirationBadge';
import PantryFreshnessBars from './PantryFreshnessBars';
import PantryPctSliders from './PantryPctSliders';
import PantryExpirationDateField from './PantryExpirationDateField';
import PantryPhotoEstimateButton from './PantryPhotoEstimateButton';
import { pantryOperations } from '../database/operations';
import { pantryExpirationFromStorage, pantryExpirationToStorage } from '../utils/pantryExpiration';
import { clampPantryPct } from '../utils/pantryLevels';
import { estimatePantryItemFromPhoto } from '../services/pantryVisionEstimate';
import { runSyncPush } from '../sync/engine';

function draftFromItem(item) {
    return {
        freshnessPct: clampPantryPct(item.freshness_pct),
        amountPct: clampPantryPct(item.amount_pct),
        expirationDate: pantryExpirationFromStorage(item.expiration_date),
        notes: item.notes || '',
    };
}

/**
 * Collapsed pantry row; expands inline with sliders, expiration, notes, photo, edit/delete.
 */
export default function PantryExpandableItemCard({
    item,
    index,
    theme,
    expanded,
    onToggleExpand,
    onEdit,
    onDelete,
    onSaved,
}) {
    const [draft, setDraft] = useState(() => draftFromItem(item));
    const [freshnessAi, setFreshnessAi] = useState(false);
    const [amountAi, setAmountAi] = useState(false);
    const [saving, setSaving] = useState(false);
    const saveTimer = useRef(null);
    const draftRef = useRef(draft);

    useEffect(() => {
        draftRef.current = draft;
    }, [draft]);

    useEffect(() => {
        if (!expanded) {
            setDraft(draftFromItem(item));
            setFreshnessAi(false);
            setAmountAi(false);
        }
    }, [item, expanded]);

    const flushSave = useCallback(async () => {
        if (saveTimer.current) {
            clearTimeout(saveTimer.current);
            saveTimer.current = null;
        }
        const d = draftRef.current;
        setSaving(true);
        try {
            await pantryOperations.update(item.id, {
                name: item.name,
                quantity: item.quantity,
                unit: item.unit,
                category: item.category,
                barcode: item.barcode,
                imageUri: item.image_uri,
                expirationDate: pantryExpirationToStorage(d.expirationDate),
                location: item.location,
                notes: d.notes,
                freshnessPct: d.freshnessPct,
                amountPct: d.amountPct,
            });
            await runSyncPush();
            onSaved?.();
        } catch (e) {
            console.error('Pantry quick save failed', e);
        } finally {
            setSaving(false);
        }
    }, [item, onSaved]);

    const wasExpandedRef = useRef(false);

    useEffect(() => {
        if (wasExpandedRef.current && !expanded) {
            void flushSave();
        }
        wasExpandedRef.current = expanded;
    }, [expanded, flushSave]);

    const scheduleSave = useCallback(() => {
        if (saveTimer.current) clearTimeout(saveTimer.current);
        saveTimer.current = setTimeout(() => {
            saveTimer.current = null;
            void flushSave();
        }, 700);
    }, [flushSave]);

    useEffect(() => {
        return () => {
            if (saveTimer.current) clearTimeout(saveTimer.current);
        };
    }, []);

    const handleToggle = () => {
        onToggleExpand(item.id);
    };

    const onFreshnessChange = (v, meta) => {
        setDraft((prev) => ({ ...prev, freshnessPct: v }));
        if (!meta?.fromAi) setFreshnessAi(false);
        scheduleSave();
    };

    const onAmountChange = (v, meta) => {
        setDraft((prev) => ({ ...prev, amountPct: v }));
        if (!meta?.fromAi) setAmountAi(false);
        scheduleSave();
    };

    const handlePhoto = async (image) => {
        const est = await estimatePantryItemFromPhoto(image, item.name);
        setDraft((prev) => ({
            ...prev,
            freshnessPct: clampPantryPct(est.freshness_pct),
            amountPct: clampPantryPct(est.amount_pct),
        }));
        setFreshnessAi(true);
        setAmountAi(true);
        scheduleSave();
    };

    const barItem = expanded
        ? { ...item, freshness_pct: draft.freshnessPct, amount_pct: draft.amountPct }
        : item;

    return (
        <ElevatedCard theme={theme} index={index} style={[styles.card, expanded && styles.cardExpanded]}>
            <AnimatedPressable
                accessibilityRole="button"
                accessibilityLabel={expanded ? `Collapse ${item.name}` : `Expand ${item.name}`}
                accessibilityState={{ expanded }}
                onPress={handleToggle}
                style={styles.collapsedRow}
            >
                <Text style={[styles.itemName, { color: theme.colors.text.primary }]} numberOfLines={1}>
                    {item.name}
                </Text>
                <PantryFreshnessBars item={barItem} theme={theme} variant="tiny" />
                <PantryExpirationBadge expirationDate={item.expiration_date} theme={theme} compact />
                <Ionicons
                    name={expanded ? 'chevron-up' : 'chevron-down'}
                    size={18}
                    color={theme.colors.text.tertiary}
                />
            </AnimatedPressable>

            {expanded ? (
                <View
                    style={[
                        styles.expandedBody,
                        { borderTopColor: theme.colors.borderSoft || theme.colors.border },
                    ]}
                >
                    {(item.quantity || item.category) ? (
                        <Text style={[styles.meta, { color: theme.colors.text.secondary }]} numberOfLines={2}>
                            {[item.quantity && `${item.quantity} ${item.unit || ''}`.trim(), item.category]
                                .filter(Boolean)
                                .join(' · ')}
                        </Text>
                    ) : null}

                    <PantryPhotoEstimateButton theme={theme} onEstimate={handlePhoto} />

                    <PantryPctSliders
                        theme={theme}
                        freshnessPct={draft.freshnessPct}
                        amountPct={draft.amountPct}
                        onFreshnessChange={onFreshnessChange}
                        onAmountChange={onAmountChange}
                        freshnessAi={freshnessAi}
                        amountAi={amountAi}
                    />

                    <PantryExpirationDateField
                        theme={theme}
                        value={draft.expirationDate}
                        onChange={(v) => {
                            setDraft((prev) => ({ ...prev, expirationDate: v }));
                            scheduleSave();
                        }}
                    />

                    <Text style={[styles.notesLabel, { color: theme.colors.text.secondary }]}>Notes</Text>
                    <TextInput
                        accessibilityLabel="Notes"
                        multiline
                        value={draft.notes}
                        onChangeText={(v) => {
                            setDraft((prev) => ({ ...prev, notes: v }));
                            scheduleSave();
                        }}
                        placeholder="Optional notes"
                        placeholderTextColor={theme.colors.text.tertiary}
                        style={[
                            styles.notesInput,
                            {
                                backgroundColor: theme.colors.surface,
                                color: theme.colors.text.primary,
                                borderColor: theme.colors.border,
                            },
                        ]}
                    />

                    <View style={styles.actionRow}>
                        {saving ? <ActivityIndicator size="small" color={theme.primary[500]} /> : <View />}
                        <View style={styles.actionButtons}>
                            <AnimatedPressable
                                accessibilityRole="button"
                                accessibilityLabel="Edit item"
                                style={[styles.actionButton, { backgroundColor: theme.primary[100] }]}
                                onPress={() => onEdit(item)}
                            >
                                <Ionicons name="pencil" size={18} color={theme.primary[500]} />
                            </AnimatedPressable>
                            <AnimatedPressable
                                accessibilityRole="button"
                                accessibilityLabel="Delete item"
                                style={[styles.actionButton, { backgroundColor: theme.colors.error + '20' }]}
                                onPress={() => onDelete(item)}
                            >
                                <Ionicons name="trash-outline" size={18} color={theme.colors.error} />
                            </AnimatedPressable>
                        </View>
                    </View>
                </View>
            ) : null}
        </ElevatedCard>
    );
}

const styles = StyleSheet.create({
    card: {
        paddingVertical: 10,
        paddingHorizontal: 12,
        marginBottom: 10,
    },
    cardExpanded: {
        paddingBottom: 14,
    },
    collapsedRow: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
    },
    itemName: {
        flex: 1,
        fontSize: 16,
        fontWeight: '600',
    },
    expandedBody: {
        marginTop: 12,
        gap: 12,
        paddingTop: 12,
        borderTopWidth: StyleSheet.hairlineWidth,
    },
    meta: {
        fontSize: 13,
    },
    notesLabel: {
        fontSize: 13,
        fontWeight: '600',
        marginBottom: -4,
    },
    notesInput: {
        minHeight: 72,
        borderWidth: 1,
        borderRadius: 8,
        paddingHorizontal: 12,
        paddingVertical: 10,
        fontSize: 15,
        textAlignVertical: 'top',
    },
    actionRow: {
        flexDirection: 'row',
        alignItems: 'center',
        justifyContent: 'space-between',
        marginTop: 4,
    },
    actionButtons: {
        flexDirection: 'row',
        gap: 8,
    },
    actionButton: {
        width: 44,
        height: 44,
        borderRadius: 22,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

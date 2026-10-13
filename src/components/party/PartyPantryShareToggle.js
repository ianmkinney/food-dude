import React, { useState } from 'react';
import { ActivityIndicator, StyleSheet, Switch, Text, View } from 'react-native';
import { setPartyPantryShare } from '../../services/partyPantryShare';

export function PartyPantryShareToggle({ theme, livePartyId, enabled, onChanged, disabled }) {
    const c = theme.colors;
    const [busy, setBusy] = useState(false);

    const toggle = async (next) => {
        if (!livePartyId || busy) return;
        setBusy(true);
        try {
            await setPartyPantryShare(livePartyId, next);
            onChanged?.(next);
        } catch (e) {
            console.warn('[party pantry share]', e?.message || e);
        } finally {
            setBusy(false);
        }
    };

    return (
        <View style={[styles.row, { borderColor: c.border, backgroundColor: c.surfaceMuted }]}>
            <View style={styles.textWrap}>
                <Text style={[styles.label, { color: c.text.primary }]}>Share my pantry with this party</Text>
                <Text style={[styles.hint, { color: c.text.tertiary }]}>
                    Sends item names, amounts, freshness, and expiration to the party server so {`Ampi`} can plan meals.
                    Turn off anytime to delete it.
                </Text>
            </View>
            {busy ? (
                <ActivityIndicator color={theme.primary[500]} />
            ) : (
                <Switch
                    value={Boolean(enabled)}
                    onValueChange={toggle}
                    disabled={disabled || !livePartyId}
                    trackColor={{ false: c.border, true: theme.primary[300] }}
                    thumbColor={enabled ? theme.primary[500] : c.surface}
                />
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 10,
        marginHorizontal: 12,
        marginBottom: 8,
        padding: 10,
        borderRadius: 12,
        borderWidth: StyleSheet.hairlineWidth,
    },
    textWrap: { flex: 1, gap: 4 },
    label: { fontSize: 14, fontWeight: '700' },
    hint: { fontSize: 11, lineHeight: 15 },
});

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import {
    amountBarColor,
    amountLabel,
    clampPantryPct,
    freshnessBarColor,
    freshnessLabel,
} from '../utils/pantryLevels';

export default function PantryFreshnessBars({ item, theme, compact = true }) {
    const freshness = clampPantryPct(item?.freshness_pct);
    const amount = clampPantryPct(item?.amount_pct);
    const track = theme.colors.borderSoft || theme.colors.border;

    return (
        <View style={[styles.wrap, compact && styles.wrapCompact]}>
            <BarRow
                label="Fresh"
                valueLabel={freshnessLabel(freshness)}
                pct={freshness}
                fillColor={freshnessBarColor(freshness, theme)}
                trackColor={track}
                textColor={theme.colors.text.secondary}
            />
            <BarRow
                label="Amt"
                valueLabel={amountLabel(amount)}
                pct={amount}
                fillColor={amountBarColor(amount, theme)}
                trackColor={track}
                textColor={theme.colors.text.secondary}
            />
        </View>
    );
}

function BarRow({ label, valueLabel, pct, fillColor, trackColor, textColor }) {
    return (
        <View style={styles.row}>
            <Text style={[styles.label, { color: textColor }]} numberOfLines={1}>
                {label}
            </Text>
            <View style={[styles.track, { backgroundColor: trackColor }]}>
                <View style={[styles.fill, { width: `${pct}%`, backgroundColor: fillColor }]} />
            </View>
            <Text style={[styles.value, { color: textColor }]} numberOfLines={1}>
                {valueLabel}
            </Text>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { gap: 6, marginTop: 8 },
    wrapCompact: { marginTop: 6 },
    row: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    label: { width: 42, fontSize: 11, fontWeight: '600' },
    track: { flex: 1, height: 8, borderRadius: 4, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 4 },
    value: { width: 72, fontSize: 11, textAlign: 'right' },
});

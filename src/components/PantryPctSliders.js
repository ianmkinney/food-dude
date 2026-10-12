import React, { useCallback } from 'react';
import { View, Text, StyleSheet, Platform, Pressable } from 'react-native';
import { AiBadge } from '../ai/AiLabel';
import {
    amountLabel,
    clampPantryPct,
    freshnessLabel,
    freshnessBarColor,
    amountBarColor,
} from '../utils/pantryLevels';

function WebRange({ value, onChange, ariaLabel, trackColor, fillColor }) {
    if (Platform.OS !== 'web') return null;
    return (
        <input
            type="range"
            min={0}
            max={100}
            step={1}
            value={value}
            aria-label={ariaLabel}
            onChange={(e) => onChange(Number(e.target.value))}
            style={{
                width: '100%',
                height: 28,
                accentColor: fillColor,
                cursor: 'pointer',
            }}
        />
    );
}

function NativeStepper({ value, onChange, theme }) {
    if (Platform.OS === 'web') return null;
    const step = (delta) => onChange(clampPantryPct(value + delta));
    return (
        <View style={styles.stepper}>
            <Pressable
                onPress={() => step(-5)}
                style={[styles.stepBtn, { borderColor: theme.colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="Decrease"
            >
                <Text style={{ color: theme.colors.text.primary, fontWeight: '700' }}>−</Text>
            </Pressable>
            <Text style={[styles.pctText, { color: theme.colors.text.primary }]}>{value}%</Text>
            <Pressable
                onPress={() => step(5)}
                style={[styles.stepBtn, { borderColor: theme.colors.border }]}
                accessibilityRole="button"
                accessibilityLabel="Increase"
            >
                <Text style={{ color: theme.colors.text.primary, fontWeight: '700' }}>+</Text>
            </Pressable>
        </View>
    );
}

export default function PantryPctSliders({
    theme,
    freshnessPct,
    amountPct,
    onFreshnessChange,
    onAmountChange,
    freshnessAi,
    amountAi,
}) {
    const freshness = clampPantryPct(freshnessPct);
    const amount = clampPantryPct(amountPct);
    const track = theme.colors.borderSoft || theme.colors.border;

    const onFresh = useCallback(
        (v) => {
            onFreshnessChange(clampPantryPct(v), { fromAi: false });
        },
        [onFreshnessChange]
    );
    const onAmt = useCallback(
        (v) => {
            onAmountChange(clampPantryPct(v), { fromAi: false });
        },
        [onAmountChange]
    );

    return (
        <View style={styles.root}>
            <SliderBlock
                title="Freshness"
                hint="Fresh → use soon → going bad"
                value={freshness}
                valueLabel={freshnessLabel(freshness)}
                fillColor={freshnessBarColor(freshness, theme)}
                trackColor={track}
                theme={theme}
                onChange={onFresh}
                aiFlag={freshnessAi}
                ariaLabel="Freshness percent"
            />
            <SliderBlock
                title="Amount left"
                hint="Full → half → almost out"
                value={amount}
                valueLabel={amountLabel(amount)}
                fillColor={amountBarColor(amount, theme)}
                trackColor={track}
                theme={theme}
                onChange={onAmt}
                aiFlag={amountAi}
                ariaLabel="Amount left percent"
            />
        </View>
    );
}

function SliderBlock({
    title,
    hint,
    value,
    valueLabel,
    fillColor,
    trackColor,
    theme,
    onChange,
    aiFlag,
    ariaLabel,
}) {
    return (
        <View style={styles.block}>
            <View style={styles.titleRow}>
                <Text style={[styles.title, { color: theme.colors.text.primary }]}>{title}</Text>
                {aiFlag ? <AiBadge /> : null}
                <Text style={[styles.valueLabel, { color: theme.colors.text.secondary }]}>{valueLabel}</Text>
            </View>
            <Text style={[styles.hint, { color: theme.colors.text.tertiary }]}>{hint}</Text>
            <View style={[styles.track, { backgroundColor: trackColor }]}>
                <View style={[styles.fill, { width: `${value}%`, backgroundColor: fillColor }]} />
            </View>
            <WebRange
                value={value}
                onChange={onChange}
                ariaLabel={ariaLabel}
                trackColor={trackColor}
                fillColor={fillColor}
            />
            <NativeStepper value={value} onChange={onChange} theme={theme} />
        </View>
    );
}

const styles = StyleSheet.create({
    root: { gap: 20, marginVertical: 8 },
    block: { gap: 6 },
    titleRow: { flexDirection: 'row', alignItems: 'center', gap: 8, flexWrap: 'wrap' },
    title: { fontSize: 16, fontWeight: '600' },
    valueLabel: { fontSize: 14, fontWeight: '600', marginLeft: 'auto' },
    hint: { fontSize: 12 },
    track: { height: 10, borderRadius: 5, overflow: 'hidden' },
    fill: { height: '100%', borderRadius: 5 },
    stepper: { flexDirection: 'row', alignItems: 'center', justifyContent: 'center', gap: 16 },
    stepBtn: {
        width: 44,
        height: 44,
        borderRadius: 22,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
    pctText: { fontSize: 16, fontWeight: '700', minWidth: 48, textAlign: 'center' },
});

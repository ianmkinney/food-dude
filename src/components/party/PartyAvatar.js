import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const PALETTE = ['#EB6A1C', '#4F802F', '#E2261F', '#8B5CF6', '#45B7D1', '#F6C445'];

export function colorForKey(key) {
    const s = String(key || 'x');
    let hash = 0;
    for (let i = 0; i < s.length; i++) hash = (hash + s.charCodeAt(i) * (i + 1)) % PALETTE.length;
    return PALETTE[hash];
}

export default function PartyAvatar({ name, seed, size = 32, theme }) {
    const label = (name || '?').trim().charAt(0).toUpperCase() || '?';
    const bg = colorForKey(seed || name);
    return (
        <View
            style={[
                styles.circle,
                {
                    width: size,
                    height: size,
                    borderRadius: size / 2,
                    backgroundColor: bg,
                    borderColor: theme.colors.border,
                },
            ]}
        >
            <Text style={[styles.text, { fontSize: size * 0.42 }]}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    circle: {
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
    },
    text: { color: '#fff', fontWeight: '700' },
});

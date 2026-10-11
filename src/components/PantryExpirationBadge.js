import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { expirationBadge } from '../utils/pantryExpiration';

export default function PantryExpirationBadge({ expirationDate, theme }) {
    const info = expirationBadge(expirationDate);
    if (!info) return null;
    const colors =
        info.tone === 'expired'
            ? { bg: theme.colors.error + '18', fg: theme.colors.error, icon: 'alert-circle-outline' }
            : info.tone === 'soon'
              ? { bg: theme.accent.yellow + '22', fg: theme.accent.yellow, icon: 'time-outline' }
              : { bg: theme.primary[100], fg: theme.primary[700], icon: 'calendar-outline' };
    return (
        <View style={[styles.badge, { backgroundColor: colors.bg }]}>
            <Ionicons name={colors.icon} size={14} color={colors.fg} />
            <Text style={[styles.text, { color: colors.fg }]}>{info.label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    badge: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 4,
        paddingHorizontal: 8,
        paddingVertical: 4,
        borderRadius: 8,
        alignSelf: 'flex-start',
    },
    text: { fontSize: 12, fontWeight: '600' },
});

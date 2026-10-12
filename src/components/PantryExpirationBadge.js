import React from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { expirationBadge } from '../utils/pantryExpiration';

export default function PantryExpirationBadge({ expirationDate, theme, compact = false }) {
    const info = expirationBadge(expirationDate);
    if (!info) return null;
    const colors =
        info.tone === 'expired'
            ? { bg: theme.colors.error + '18', fg: theme.colors.error, icon: 'alert-circle-outline' }
            : info.tone === 'soon'
              ? { bg: theme.accent.yellow + '22', fg: theme.accent.yellow, icon: 'time-outline' }
              : { bg: theme.primary[100], fg: theme.primary[700], icon: 'calendar-outline' };
    return (
        <View style={[styles.badge, compact && styles.badgeCompact, { backgroundColor: colors.bg }]}>
            <Ionicons name={colors.icon} size={compact ? 12 : 14} color={colors.fg} />
            <Text style={[styles.text, compact && styles.textCompact, { color: colors.fg }]} numberOfLines={1}>
                {info.label}
            </Text>
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
    badgeCompact: {
        paddingHorizontal: 6,
        paddingVertical: 2,
        maxWidth: 88,
    },
    text: { fontSize: 12, fontWeight: '600' },
    textCompact: { fontSize: 10 },
});

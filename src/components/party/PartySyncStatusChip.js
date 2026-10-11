import React, { useEffect, useState } from 'react';
import { View, Text, StyleSheet } from 'react-native';
import { subscribePartySyncUiState } from '../../services/partyLiveSyncStatus';

const LABELS = {
    idle: null,
    saving: 'Saving…',
    saved: 'Saved',
    offline: 'Offline, will retry',
};

export default function PartySyncStatusChip({ partyId, theme }) {
    const [state, setState] = useState('idle');
    useEffect(() => {
        if (!partyId) return undefined;
        return subscribePartySyncUiState(partyId, setState);
    }, [partyId]);

    const label = LABELS[state];
    if (!label) return null;

    const color =
        state === 'offline'
            ? theme.colors.warning || '#C05621'
            : state === 'saved'
              ? theme.colors.success || '#2F855A'
              : theme.colors.text.secondary;

    return (
        <View style={[styles.wrap, { borderColor: theme.colors.border }]}>
            <Text style={[styles.text, { color }]}>{label}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        marginHorizontal: 16,
        marginBottom: 6,
        paddingVertical: 4,
        paddingHorizontal: 10,
        alignSelf: 'flex-start',
        borderRadius: 8,
        borderWidth: 1,
    },
    text: { fontSize: 12, fontWeight: '600' },
});

import React from 'react';
import { View, Text, StyleSheet } from 'react-native';

const COPY =
    'Signed-in Google accounts can use parties, encrypted sync, and optional backups online. API keys never leave your device.';

export default function PartyLiveNotice({ theme }) {
    return (
        <View style={[styles.wrap, { backgroundColor: theme.colors.background, borderColor: theme.colors.border }]}>
            <Text style={[styles.text, { color: theme.colors.text.secondary }]}>{COPY}</Text>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: {
        marginHorizontal: 16,
        marginBottom: 8,
        padding: 12,
        borderRadius: 12,
        borderWidth: 1,
    },
    text: { fontSize: 13, lineHeight: 18 },
});

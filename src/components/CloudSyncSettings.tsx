import React, { useCallback, useEffect, useState } from 'react';
import { ActivityIndicator, Pressable, StyleSheet, Text, View } from 'react-native';
import ThemedSwitch from './ThemedSwitch';
import { useGoogleAccount } from '../context/GoogleAccountContext';
import { runFullSync } from '../sync/engine';
import { getLastSyncedAt, getSyncEnabled, setSyncEnabled } from '../sync/syncPrefs';

type Props = {
    theme: ReturnType<typeof import('../theme').getTheme>;
};

export default function CloudSyncSettings({ theme }: Props) {
    const { session, syncStatus } = useGoogleAccount();
    const [enabled, setEnabled] = useState(true);
    const [lastSynced, setLastSynced] = useState<number | null>(null);
    const [busy, setBusy] = useState(false);
    const c = theme.colors;

    const refresh = useCallback(async () => {
        setEnabled(await getSyncEnabled());
        setLastSynced(await getLastSyncedAt());
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh, syncStatus, session]);

    if (!session) return null;

    const onToggle = async (value: boolean) => {
        setEnabled(value);
        await setSyncEnabled(value);
        if (value) await runFullSync();
    };

    const syncNow = async () => {
        setBusy(true);
        try {
            await runFullSync();
            await refresh();
        } finally {
            setBusy(false);
        }
    };

    const lastLabel = lastSynced
        ? new Date(lastSynced).toLocaleString()
        : 'Not synced yet';

    return (
        <View style={[styles.wrap, { borderTopColor: c.border }]}>
            <Text style={[styles.title, { color: c.text.primary }]}>Encrypted cloud sync</Text>
            <Text style={[styles.hint, { color: c.text.secondary }]}>
                Recipes, lists, profile, chat history, and memories sync across browsers when signed in. API keys and
                secrets never leave this device.
            </Text>
            <View style={styles.row}>
                <Text style={[styles.label, { color: c.text.primary }]}>Sync across devices</Text>
                <ThemedSwitch value={enabled} onValueChange={onToggle} />
            </View>
            <Text style={[styles.hint, { color: c.text.secondary }]}>Last synced: {lastLabel}</Text>
            <Pressable
                onPress={syncNow}
                disabled={busy || !enabled}
                style={[styles.button, { backgroundColor: theme.primary[500], opacity: busy || !enabled ? 0.5 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Sync now"
            >
                {busy ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.buttonText}>Sync now</Text>
                )}
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { gap: 8, marginTop: 16, paddingTop: 16, borderTopWidth: StyleSheet.hairlineWidth },
    title: { fontSize: 17, fontWeight: '600' },
    hint: { fontSize: 14, lineHeight: 20 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', minHeight: 44 },
    label: { fontSize: 15, fontWeight: '500', flex: 1, paddingRight: 8 },
    button: {
        minHeight: 44,
        borderRadius: 10,
        alignItems: 'center',
        justifyContent: 'center',
        paddingVertical: 12,
    },
    buttonText: { color: '#fff', fontSize: 16, fontWeight: '600' },
});

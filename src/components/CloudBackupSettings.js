import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import AnimatedPressable from './AnimatedPressable';
import { getOwnerSession } from '../platform/ownerSession';
import { exportLocalDatabasePayload } from '../services/localBackupExport';
import { snapshotLocalDatabaseBeforeRestore, restoreLocalDatabaseFromBase64 } from '../services/localBackupRestore';
import {
    deleteCloudBackup,
    downloadCloudBackup,
    listCloudBackups,
    uploadCloudBackup,
} from '../services/cloudBackup';

function formatSize(bytes) {
    if (bytes < 1024) return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(1)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(2)} MB`;
}

export default function CloudBackupSettings({ theme }) {
    const [session, setSession] = useState(null);
    const [backups, setBackups] = useState([]);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        const s = await getOwnerSession();
        setSession(s);
        if (!s) {
            setBackups([]);
            return;
        }
        try {
            setBackups(await listCloudBackups());
        } catch {
            setBackups([]);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    if (!session) return null;

    const text = theme.colors.text;

    const backUpNow = async () => {
        setBusy(true);
        try {
            const payload = await exportLocalDatabasePayload();
            await uploadCloudBackup(payload);
            await refresh();
            Alert.alert('Backed up', 'Your on-device data was saved to your account.');
        } catch (error) {
            Alert.alert('Backup failed', error?.message || 'Try again.');
        } finally {
            setBusy(false);
        }
    };

    const restore = (backup) => {
        Alert.alert(
            'Restore backup?',
            `Replace local data with backup from ${new Date(backup.createdAt).toLocaleString()}? A local snapshot is taken first.`,
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Restore',
                    style: 'destructive',
                    onPress: async () => {
                        setBusy(true);
                        try {
                            await snapshotLocalDatabaseBeforeRestore();
                            const data = await downloadCloudBackup(backup.id);
                            await restoreLocalDatabaseFromBase64(data.payloadBase64);
                            Alert.alert('Restored', 'Restart the app if anything looks out of date.');
                        } catch (error) {
                            Alert.alert('Restore failed', error?.message || 'Try again.');
                        } finally {
                            setBusy(false);
                        }
                    },
                },
            ]
        );
    };

    const remove = (backup) => {
        Alert.alert('Delete backup?', 'This cannot be undone.', [
            { text: 'Cancel', style: 'cancel' },
            {
                text: 'Delete',
                style: 'destructive',
                onPress: async () => {
                    setBusy(true);
                    try {
                        await deleteCloudBackup(backup.id);
                        await refresh();
                    } catch (error) {
                        Alert.alert('Delete failed', error?.message || 'Try again.');
                    } finally {
                        setBusy(false);
                    }
                },
            },
        ]);
    };

    return (
        <View style={styles.wrap}>
            <Text style={[styles.title, { color: text.primary }]}>Cloud backup</Text>
            <Text style={[styles.hint, { color: text.secondary }]}>
                Encrypted account backup of your on-device database (no API keys). Up to 5 MB per backup, last 10 kept.
            </Text>
            <AnimatedPressable
                onPress={backUpNow}
                disabled={busy}
                style={[styles.btn, { backgroundColor: theme.primary[500], opacity: busy ? 0.6 : 1 }]}
            >
                {busy ? (
                    <ActivityIndicator color="#fff" />
                ) : (
                    <Text style={styles.btnText}>Back up now</Text>
                )}
            </AnimatedPressable>
            {backups.map((b) => (
                <View key={b.id} style={[styles.row, { borderColor: theme.colors.border }]}>
                    <View style={styles.rowInfo}>
                        <Text style={{ color: text.primary, fontWeight: '600' }}>
                            {new Date(b.createdAt).toLocaleString()}
                        </Text>
                        <Text style={{ color: text.tertiary, fontSize: 12 }}>
                            v{b.appVersion} · schema {b.schemaVersion} · {formatSize(b.sizeBytes)}
                        </Text>
                    </View>
                    <AnimatedPressable onPress={() => restore(b)} style={styles.linkBtn}>
                        <Text style={{ color: theme.primary[500] }}>Restore</Text>
                    </AnimatedPressable>
                    <AnimatedPressable onPress={() => remove(b)} style={styles.linkBtn}>
                        <Text style={{ color: theme.accent.red }}>Delete</Text>
                    </AnimatedPressable>
                </View>
            ))}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { marginTop: 8 },
    title: { fontSize: 18, fontWeight: '700', marginBottom: 4 },
    hint: { fontSize: 13, lineHeight: 18, marginBottom: 12 },
    btn: { paddingVertical: 12, borderRadius: 10, alignItems: 'center', marginBottom: 12 },
    btnText: { color: '#fff', fontWeight: '600' },
    row: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 10,
        borderBottomWidth: StyleSheet.hairlineWidth,
        gap: 8,
    },
    rowInfo: { flex: 1 },
    linkBtn: { paddingHorizontal: 6, paddingVertical: 4 },
});

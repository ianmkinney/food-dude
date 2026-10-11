import React, { useEffect, useState } from 'react';
import { StyleSheet, Text, View } from 'react-native';
import { useGoogleAccount } from '../context/GoogleAccountContext';
import { getSyncDiagnostics, subscribeSyncDiagnostics } from '../sync/syncDiagnostics';

type Props = {
    theme: ReturnType<typeof import('../theme').getTheme>;
};

function fmt(ms: number | null) {
    if (!ms) return '—';
    try {
        return new Date(ms).toLocaleString();
    } catch {
        return String(ms);
    }
}

export default function SyncDiagnosticsPanel({ theme }: Props) {
    const { session } = useGoogleAccount();
    const [diag, setDiag] = useState(getSyncDiagnostics());
    const c = theme.colors;

    useEffect(() => subscribeSyncDiagnostics(setDiag), []);

    if (!session) return null;

    return (
        <View style={[styles.wrap, { borderTopColor: c.border }]}>
            <Text style={[styles.title, { color: c.text.primary }]}>Sync diagnostics</Text>
            <Text style={[styles.line, { color: c.text.secondary }]} accessibilityRole="text">
                Last push: {fmt(diag.lastPushAt)} ({diag.lastPushRecords} records)
            </Text>
            <Text style={[styles.line, { color: c.text.secondary }]} accessibilityRole="text">
                Last pull: {fmt(diag.lastPullAt)} ({diag.lastPullApplied} applied)
            </Text>
            <Text style={[styles.line, { color: c.text.secondary }]} accessibilityRole="text">
                Dirty local rows: {diag.dirtyCount}
            </Text>
            {diag.lastError ? (
                <Text style={[styles.error, { color: theme.colors.error }]} accessibilityRole="alert">
                    Last error: {diag.lastError}
                </Text>
            ) : (
                <Text style={[styles.line, { color: c.text.tertiary }]}>Last error: none</Text>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { gap: 4, marginTop: 12, paddingTop: 12, borderTopWidth: StyleSheet.hairlineWidth },
    title: { fontSize: 15, fontWeight: '600', marginBottom: 4 },
    line: { fontSize: 13, lineHeight: 18, fontFamily: 'monospace' },
    error: { fontSize: 13, lineHeight: 18 },
});

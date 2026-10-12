import React, { useCallback, useEffect, useState } from 'react';
import { View, Text, StyleSheet, Alert, ActivityIndicator } from 'react-native';
import AnimatedPressable from './AnimatedPressable';
import { hasDemoData, removeDemoData, seedDemoData } from '../demo/demoDataService';

export default function DemoDataSettings({ theme }) {
    const [demoPresent, setDemoPresent] = useState(false);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        setDemoPresent(await hasDemoData());
    }, []);

    useEffect(() => {
        refresh().catch(() => undefined);
    }, [refresh]);

    const confirmSeed = () => {
        Alert.alert(
            'Fill with demo data?',
            'Adds sample recipes, meal plans, pantry, grocery, an Ampi chat, and a local demo party. Your real data is not changed. Skip if demo data is already present.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Add demo data',
                    onPress: async () => {
                        setBusy(true);
                        try {
                            const result = await seedDemoData();
                            if (!result.seeded) {
                                Alert.alert('Demo data already exists', 'Remove demo data first if you want a fresh set.');
                            }
                            await refresh();
                        } catch (error) {
                            Alert.alert('Could not add demo data', error?.message || 'Try again.');
                        } finally {
                            setBusy(false);
                        }
                    },
                },
            ]
        );
    };

    const confirmRemove = () => {
        Alert.alert(
            'Remove demo data?',
            'Deletes only rows marked as demo (including synced tombstones for cloud sync). Your own recipes and lists stay.',
            [
                { text: 'Cancel', style: 'cancel' },
                {
                    text: 'Remove',
                    style: 'destructive',
                    onPress: async () => {
                        setBusy(true);
                        try {
                            await removeDemoData();
                            await refresh();
                        } catch (error) {
                            Alert.alert('Could not remove demo data', error?.message || 'Try again.');
                        } finally {
                            setBusy(false);
                        }
                    },
                },
            ]
        );
    };

    return (
        <View style={styles.wrap}>
            <Text style={[styles.title, { color: theme.colors.text.primary }]}>Demo data</Text>
            <Text style={[styles.body, { color: theme.colors.text.secondary }]}>
                Explore AmpliFood with a realistic sample library. Demo rows are tagged and can be removed anytime.
            </Text>
            {busy ? <ActivityIndicator color={theme.primary[500]} style={{ marginVertical: 8 }} /> : null}
            <AnimatedPressable
                onPress={confirmSeed}
                disabled={busy || demoPresent}
                style={[styles.btn, { backgroundColor: theme.primary[500], opacity: demoPresent ? 0.5 : 1 }]}
                accessibilityRole="button"
                accessibilityLabel="Fill with demo data"
            >
                <Text style={styles.btnText}>Fill with demo data</Text>
            </AnimatedPressable>
            {demoPresent ? (
                <AnimatedPressable
                    onPress={confirmRemove}
                    disabled={busy}
                    style={[styles.btnOutline, { borderColor: theme.colors.border }]}
                    accessibilityRole="button"
                    accessibilityLabel="Remove demo data"
                >
                    <Text style={[styles.btnOutlineText, { color: theme.colors.text.primary }]}>Remove demo data</Text>
                </AnimatedPressable>
            ) : null}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { gap: 10, paddingVertical: 4 },
    title: { fontSize: 16, fontWeight: '700' },
    body: { fontSize: 14, lineHeight: 20 },
    btn: { paddingVertical: 12, borderRadius: 12, alignItems: 'center' },
    btnText: { color: '#fff', fontWeight: '700' },
    btnOutline: { paddingVertical: 12, borderRadius: 12, alignItems: 'center', borderWidth: 1 },
    btnOutlineText: { fontWeight: '600' },
});

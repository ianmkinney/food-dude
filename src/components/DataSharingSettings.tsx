import React, { useCallback, useState } from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import ThemedSwitch from './ThemedSwitch';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
    PRIVACY_URL,
    TARGETS,
    TERMS_URL,
    getConsents,
    getIncludeHealthData,
    revokeConsent,
    setIncludeHealthData,
    type ConsentTarget,
} from '../consent/consentStore';
import { replayOnboarding } from '../onboarding/onboardingStore';

type Theme = ReturnType<typeof import('../theme').getTheme>;

/** Lists which providers the user allowed to receive data, with a Revoke button each. */
export default function DataSharingSettings({ theme }: { theme: Theme }) {
    const [granted, setGranted] = useState<ConsentTarget[]>([]);
    const [includeHealth, setIncludeHealth] = useState(false);

    const load = useCallback(() => {
        getConsents().then((map) => setGranted(Object.keys(map) as ConsentTarget[]));
        getIncludeHealthData().then(setIncludeHealth);
    }, []);
    useFocusEffect(load);

    const c = theme.colors;
    return (
        <View style={styles.root}>
            <View style={styles.header}>
                <Ionicons name="shield-checkmark-outline" size={22} color={theme.primary[500]} accessible={false} />
                <Text style={[styles.title, { color: c.text.primary }]} accessibilityRole="header">AI & privacy</Text>
            </View>
            <Text style={[styles.body, { color: c.text.secondary }]}>
                AmpliFood asks before sending anything to an AI or voice provider. Revoke a permission to stop sending; you'll be asked again next time.
            </Text>
            {granted.length === 0 ? (
                <Text style={[styles.body, { color: c.text.secondary }]}>You haven't allowed any provider yet.</Text>
            ) : (
                granted.map((target) => (
                    <View key={target} style={[styles.row, { borderColor: c.border }]}>
                        <Text style={[styles.rowText, { color: c.text.primary }]}>Allowed: {TARGETS[target].name}</Text>
                        <Pressable
                            onPress={async () => {
                                await revokeConsent(target);
                                load();
                            }}
                            style={[styles.revoke, { borderColor: c.border }]}
                            accessibilityRole="button"
                            accessibilityLabel={`Revoke sharing with ${TARGETS[target].name}`}
                        >
                            <Text style={[styles.revokeText, { color: c.text.primary }]}>Revoke</Text>
                        </Pressable>
                    </View>
                ))
            )}
            <View style={[styles.row, { borderColor: c.border }]}>
                <Text style={[styles.rowText, { color: c.text.primary }]}>Also include my allergies & diet needs in AI requests</Text>
                <ThemedSwitch
                    value={includeHealth}
                    onValueChange={async (value) => {
                        setIncludeHealth(value);
                        await setIncludeHealthData(value);
                    }}
                    accessibilityLabel="Also include my allergies and diet needs in AI requests"
                />
            </View>
            <Text style={[styles.body, { color: c.text.secondary }]}>
                Off: they stay on this device and the on-device allergen check still flags possible matches.
            </Text>
            <Pressable
                onPress={replayOnboarding}
                style={[styles.revoke, { borderColor: c.border, alignSelf: 'flex-start' }]}
                accessibilityRole="button"
                accessibilityLabel="Replay the Sous tour"
            >
                <Text style={[styles.revokeText, { color: c.text.primary }]}>Replay tour</Text>
            </Pressable>
            <View style={styles.links}>
                <Text style={[styles.link, { color: theme.primary[700] }]} accessibilityRole="link" onPress={() => Linking.openURL(TERMS_URL)}>
                    Terms of Use
                </Text>
                <Text style={[styles.link, { color: theme.primary[700] }]} accessibilityRole="link" onPress={() => Linking.openURL(PRIVACY_URL)}>
                    Privacy Policy
                </Text>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { gap: 10 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: 17, fontWeight: '800' },
    body: { fontSize: 14, lineHeight: 20 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 10 },
    rowText: { fontSize: 15, fontWeight: '600', flex: 1 },
    revoke: { borderWidth: 1, borderRadius: 999, paddingHorizontal: 14, paddingVertical: 8 },
    revokeText: { fontWeight: '800' },
    links: { flexDirection: 'row', gap: 20, marginTop: 4 },
    link: { fontSize: 14, fontWeight: '700', textDecorationLine: 'underline' },
});

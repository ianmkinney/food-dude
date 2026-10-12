import React, { useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { useGoogleAccount } from '../context/GoogleAccountContext';
import { testOwnerAi } from '../monetization/livePlatformAi';
import OwnerModelPickers from './OwnerModelPickers';
import OwnerOpenRouterStatsCard from './OwnerOpenRouterStatsCard';

type Props = {
    theme: ReturnType<typeof import('../theme').getTheme>;
};

/** Account details for the unified Google session (sign-in lives in the header). */
export default function AccountGoogleSection({ theme }: Props) {
    const { configured, session, platformAiAllowed, busy, signOut } = useGoogleAccount();
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

    if (!configured) return null;

    const text = theme.colors.text;

    const runTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const result = await testOwnerAi();
            const note = result.modelFallbackNote ? ` · ${result.modelFallbackNote}` : '';
            setTestResult({ ok: true, text: `Working · ${result.model} · ${result.latencyMs} ms${note}` });
        } catch (error) {
            const msg = error instanceof Error ? error.message : 'Test failed.';
            setTestResult({ ok: false, text: msg });
        } finally {
            setTesting(false);
        }
    };

    return (
        <View style={styles.wrap}>
            <Text style={[styles.title, { color: text.primary }]}>Google account</Text>
            {!session ? (
                <Text style={[styles.hint, { color: text.secondary }]}>
                    Tap <Text style={styles.em}>Sign in</Text> in the top bar to sync across browsers, use parties,
                    and cloud backup. One Google sign-in for everything — no separate owner step.
                </Text>
            ) : (
                <>
                    <Text style={[styles.value, { color: text.primary }]}>
                        Signed in as {session.name || session.email}
                    </Text>
                    <Text style={[styles.hint, { color: text.secondary }]}>
                        {platformAiAllowed
                            ? 'Platform AI (OpenRouter) is on for this account. Model pickers and stats are below.'
                            : 'Use your own API key in AI settings, or ask for a tester invite for platform AI.'}
                    </Text>
                    {platformAiAllowed ? (
                        <>
                            <View style={styles.statusRow}>
                                <Text style={[styles.hint, { color: text.secondary }]}>Platform AI</Text>
                                <Pressable
                                    onPress={runTest}
                                    disabled={testing}
                                    style={[styles.testButton, { borderColor: theme.colors.border }]}
                                    accessibilityRole="button"
                                    accessibilityLabel="Test platform AI"
                                >
                                    <Text style={[styles.testText, { color: theme.primary[500] }]}>
                                        {testing ? 'Testing…' : 'Test'}
                                    </Text>
                                </Pressable>
                            </View>
                            {testResult ? (
                                <Text
                                    accessibilityLiveRegion="polite"
                                    style={[styles.hint, { color: testResult.ok ? text.secondary : theme.colors.error }]}
                                >
                                    {testResult.text}
                                </Text>
                            ) : null}
                            <OwnerOpenRouterStatsCard theme={theme} />
                            <OwnerModelPickers theme={theme} />
                        </>
                    ) : null}
                    <Pressable
                        style={[styles.button, { backgroundColor: theme.colors.surfaceMuted }]}
                        onPress={() => signOut()}
                        disabled={busy}
                        accessibilityRole="button"
                    >
                        <Text style={[styles.buttonText, { color: text.primary }]}>Sign out</Text>
                    </Pressable>
                </>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    wrap: { gap: 8 },
    title: { fontSize: 17, fontWeight: '600' },
    hint: { fontSize: 14, lineHeight: 20 },
    em: { fontWeight: '600' },
    value: { fontSize: 15, fontWeight: '500' },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    testButton: {
        minHeight: 44,
        minWidth: 64,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderRadius: 999,
        alignItems: 'center',
        justifyContent: 'center',
    },
    testText: { fontSize: 15, fontWeight: '600' },
    button: {
        marginTop: 4,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 10,
        alignItems: 'center',
    },
    buttonText: { fontSize: 16, fontWeight: '600' },
});

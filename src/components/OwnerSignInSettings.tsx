import React, { useCallback, useEffect, useMemo, useState } from 'react';
import { Alert, Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import * as Google from 'expo-auth-session/providers/google';
import * as WebBrowser from 'expo-web-browser';
import {
    clearOwnerSession,
    exchangeGoogleIdToken,
    fetchOwnerUsage,
    getOwnerSession,
    type OwnerSession,
    type OwnerUsage,
} from '../platform/ownerSession';
import { getOwnerGoogleClientIds, isOwnerSignInConfigured } from '../platform/ownerSignInConfig';
import {
    signInWithGooglePopup,
    takePendingGoogleSignIn,
    type GoogleSignInPayload,
} from '../platform/googleWebAuth';
import { testOwnerAi } from '../monetization/livePlatformAi';

WebBrowser.maybeCompleteAuthSession();

type Props = {
    theme: ReturnType<typeof import('../theme').getTheme>;
};

/** Renders nothing unless Google client IDs are configured for this platform (avoids hook crash). */
export default function OwnerSignInSettings(props: Props) {
    if (!isOwnerSignInConfigured()) {
        return null;
    }
    return <OwnerSignInSettingsInner {...props} />;
}

function OwnerSignInSettingsInner({ theme }: Props) {
    const { webClientId, iosClientId, androidClientId } = getOwnerGoogleClientIds();
    const [session, setSession] = useState<OwnerSession | null>(null);
    const [usage, setUsage] = useState<OwnerUsage | null>(null);
    const [busy, setBusy] = useState(false);
    // One Tap is often suppressed on iOS Safari; then sign in through a popup.
    const [usePopup, setUsePopup] = useState(false);
    const [testing, setTesting] = useState(false);
    const [testResult, setTestResult] = useState<{ ok: boolean; text: string } | null>(null);

    const googleNonce = useMemo(() => randomNonce(), []);
    const [request, , promptAsync] = Google.useAuthRequest({
        webClientId: webClientId!,
        iosClientId,
        androidClientId,
        responseType: 'id_token',
        selectAccount: true,
        extraParams: { nonce: googleNonce },
    });

    const refresh = useCallback(async () => {
        const current = await getOwnerSession();
        setSession(current);
        if (current) {
            setUsage(await fetchOwnerUsage());
        } else {
            setUsage(null);
        }
    }, []);

    useEffect(() => {
        refresh();
    }, [refresh]);

    const signInNative = async () => {
        if (!request) {
            Alert.alert('Not ready', 'Google sign-in is still loading. Try again in a moment.');
            return;
        }
        setBusy(true);
        try {
            const result = await promptAsync();
            if (result.type !== 'success') return;
            const idToken = result.params?.id_token;
            if (!idToken) {
                throw new Error('Google did not return an ID token.');
            }
            await exchangeGoogleIdToken(idToken, googleNonce);
            await refresh();
        } catch (error) {
            Alert.alert('Sign-in failed', error instanceof Error ? error.message : 'Try again.');
        } finally {
            setBusy(false);
        }
    };

    useEffect(() => {
        if (Platform.OS !== 'web') return;
        const pending = takePendingGoogleSignIn();
        if (!pending) return;
        setBusy(true);
        exchangeGoogleIdToken(pending.idToken, pending.nonce)
            .then(refresh)
            .catch((error) => Alert.alert('Sign-in failed', error instanceof Error ? error.message : 'Try again.'))
            .finally(() => setBusy(false));
    }, [refresh]);

    const finishWebSignIn = async (getPayload: () => Promise<GoogleSignInPayload>) => {
        setBusy(true);
        try {
            const { idToken, nonce } = await getPayload();
            await exchangeGoogleIdToken(idToken, nonce);
            await refresh();
        } catch (error) {
            if (error instanceof Error && error.message === 'not-displayed') {
                setUsePopup(true);
                return;
            }
            if (error instanceof Error && error.message === 'cancelled') return;
            Alert.alert('Sign-in failed', error instanceof Error ? error.message : 'Try again.');
        } finally {
            setBusy(false);
        }
    };

    const signInWeb = () => {
        if (!webClientId) {
            Alert.alert('Not configured', 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set in this build.');
            return;
        }
        if (usePopup) {
            // Opened synchronously in the tap handler so Safari allows the popup.
            const pending = signInWithGooglePopup(webClientId);
            finishWebSignIn(() => pending);
            return;
        }
        finishWebSignIn(() => promptGoogleIdTokenWeb(webClientId, randomNonce()));
    };

    const runTest = async () => {
        setTesting(true);
        setTestResult(null);
        try {
            const result = await testOwnerAi();
            const fallback = result.fallbackFrom ? ` (configured ${result.fallbackFrom} was rejected)` : '';
            setTestResult({ ok: true, text: `Working · ${result.model} · ${result.latencyMs} ms${fallback}` });
            setUsage(await fetchOwnerUsage());
        } catch (error) {
            setTestResult({ ok: false, text: error instanceof Error ? error.message : 'Test failed.' });
        } finally {
            setTesting(false);
        }
    };

    const signOut = async () => {
        await clearOwnerSession();
        setSession(null);
        setUsage(null);
    };

    const text = theme.colors.text;

    return (
        <View style={styles.wrap}>
            <Text style={[styles.title, { color: text.primary }]}>Owner sign-in</Text>
            <Text style={[styles.hint, { color: text.secondary }]}>
                For the app owner only. Uses AmpliFood&apos;s server-side OpenRouter key. Everyone else uses bring-your-own-key AI.
            </Text>
            {session ? (
                <>
                    <View style={styles.statusRow}>
                        <Text style={[styles.value, styles.statusText, { color: text.primary }]}>
                            Owner AI: connected as {session.email}
                        </Text>
                        <Pressable
                            onPress={runTest}
                            disabled={testing}
                            style={[styles.testButton, { borderColor: theme.colors.border }]}
                            accessibilityRole="button"
                            accessibilityLabel="Test owner AI"
                        >
                            <Text style={[styles.testText, { color: theme.primary[500] }]}>{testing ? 'Testing…' : 'Test'}</Text>
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
                    {usage ? (
                        <Text style={[styles.hint, { color: text.tertiary }]}>
                            Today: {usage.requests}/{usage.requestLimit} requests · ~
                            {usage.tokens.toLocaleString()}/{usage.tokenLimit.toLocaleString()} estimated tokens
                        </Text>
                    ) : null}
                    <Pressable
                        style={[styles.button, { backgroundColor: theme.colors.surfaceMuted }]}
                        onPress={signOut}
                        disabled={busy}
                        accessibilityRole="button"
                    >
                        <Text style={[styles.buttonText, { color: text.primary }]}>Sign out</Text>
                    </Pressable>
                </>
            ) : (
                <Pressable
                    style={[styles.button, { backgroundColor: theme.primary[500] }]}
                    onPress={Platform.OS === 'web' ? signInWeb : signInNative}
                    disabled={busy || (Platform.OS !== 'web' && !request)}
                    accessibilityRole="button"
                >
                    <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>
                        {busy ? 'Signing in…' : usePopup ? 'Continue with Google' : 'Sign in with Google'}
                    </Text>
                </Pressable>
            )}
        </View>
    );
}

function loadGisScript(): Promise<void> {
    if (typeof document === 'undefined') return Promise.resolve();
    if (document.getElementById('google-gsi')) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.id = 'google-gsi';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Could not load Google sign-in'));
        document.head.appendChild(script);
    });
}

function randomNonce(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

function promptGoogleIdTokenWeb(clientId: string, nonce: string): Promise<GoogleSignInPayload> {
    return loadGisScript().then(
        () =>
            new Promise((resolve, reject) => {
                const google = (window as unknown as { google?: { accounts: { id: { initialize: Function; prompt: Function } } } }).google;
                if (!google?.accounts?.id) {
                    reject(new Error('Google Identity Services unavailable'));
                    return;
                }
                google.accounts.id.initialize({
                    client_id: clientId,
                    nonce,
                    callback: (response: { credential?: string }) => {
                        if (response?.credential) resolve({ idToken: response.credential, nonce });
                        else reject(new Error('No credential returned'));
                    },
                    auto_select: false,
                    cancel_on_tap_outside: true,
                });
                google.accounts.id.prompt((notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => {
                    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                        reject(new Error('not-displayed'));
                    }
                });
            })
    );
}

const styles = StyleSheet.create({
    wrap: { gap: 8 },
    title: { fontSize: 17, fontWeight: '600' },
    hint: { fontSize: 14, lineHeight: 20 },
    value: { fontSize: 15, fontWeight: '500' },
    statusRow: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    statusText: { flex: 1 },
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

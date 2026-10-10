import React, { useCallback, useEffect, useState } from 'react';
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

WebBrowser.maybeCompleteAuthSession();

type Props = {
    theme: ReturnType<typeof import('../theme').getTheme>;
};

const webClientId = process.env.EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID;
const iosClientId = process.env.EXPO_PUBLIC_GOOGLE_IOS_CLIENT_ID;
const androidClientId = process.env.EXPO_PUBLIC_GOOGLE_ANDROID_CLIENT_ID;

export default function OwnerSignInSettings({ theme }: Props) {
    const [session, setSession] = useState<OwnerSession | null>(null);
    const [usage, setUsage] = useState<OwnerUsage | null>(null);
    const [busy, setBusy] = useState(false);

    const [request, , promptAsync] = Google.useAuthRequest({
        webClientId,
        iosClientId,
        androidClientId,
        responseType: 'id_token',
        selectAccount: true,
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
            await exchangeGoogleIdToken(idToken);
            await refresh();
        } catch (error) {
            Alert.alert('Sign-in failed', error instanceof Error ? error.message : 'Try again.');
        } finally {
            setBusy(false);
        }
    };

    const signInWeb = async () => {
        if (!webClientId) {
            Alert.alert('Not configured', 'EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set in this build.');
            return;
        }
        setBusy(true);
        try {
            const idToken = await promptGoogleIdTokenWeb(webClientId);
            await exchangeGoogleIdToken(idToken);
            await refresh();
        } catch (error) {
            if (error instanceof Error && error.message === 'cancelled') return;
            Alert.alert('Sign-in failed', error instanceof Error ? error.message : 'Try again.');
        } finally {
            setBusy(false);
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
                    <Text style={[styles.value, { color: text.primary }]}>{session.email}</Text>
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
                        {busy ? 'Signing in…' : 'Sign in with Google'}
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

function promptGoogleIdTokenWeb(clientId: string): Promise<string> {
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
                    callback: (response: { credential?: string }) => {
                        if (response?.credential) resolve(response.credential);
                        else reject(new Error('No credential returned'));
                    },
                    auto_select: false,
                    cancel_on_tap_outside: true,
                });
                google.accounts.id.prompt((notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => {
                    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                        reject(new Error('cancelled'));
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
    button: {
        marginTop: 4,
        paddingVertical: 12,
        paddingHorizontal: 16,
        borderRadius: 10,
        alignItems: 'center',
    },
    buttonText: { fontSize: 16, fontWeight: '600' },
});

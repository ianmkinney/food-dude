import React, { useCallback, useEffect, useState } from 'react';
import { Platform, Pressable, StyleSheet, Text, View } from 'react-native';
import {
    clearOwnerSession,
    exchangeGoogleIdToken,
    getOwnerSession,
    type OwnerSession,
} from '../../platform/ownerSession';
import { getOwnerGoogleClientIds, isGoogleSignInConfigured } from '../../platform/ownerSignInConfig';
import { signInWithGooglePopup, takePendingGoogleSignIn } from '../../platform/googleWebAuth';
import { autoMigrateLocalPartiesAfterSignIn } from '../../services/partyAutoMigrate';
import { getTheme } from '../../theme';

type Props = {
    theme: ReturnType<typeof getTheme>;
};

/** Desktop header-only Google sign-in / avatar (isolated from mobile header). */
export default function DesktopGoogleSignIn({ theme }: Props) {
    const [session, setSession] = useState<OwnerSession | null>(null);
    const [busy, setBusy] = useState(false);

    const refresh = useCallback(async () => {
        setSession(await getOwnerSession());
    }, []);

    useEffect(() => {
        refresh();
        if (Platform.OS !== 'web') return;
        const pending = takePendingGoogleSignIn();
        if (pending?.idToken) {
            setBusy(true);
            exchangeGoogleIdToken(pending.idToken, pending.nonce)
                .then(() => autoMigrateLocalPartiesAfterSignIn())
                .finally(() => {
                    setBusy(false);
                    refresh();
                });
        }
    }, [refresh]);

    if (!isGoogleSignInConfigured()) return null;

    const signIn = async () => {
        if (busy) return;
        const { webClientId } = getOwnerGoogleClientIds();
        if (!webClientId) return;
        setBusy(true);
        try {
            const payload = await signInWithGooglePopup(webClientId);
            if (payload?.idToken) {
                await exchangeGoogleIdToken(payload.idToken, payload.nonce);
                await autoMigrateLocalPartiesAfterSignIn();
                await refresh();
            }
        } finally {
            setBusy(false);
        }
    };

    const signOut = async () => {
        await clearOwnerSession();
        await refresh();
    };

    const c = theme.colors;

    if (session?.email) {
        const initial = (session.name || session.email || '?').trim().charAt(0).toUpperCase();
        return (
            <Pressable
                onPress={signOut}
                accessibilityRole="button"
                accessibilityLabel={`Signed in as ${session.email}. Sign out`}
                style={({ pressed }) => [
                    styles.chip,
                    {
                        borderColor: c.border,
                        backgroundColor: pressed ? c.surfaceMuted : c.surface,
                    },
                ]}
            >
                <View style={[styles.avatar, { backgroundColor: theme.primary[100] }]}>
                    <Text style={{ color: theme.primary[700], fontWeight: '700' }}>{initial}</Text>
                </View>
                <Text style={[styles.email, { color: c.text.secondary }]} numberOfLines={1}>
                    {session.name || session.email}
                </Text>
            </Pressable>
        );
    }

    return (
        <Pressable
            onPress={signIn}
            disabled={busy}
            accessibilityRole="button"
            accessibilityLabel="Sign in with Google"
            style={({ pressed }) => [
                styles.signIn,
                {
                    borderColor: c.border,
                    backgroundColor: pressed ? c.surfaceMuted : c.surface,
                    opacity: busy ? 0.6 : 1,
                },
            ]}
        >
            <Text style={[styles.signInText, { color: c.text.primary }]}>Sign in with Google</Text>
        </Pressable>
    );
}

const styles = StyleSheet.create({
    signIn: {
        minHeight: 40,
        paddingHorizontal: 14,
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
        alignItems: 'center',
        justifyContent: 'center',
    },
    signInText: {
        fontSize: 14,
        fontWeight: '600',
    },
    chip: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 8,
        maxWidth: 220,
        minHeight: 40,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
    },
    avatar: {
        width: 28,
        height: 28,
        borderRadius: 14,
        alignItems: 'center',
        justifyContent: 'center',
        overflow: 'hidden',
    },
    email: {
        fontSize: 13,
        fontWeight: '500',
        flexShrink: 1,
    },
});

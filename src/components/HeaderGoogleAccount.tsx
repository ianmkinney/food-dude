import React, { useMemo } from 'react';
import { Image, StyleSheet, Text, View } from 'react-native';
import { useNavigation } from '@react-navigation/native';
import { getTheme, motion } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { useGoogleAccount } from '../context/GoogleAccountContext';
import AnimatedPressable from './AnimatedPressable';

function syncDotColor(status: string, theme: ReturnType<typeof getTheme>): string {
    if (status === 'syncing') return theme.primary[500];
    if (status === 'synced') return theme.accent.green;
    if (status === 'error') return theme.colors.error;
    return theme.colors.text.tertiary;
}

function initialFor(session: { name?: string; email?: string } | null): string {
    const source = session?.name?.trim() || session?.email?.trim() || '?';
    return source.charAt(0).toUpperCase();
}

export default function HeaderGoogleAccount({
    tintColor,
    showSignInWhenUnconfigured = false,
}: {
    tintColor?: string;
    /** Desktop shell: show the Sign in pill even when Google client IDs are absent in this build. */
    showSignInWhenUnconfigured?: boolean;
}) {
    const navigation = useNavigation();
    const { isDark } = useTheme();
    const theme = getTheme(isDark);
    const { configured, session, profile, busy, signIn, syncStatus, platformAiAllowed } = useGoogleAccount();

    const color = tintColor || theme.colors.text.primary;
    const picture = profile?.picture || session?.picture;

    const openAccount = () => {
        (navigation as { navigate: (name: string, params?: object) => void }).navigate('Account', {
            scrollToSync: true,
        });
    };

    const dotColor = useMemo(() => syncDotColor(syncStatus, theme), [syncStatus, theme]);

    if (!configured && !showSignInWhenUnconfigured) return null;

    if (!session) {
        const onSignIn = () => {
            if (configured) signIn();
            else openAccount();
        };
        return (
            <AnimatedPressable
                onPress={onSignIn}
                disabled={busy && configured}
                accessibilityRole="button"
                accessibilityLabel="Sign in with Google"
                scaleTo={motion.scale.pressHard}
                style={[styles.pill, { borderColor: theme.colors.border, backgroundColor: theme.colors.surface }]}
            >
                <View style={styles.gBadge} accessibilityElementsHidden>
                    <Text style={styles.gText}>G</Text>
                </View>
                <Text style={[styles.pillText, { color }]} numberOfLines={1}>
                    {busy ? '…' : 'Sign in'}
                </Text>
            </AnimatedPressable>
        );
    }

    return (
        <AnimatedPressable
            onPress={openAccount}
            accessibilityRole="button"
            accessibilityLabel={
                platformAiAllowed
                    ? 'Open account and sync. Platform AI enabled.'
                    : 'Open account and sync'
            }
            scaleTo={motion.scale.pressHard}
            style={[styles.avatarWrap, { borderColor: theme.colors.border }]}
        >
            {picture ? (
                <Image source={{ uri: picture }} style={styles.avatar} />
            ) : (
                <View style={[styles.avatar, styles.initial, { backgroundColor: theme.primary[100] }]}>
                    <Text style={[styles.initialText, { color: theme.primary[600] }]}>{initialFor(session)}</Text>
                </View>
            )}
            <View style={[styles.dot, { backgroundColor: dotColor, borderColor: theme.colors.background }]} />
        </AnimatedPressable>
    );
}

const styles = StyleSheet.create({
    pill: {
        flexDirection: 'row',
        alignItems: 'center',
        gap: 6,
        minHeight: 44,
        minWidth: 44,
        paddingHorizontal: 10,
        borderRadius: 999,
        borderWidth: StyleSheet.hairlineWidth,
        marginRight: 2,
    },
    pillText: { fontSize: 13, fontWeight: '600', maxWidth: 72 },
    gBadge: {
        width: 22,
        height: 22,
        borderRadius: 11,
        backgroundColor: '#FFFFFF',
        alignItems: 'center',
        justifyContent: 'center',
        borderWidth: StyleSheet.hairlineWidth,
        borderColor: '#dadce0',
    },
    gText: { fontSize: 13, fontWeight: '700', color: '#4285F4' },
    avatarWrap: {
        width: 44,
        height: 44,
        alignItems: 'center',
        justifyContent: 'center',
        marginRight: 2,
    },
    avatar: { width: 32, height: 32, borderRadius: 16 },
    initial: { alignItems: 'center', justifyContent: 'center' },
    initialText: { fontSize: 15, fontWeight: '700' },
    dot: {
        position: 'absolute',
        right: 6,
        bottom: 8,
        width: 10,
        height: 10,
        borderRadius: 5,
        borderWidth: 2,
    },
});

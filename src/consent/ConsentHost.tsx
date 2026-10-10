import React, { useEffect, useRef, useState } from 'react';
import { Linking, Modal, Pressable, ScrollView, StyleSheet, Switch, Text, View } from 'react-native';
import { getTheme } from '../theme';
import { useTheme } from '../context/ThemeContext';
import { BrandMark } from '../components/Brand';
import { MINIMUM_AGE, TERMS_VERSION } from '../config/legal';
import {
    PRIVACY_URL,
    TARGETS,
    TERMS_URL,
    acceptLegal,
    getLegalAcceptance,
    registerConsentAsker,
    type ConsentTarget,
} from './consentStore';

/** Asks before any data goes to an AI or voice provider. Mount once near the root. */
export function ConsentHost() {
    const { isDark } = useTheme();
    const theme = getTheme(isDark, undefined, undefined);
    const [target, setTarget] = useState<ConsentTarget | null>(null);
    const resolver = useRef<((ok: boolean) => void) | null>(null);

    useEffect(() => {
        registerConsentAsker(
            (next) =>
                new Promise<boolean>((resolve) => {
                    resolver.current?.(false);
                    resolver.current = resolve;
                    setTarget(next);
                })
        );
        return () => registerConsentAsker(null);
    }, []);

    const answer = (ok: boolean) => {
        resolver.current?.(ok);
        resolver.current = null;
        setTarget(null);
    };

    if (!target) return null;
    const info = TARGETS[target];
    const c = theme.colors;
    return (
        <Modal transparent visible animationType="fade" onRequestClose={() => answer(false)}>
            <View style={[styles.backdrop, { backgroundColor: c.overlay }]}>
                <View style={[styles.card, { backgroundColor: c.surfaceElevated, borderColor: c.border }]} accessibilityViewIsModal>
                    <Text style={[styles.title, { color: c.text.primary, fontFamily: theme.typography.fonts.display }]} accessibilityRole="header">
                        Send to {info.name}?
                    </Text>
                    <Text style={[styles.body, { color: c.text.secondary }]}>
                        To answer, AmpliFood sends {info.sends} to {info.name}
                        , using your own API key. {info.name} handles it under its own privacy policy. Nothing is sent to AmpliFood.
                    </Text>
                    <Text style={[styles.link, { color: theme.primary[700] }]} accessibilityRole="link" onPress={() => Linking.openURL(info.policy)}>
                        {info.name} privacy policy
                    </Text>
                    <Text style={[styles.small, { color: c.text.tertiary }]}>You can turn this off any time in Account → Data sharing.</Text>
                    <View style={styles.buttons}>
                        <Pressable onPress={() => answer(false)} style={[styles.button, { backgroundColor: c.surfaceMuted }]} accessibilityRole="button">
                            <Text style={[styles.buttonText, { color: c.text.primary }]}>Not now</Text>
                        </Pressable>
                        <Pressable onPress={() => answer(true)} style={[styles.button, { backgroundColor: theme.primary[500] }]} accessibilityRole="button">
                            <Text style={[styles.buttonText, { color: '#FFFFFF' }]}>Allow</Text>
                        </Pressable>
                    </View>
                </View>
            </View>
        </Modal>
    );
}

/** First-run gate: the user must agree to the Terms and Privacy Policy (versioned). */
export function LegalGate({ children }: { children: React.ReactNode }) {
    const { isDark } = useTheme();
    const theme = getTheme(isDark, undefined, undefined);
    const [state, setState] = useState<'loading' | 'needed' | 'accepted'>('loading');
    const [agreed, setAgreed] = useState(false);

    useEffect(() => {
        getLegalAcceptance().then((a) => setState(a?.version === TERMS_VERSION ? 'accepted' : 'needed'));
    }, []);

    if (state === 'accepted') return <>{children}</>;
    if (state === 'loading') return <View style={{ flex: 1, backgroundColor: theme.colors.background }} />;

    const c = theme.colors;
    return (
        <ScrollView style={{ backgroundColor: c.background }} contentContainerStyle={styles.gate}>
            <BrandMark size={110} style={null} />
            <Text style={[styles.gateTitle, { color: c.text.primary, fontFamily: theme.typography.fonts.display }]} accessibilityRole="header">
                Welcome to AmpliFood
            </Text>
            <Text style={[styles.body, { color: c.text.secondary, textAlign: 'center' }]}>
                Your recipes, pantry and keys stay on this device. AI features use the AI provider you choose, and we'll ask before anything is sent to one. AI can be wrong, so always check recipes, labels and allergens yourself.
            </Text>
            <View style={styles.agreeRow}>
                <Switch value={agreed} onValueChange={setAgreed} accessibilityLabel="I agree to the Terms of Use and Privacy Policy" />
                <Text style={[styles.body, { color: c.text.primary, flex: 1 }]}>
                    I agree to the{' '}
                    <Text style={[styles.inlineLink, { color: theme.primary[700] }]} accessibilityRole="link" onPress={() => Linking.openURL(TERMS_URL)}>
                        Terms of Use
                    </Text>{' '}
                    and{' '}
                    <Text style={[styles.inlineLink, { color: theme.primary[700] }]} accessibilityRole="link" onPress={() => Linking.openURL(PRIVACY_URL)}>
                        Privacy Policy
                    </Text>
                    .
                </Text>
            </View>
            <Pressable
                disabled={!agreed}
                onPress={async () => {
                    await acceptLegal();
                    setState('accepted');
                }}
                style={[styles.continue, { backgroundColor: theme.primary[500], opacity: agreed ? 1 : 0.45 }]}
                accessibilityRole="button"
                accessibilityState={{ disabled: !agreed }}
            >
                <Text style={styles.continueText}>Continue</Text>
            </Pressable>
            <Text style={[styles.small, { color: c.text.tertiary, textAlign: 'center' }]}>
                You must be at least {MINIMUM_AGE} years old to use AmpliFood.
            </Text>
        </ScrollView>
    );
}

const styles = StyleSheet.create({
    backdrop: { flex: 1, alignItems: 'center', justifyContent: 'center', padding: 22 },
    card: { width: '100%', maxWidth: 420, borderRadius: 20, borderWidth: 1, padding: 22, gap: 12 },
    title: { fontSize: 22 },
    body: { fontSize: 15, lineHeight: 22 },
    link: { fontSize: 15, fontWeight: '700', textDecorationLine: 'underline' },
    small: { fontSize: 13, lineHeight: 18 },
    buttons: { flexDirection: 'row', gap: 10, marginTop: 6 },
    button: { flex: 1, borderRadius: 999, paddingVertical: 12, alignItems: 'center' },
    buttonText: { fontSize: 16, fontWeight: '800' },
    gate: { flexGrow: 1, alignItems: 'center', justifyContent: 'center', padding: 28, gap: 16, maxWidth: 520, width: '100%', alignSelf: 'center' },
    gateTitle: { fontSize: 30, textAlign: 'center' },
    agreeRow: { flexDirection: 'row', alignItems: 'center', gap: 12, marginTop: 6 },
    inlineLink: { fontWeight: '800', textDecorationLine: 'underline' },
    continue: { alignSelf: 'stretch', borderRadius: 999, paddingVertical: 14, alignItems: 'center' },
    continueText: { color: '#FFFFFF', fontSize: 17, fontWeight: '800' },
});

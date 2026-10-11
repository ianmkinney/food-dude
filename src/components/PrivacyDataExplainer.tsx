import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PRIVACY_URL } from '../consent/consentStore';

type Theme = ReturnType<typeof import('../theme').getTheme>;

type Props = {
    theme: Theme;
    variant?: 'intro' | 'account';
};

const PARTY_COPY =
    'When you sign in with Google, AmpliFood can store encrypted copies of your kitchen data (recipes, lists, chat, and memories) so Safari and Chrome stay in sync. Parties and optional manual backups are also stored online. API keys never leave your device.';

/** Plain-language explainer: local storage vs what leaves the device for AI/voice. */
export default function PrivacyDataExplainer({ theme, variant = 'account' }: Props) {
    const c = theme.colors;
    const compact = variant === 'intro';

    return (
        <View style={compact ? undefined : styles.root}>
            {!compact && (
                <View style={styles.header}>
                    <Ionicons name="phone-portrait-outline" size={22} color={theme.primary[500]} accessible={false} />
                    <Text style={[styles.title, { color: c.text.primary }]} accessibilityRole="header">
                        Privacy & data
                    </Text>
                </View>
            )}
            {compact ? (
                <Text style={[styles.lead, { color: c.text.primary }]} accessibilityRole="header">
                    Your keys stay on your device
                </Text>
            ) : null}
            <Text style={[styles.body, { color: c.text.secondary }]}>
                Recipes, meal plans, pantry and grocery lists, and Ampi chat history live in local SQLite (browser storage on
                web). API keys stay in the OS keychain or browser storage and are never uploaded. When you sign in with Google,
                encrypted sync and parties may store kitchen data on our server; you can turn sync off in Account.
            </Text>
            <Text style={[styles.body, { color: c.text.secondary }]}>{PARTY_COPY}</Text>
            <Text style={[styles.body, { color: c.text.secondary }]}>
                When you message Ampi, your text (and anything you attach) is sent to the AI provider you chose to generate a
                reply. Optional ElevenLabs voice sends reply text to ElevenLabs (your own key on device, or platform voice
                when your Google account is allowlisted for platform AI) from Account → Voice.
            </Text>
            {!compact && (
                <Pressable
                    onPress={() => Linking.openURL(PRIVACY_URL)}
                    style={[styles.linkBtn, { borderColor: c.border }]}
                    accessibilityRole="link"
                >
                    <Text style={{ color: theme.link }}>Read the full Privacy Policy</Text>
                </Pressable>
            )}
        </View>
    );
}

const styles = StyleSheet.create({
    root: { gap: 4 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8, marginBottom: 8 },
    title: { fontSize: 18, fontWeight: '600', flex: 1 },
    lead: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
    body: { fontSize: 14, lineHeight: 20, marginBottom: 8 },
    linkBtn: {
        marginTop: 4,
        paddingVertical: 10,
        paddingHorizontal: 14,
        borderWidth: 1,
        borderRadius: 10,
        alignSelf: 'flex-start',
    },
});

import React from 'react';
import { Linking, Pressable, StyleSheet, Text, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import { PRIVACY_URL } from '../consent/consentStore';

type Theme = ReturnType<typeof import('../theme').getTheme>;

type Props = {
    theme: Theme;
    variant?: 'intro' | 'account';
};

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
                    Your data stays on your device
                </Text>
            ) : null}
            <Text style={[styles.body, { color: c.text.secondary }]}>
                Recipes, meal plans, pantry and grocery lists, AI chat history, memory, and API keys are stored locally on
                this device (SQLite in the app; browser storage on web). They are not uploaded to AmpliFood and nothing is
                sold.
            </Text>
            <Text style={[styles.body, { color: c.text.secondary }]}>
                When you message Ampi, your text (and anything you attach) is sent to the AI provider you chose to generate a
                reply. Optional ElevenLabs voice sends reply text to ElevenLabs under your own account when you add a key in
                Account → Voice.
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

import React, { useEffect, useState } from 'react';
import { Alert, Pressable, StyleSheet, Text, TextInput, View } from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import {
    DEFAULT_ELEVENLABS_VOICE_ID,
    clearElevenLabsKey,
    getVoiceSettings,
    saveElevenLabsKey,
    setVoiceId,
} from '../voice/voiceSettings';
import { getSpeechEngine } from '../voice/speech';

type Theme = ReturnType<typeof import('../theme').getTheme>;

export default function VoiceSettings({ theme }: { theme: Theme }) {
    const [hasKey, setHasKey] = useState(false);
    const [keyInput, setKeyInput] = useState('');
    const [voice, setVoice] = useState(DEFAULT_ELEVENLABS_VOICE_ID);

    useEffect(() => {
        getVoiceSettings().then((s) => {
            setHasKey(s.hasElevenLabsKey);
            setVoice(s.voiceId);
        });
    }, []);

    const c = theme.colors;

    const save = async () => {
        if (!keyInput.trim()) return;
        await saveElevenLabsKey(keyInput);
        await setVoiceId(voice);
        setKeyInput('');
        setHasKey(true);
        Alert.alert('Voice saved', 'Sous will speak with your ElevenLabs voice.');
    };

    const clear = async () => {
        await clearElevenLabsKey();
        setHasKey(false);
    };

    const test = async () => {
        try {
            const engine = await getSpeechEngine();
            await engine.speak("Hi, I'm Sous, your sous chef. What are we cooking?");
        } catch (error) {
            Alert.alert('Voice', (error as Error)?.message || "Couldn't play the voice.");
        }
    };

    return (
        <View style={styles.root}>
            <View style={styles.header}>
                <Ionicons name="mic-outline" size={22} color={theme.primary[500]} />
                <Text style={[styles.title, { color: c.text.primary }]}>Sous voice</Text>
            </View>
            <Text style={[styles.body, { color: c.text.secondary }]}>
                {hasKey
                    ? 'Using your ElevenLabs key. Replies you choose to hear are sent to ElevenLabs as text, billed to your ElevenLabs account.'
                    : "Sous reads replies with your device's built-in voice for free. Add your own ElevenLabs key for a more natural voice."}
            </Text>
            <TextInput accessibilityLabel="ElevenLabs API key"
                value={keyInput}
                onChangeText={setKeyInput}
                placeholder={hasKey ? 'Paste a new ElevenLabs key to replace' : 'Paste ElevenLabs API key'}
                placeholderTextColor={c.text.tertiary}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { color: c.text.primary, borderColor: c.border, backgroundColor: c.surface }]}
            />
            <TextInput accessibilityLabel="Voice ID"
                value={voice}
                onChangeText={setVoice}
                onEndEditing={() => setVoiceId(voice)}
                placeholder="Voice ID"
                placeholderTextColor={c.text.tertiary}
                autoCapitalize="none"
                autoCorrect={false}
                style={[styles.input, { color: c.text.primary, borderColor: c.border, backgroundColor: c.surface }]}
            />
            <View style={styles.row}>
                <Pressable onPress={save} style={[styles.button, { backgroundColor: theme.primary[500] }]}>
                    <Text style={styles.buttonText}>Save key</Text>
                </Pressable>
                {hasKey && (
                    <Pressable onPress={clear} style={[styles.button, styles.outline, { borderColor: c.border }]}>
                        <Text style={[styles.buttonText, { color: c.text.primary }]}>Clear</Text>
                    </Pressable>
                )}
                <Pressable onPress={test} style={[styles.button, styles.outline, { borderColor: c.border }]}>
                    <Text style={[styles.buttonText, { color: c.text.primary }]}>Test voice</Text>
                </Pressable>
            </View>
        </View>
    );
}

const styles = StyleSheet.create({
    root: { gap: 10 },
    header: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    title: { fontSize: 17, fontWeight: '800' },
    body: { fontSize: 14, lineHeight: 20 },
    input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
    row: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    button: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
    outline: { borderWidth: 1 },
    buttonText: { color: '#FFFFFF', fontWeight: '800' },
});

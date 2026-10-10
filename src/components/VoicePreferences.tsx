import React, { useCallback, useEffect, useState } from 'react';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import ThemedSwitch from './ThemedSwitch';
import { ASSISTANT_NAME } from '../config/assistant';

type Theme = ReturnType<typeof import('../theme').getTheme>;
import { getSpeechEngine, primeSpeechOnWeb, shouldSpeak } from '../voice/speech';
import { getVoiceSettings, setAutoSpeak, setVoiceMuted } from '../voice/voiceSettings';

/** On-device voice: read replies aloud and mute. */
export default function VoicePreferences({ theme }: { theme: Theme }) {
    const c = theme.colors;
    const [autoSpeak, setAutoSpeakState] = useState(false);
    const [muted, setMuted] = useState(false);

    const load = useCallback(() => {
        getVoiceSettings().then((s) => {
            setAutoSpeakState(s.autoSpeak);
            setMuted(s.muted);
        });
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    const preview = async () => {
        primeSpeechOnWeb();
        if (!(await shouldSpeak())) {
            return;
        }
        const engine = await getSpeechEngine();
        await engine.speak(`Hi, I'm ${ASSISTANT_NAME}. What are we cooking?`);
    };

    return (
        <View>
            <Text style={[styles.title, { color: c.text.primary }]} accessibilityRole="header">
                {ASSISTANT_NAME} voice
            </Text>
            <Text style={[styles.body, { color: c.text.secondary }]}>
                Replies use your phone&apos;s built-in text-to-speech. Every reply is also shown as text.
            </Text>
            <View style={styles.row}>
                <Text style={[styles.rowText, { color: c.text.primary }]}>Read replies aloud</Text>
                <ThemedSwitch
                    value={autoSpeak}
                    onValueChange={async (v) => {
                        if (v) primeSpeechOnWeb();
                        setAutoSpeakState(v);
                        await setAutoSpeak(v);
                    }}
                    accessibilityLabel={`Read ${ASSISTANT_NAME} replies aloud`}
                />
            </View>
            <View style={styles.row}>
                <Text style={[styles.rowText, { color: c.text.primary }]}>Mute voice</Text>
                <ThemedSwitch
                    value={muted}
                    onValueChange={async (v) => {
                        setMuted(v);
                        await setVoiceMuted(v);
                    }}
                    accessibilityLabel={`Mute ${ASSISTANT_NAME}'s voice`}
                />
            </View>
            <Pressable onPress={preview} style={[styles.button, { borderColor: c.border }]} accessibilityRole="button">
                <Text style={{ color: c.text.primary }}>Preview voice</Text>
            </Pressable>
        </View>
    );
}

const styles = StyleSheet.create({
    title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
    body: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 },
    rowText: { fontSize: 16, flex: 1, marginRight: 12 },
    button: { marginTop: 8, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderRadius: 10, alignSelf: 'flex-start' },
});

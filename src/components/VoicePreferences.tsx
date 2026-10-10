import React, { useCallback, useEffect, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import ThemedSwitch from './ThemedSwitch';
import { ASSISTANT_NAME } from '../config/assistant';

type Theme = ReturnType<typeof import('../theme').getTheme>;
import { getSpeechEngine, primeSpeechOnWeb, shouldSpeak } from '../voice/speech';
import { getVoiceSettings, setAutoSpeak, setVoiceMuted } from '../voice/voiceSettings';
import {
    clearElevenLabsApiKey,
    getElevenLabsConfig,
    listElevenLabsVoices,
    maskElevenLabsKey,
    saveElevenLabsApiKey,
    setElevenLabsVoice,
    type ElevenLabsVoice,
} from '../voice/elevenLabsSettings';

/** On-device voice plus optional ElevenLabs BYOK for Ampi replies. */
export default function VoicePreferences({ theme }: { theme: Theme }) {
    const c = theme.colors;
    const [autoSpeak, setAutoSpeakState] = useState(false);
    const [muted, setMuted] = useState(false);
    const [elKeySaved, setElKeySaved] = useState(false);
    const [elKeyLast4, setElKeyLast4] = useState('');
    const [elKeyDraft, setElKeyDraft] = useState('');
    const [showElKey, setShowElKey] = useState(false);
    const [voices, setVoices] = useState<ElevenLabsVoice[]>([]);
    const [voiceId, setVoiceId] = useState<string | null>(null);
    const [voiceName, setVoiceName] = useState<string | null>(null);
    const [loadingVoices, setLoadingVoices] = useState(false);
    const [elStatus, setElStatus] = useState('');

    const load = useCallback(() => {
        getVoiceSettings().then((s) => {
            setAutoSpeakState(s.autoSpeak);
            setMuted(s.muted);
        });
        getElevenLabsConfig().then((cfg) => {
            setElKeySaved(Boolean(cfg.apiKey));
            setElKeyLast4(maskElevenLabsKey(cfg.apiKey));
            setVoiceId(cfg.voiceId);
            setVoiceName(cfg.voiceName);
        });
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (elKeySaved) {
            refreshVoices();
        }
    }, [elKeySaved]);

    const refreshVoices = async (apiKey?: string) => {
        const key = apiKey ?? (await getElevenLabsConfig()).apiKey;
        if (!key) return;
        setLoadingVoices(true);
        setElStatus('');
        try {
            const list = await listElevenLabsVoices(key);
            setVoices(list);
            if (list.length && !list.some((v) => v.voice_id === voiceId)) {
                await setElevenLabsVoice(list[0].voice_id, list[0].name);
                setVoiceId(list[0].voice_id);
                setVoiceName(list[0].name);
            }
        } catch (error) {
            setElStatus((error as Error).message || 'Could not load voices.');
        } finally {
            setLoadingVoices(false);
        }
    };

    const saveElevenKey = async () => {
        try {
            await saveElevenLabsApiKey(elKeyDraft);
            setElKeyDraft('');
            setElKeySaved(true);
            const cfg = await getElevenLabsConfig();
            setElKeyLast4(maskElevenLabsKey(cfg.apiKey));
            setElStatus('Key saved on this device.');
            await refreshVoices(cfg.apiKey!);
        } catch (error) {
            setElStatus((error as Error).message || 'Could not save key.');
        }
    };

    const removeElevenKey = async () => {
        await clearElevenLabsApiKey();
        setElKeySaved(false);
        setElKeyLast4('');
        setElKeyDraft('');
        setVoices([]);
        setVoiceId(null);
        setVoiceName(null);
        setElStatus('ElevenLabs key removed.');
        load();
    };

    const preview = async () => {
        primeSpeechOnWeb();
        if (!(await shouldSpeak())) {
            return;
        }
        const engine = await getSpeechEngine();
        await engine.speak(`Hi, I'm ${ASSISTANT_NAME}. What are we cooking?`);
    };

    const testEleven = async () => {
        primeSpeechOnWeb();
        if (!(await shouldSpeak())) return;
        const engine = await getSpeechEngine();
        await engine.speak(`This is ${ASSISTANT_NAME} using your ElevenLabs voice.`);
    };

    return (
        <View>
            <Text style={[styles.title, { color: c.text.primary }]} accessibilityRole="header">
                {ASSISTANT_NAME} voice
            </Text>
            <Text style={[styles.body, { color: c.text.secondary }]}>
                By default, replies use your phone or browser built-in text-to-speech. Every reply is also shown as text.
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

            <View style={[styles.divider, { borderColor: c.border }]} />
            <Text style={[styles.subtitle, { color: c.text.primary }]}>ElevenLabs (optional)</Text>
            <Text style={[styles.body, { color: c.text.secondary }]}>
                Paste your own ElevenLabs API key to use a premium voice. The key stays on this device only and is never
                sent to AmpliFood. Reply text is sent to ElevenLabs under your account when Ampi speaks aloud.
            </Text>
            {elKeySaved ? (
                <Text style={[styles.body, { color: c.text.primary }]}>Saved on this device {elKeyLast4}</Text>
            ) : (
                <Text style={[styles.body, { color: c.text.secondary }]}>No ElevenLabs key — using built-in voice.</Text>
            )}
            {Platform.OS === 'web' ? (
                <form
                    style={StyleSheet.flatten([styles.keyRow, { borderColor: c.border }])}
                    onSubmit={(e) => {
                        e.preventDefault();
                        saveElevenKey();
                    }}
                >
                    <TextInput
                        accessibilityLabel="ElevenLabs API key"
                        style={[styles.keyInput, { color: c.text.primary }]}
                        value={elKeyDraft}
                        onChangeText={setElKeyDraft}
                        placeholder={elKeySaved ? 'Paste a new key to replace' : 'Paste ElevenLabs API key'}
                        placeholderTextColor={c.text.tertiary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry={!showElKey}
                    />
                    <TouchableOpacity onPress={() => setShowElKey((v) => !v)} accessibilityRole="button">
                        <Text style={{ color: c.text.secondary }}>{showElKey ? 'Hide' : 'Show'}</Text>
                    </TouchableOpacity>
                </form>
            ) : (
                <View style={[styles.keyRow, { borderColor: c.border }]}>
                    <TextInput
                        accessibilityLabel="ElevenLabs API key"
                        style={[styles.keyInput, { color: c.text.primary }]}
                        value={elKeyDraft}
                        onChangeText={setElKeyDraft}
                        placeholder={elKeySaved ? 'Paste a new key to replace' : 'Paste ElevenLabs API key'}
                        placeholderTextColor={c.text.tertiary}
                        autoCapitalize="none"
                        autoCorrect={false}
                        secureTextEntry={!showElKey}
                    />
                    <TouchableOpacity onPress={() => setShowElKey((v) => !v)} accessibilityRole="button">
                        <Text style={{ color: c.text.secondary }}>{showElKey ? 'Hide' : 'Show'}</Text>
                    </TouchableOpacity>
                </View>
            )}
            <View style={styles.btnRow}>
                <Pressable onPress={saveElevenKey} style={[styles.button, { borderColor: c.border }]} accessibilityRole="button">
                    <Text style={{ color: c.text.primary }}>Save key</Text>
                </Pressable>
                {elKeySaved ? (
                    <Pressable onPress={removeElevenKey} style={[styles.button, { borderColor: c.border }]} accessibilityRole="button">
                        <Text style={{ color: c.error }}>Remove key</Text>
                    </Pressable>
                ) : null}
            </View>
            {loadingVoices ? <ActivityIndicator style={{ marginVertical: 8 }} /> : null}
            {voices.length > 0 ? (
                <View style={styles.voiceList}>
                    <Text style={[styles.label, { color: c.text.secondary }]}>Voice</Text>
                    {voices.slice(0, 12).map((v) => {
                        const selected = v.voice_id === voiceId;
                        return (
                            <Pressable
                                key={v.voice_id}
                                onPress={async () => {
                                    await setElevenLabsVoice(v.voice_id, v.name);
                                    setVoiceId(v.voice_id);
                                    setVoiceName(v.name);
                                }}
                                style={[
                                    styles.voiceChip,
                                    {
                                        borderColor: selected ? theme.primary[500] : c.border,
                                        backgroundColor: selected ? theme.primary[500] : c.surface,
                                    },
                                ]}
                                accessibilityRole="button"
                                accessibilityState={{ selected }}
                            >
                                <Text style={{ color: selected ? '#fff' : c.text.primary }}>{v.name}</Text>
                            </Pressable>
                        );
                    })}
                </View>
            ) : elKeySaved ? (
                <Pressable onPress={() => refreshVoices()} style={[styles.button, { borderColor: c.border }]} accessibilityRole="button">
                    <Text style={{ color: c.text.primary }}>Load voices</Text>
                </Pressable>
            ) : null}
            {voiceName ? (
                <Text style={[styles.body, { color: c.text.secondary }]}>Selected: {voiceName}</Text>
            ) : null}
            <Pressable
                onPress={testEleven}
                disabled={!elKeySaved || !voiceId}
                style={[styles.button, { borderColor: c.border, opacity: elKeySaved && voiceId ? 1 : 0.5 }]}
                accessibilityRole="button"
            >
                <Text style={{ color: c.text.primary }}>Test voice</Text>
            </Pressable>
            {elStatus ? <Text style={[styles.body, { color: c.text.tertiary }]}>{elStatus}</Text> : null}
        </View>
    );
}

const styles = StyleSheet.create({
    title: { fontSize: 18, fontWeight: '600', marginBottom: 8 },
    subtitle: { fontSize: 16, fontWeight: '600', marginBottom: 8 },
    body: { fontSize: 14, lineHeight: 20, marginBottom: 12 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginVertical: 8 },
    rowText: { fontSize: 16, flex: 1, marginRight: 12 },
    button: { marginTop: 8, paddingVertical: 10, paddingHorizontal: 14, borderWidth: 1, borderRadius: 10, alignSelf: 'flex-start' },
    divider: { borderTopWidth: 1, marginVertical: 16 },
    keyRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderWidth: 1,
        borderRadius: 10,
        paddingHorizontal: 12,
        marginBottom: 8,
    },
    keyInput: { flex: 1, fontSize: 16, paddingVertical: 10 },
    btnRow: { flexDirection: 'row', flexWrap: 'wrap', gap: 8 },
    voiceList: { marginTop: 8, gap: 8 },
    label: { fontSize: 13, fontWeight: '600', marginBottom: 4 },
    voiceChip: { paddingVertical: 8, paddingHorizontal: 12, borderWidth: 1, borderRadius: 10, marginBottom: 6 },
});

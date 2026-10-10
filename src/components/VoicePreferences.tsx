import React, { useCallback, useEffect, useRef, useState } from 'react';
import {
    ActivityIndicator,
    Platform,
    Pressable,
    ScrollView,
    StyleSheet,
    Text,
    TextInput,
    TouchableOpacity,
    View,
} from 'react-native';
import { Ionicons } from '@expo/vector-icons';
import ThemedSwitch from './ThemedSwitch';
import { ASSISTANT_NAME } from '../config/assistant';

type Theme = ReturnType<typeof import('../theme').getTheme>;
import { getSpeechEngine, primeSpeechOnWeb, shouldSpeak } from '../voice/speech';
import { getVoiceSettings, setAutoSpeak, setVoiceMuted } from '../voice/voiceSettings';
import { playElevenLabsAudio, stopElevenLabsPlayback } from '../voice/elevenLabsPlayback';
import {
    clearElevenLabsApiKey,
    ElevenLabsVoicesError,
    getElevenLabsConfig,
    listElevenLabsVoices,
    maskElevenLabsKey,
    saveElevenLabsApiKey,
    setElevenLabsVoice,
    type ElevenLabsVoice,
} from '../voice/elevenLabsSettings';

function voiceSubtitle(v: ElevenLabsVoice): string | null {
    if (!v.category) return null;
    const cat = v.category.replace(/_/g, ' ');
    if (cat === 'cloned' || cat === 'generated' || cat === 'professional') return cat;
    return cat;
}

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
    const [voicesLoaded, setVoicesLoaded] = useState(false);
    const [voiceId, setVoiceId] = useState<string | null>(null);
    const [voiceName, setVoiceName] = useState<string | null>(null);
    const [loadingVoices, setLoadingVoices] = useState(false);
    const [previewingId, setPreviewingId] = useState<string | null>(null);
    const [elStatus, setElStatus] = useState('');
    const selectedVoiceIdRef = useRef<string | null>(null);

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
            selectedVoiceIdRef.current = cfg.voiceId;
        });
    }, []);

    const refreshVoices = useCallback(async (apiKey?: string) => {
        const key = apiKey ?? (await getElevenLabsConfig()).apiKey;
        if (!key) return;
        setLoadingVoices(true);
        setElStatus('');
        try {
            const list = await listElevenLabsVoices(key);
            setVoices(list);
            setVoicesLoaded(true);
            const current = selectedVoiceIdRef.current;
            if (!list.length) {
                setElStatus('No voices in this ElevenLabs account yet. Create or clone a voice on elevenlabs.io, then tap Refresh.');
                return;
            }
            if (!current || !list.some((v) => v.voice_id === current)) {
                const first = list[0];
                await setElevenLabsVoice(first.voice_id, first.name);
                selectedVoiceIdRef.current = first.voice_id;
                setVoiceId(first.voice_id);
                setVoiceName(first.name);
            }
        } catch (error) {
            setVoices([]);
            setVoicesLoaded(true);
            if (error instanceof ElevenLabsVoicesError) {
                setElStatus(error.message);
            } else {
                setElStatus((error as Error).message || 'Could not load voices.');
            }
        } finally {
            setLoadingVoices(false);
        }
    }, []);

    useEffect(() => {
        load();
    }, [load]);

    useEffect(() => {
        if (elKeySaved) {
            refreshVoices();
        }
    }, [elKeySaved, refreshVoices]);

    const saveElevenKey = async () => {
        try {
            await saveElevenLabsApiKey(elKeyDraft);
            setElKeyDraft('');
            setElKeySaved(true);
            setVoicesLoaded(false);
            const cfg = await getElevenLabsConfig();
            setElKeyLast4(maskElevenLabsKey(cfg.apiKey));
            setElStatus('Key saved on this device.');
            await refreshVoices(cfg.apiKey!);
        } catch (error) {
            setElStatus((error as Error).message || 'Could not save key.');
        }
    };

    const removeElevenKey = async () => {
        stopElevenLabsPlayback();
        await clearElevenLabsApiKey();
        setElKeySaved(false);
        setElKeyLast4('');
        setElKeyDraft('');
        setVoices([]);
        setVoicesLoaded(false);
        setVoiceId(null);
        setVoiceName(null);
        selectedVoiceIdRef.current = null;
        setElStatus('ElevenLabs key removed.');
        load();
    };

    const selectVoice = async (v: ElevenLabsVoice) => {
        await setElevenLabsVoice(v.voice_id, v.name);
        selectedVoiceIdRef.current = v.voice_id;
        setVoiceId(v.voice_id);
        setVoiceName(v.name);
        setElStatus(`Using ${v.name} for ${ASSISTANT_NAME}.`);
    };

    const playPreview = async (v: ElevenLabsVoice) => {
        if (!v.preview_url) {
            setElStatus(`No preview clip for ${v.name}. Use Test voice after selecting it.`);
            return;
        }
        primeSpeechOnWeb();
        setPreviewingId(v.voice_id);
        try {
            stopElevenLabsPlayback();
            await playElevenLabsAudio(v.preview_url, 20_000);
        } catch {
            setElStatus('Could not play preview. Try Refresh or Test voice.');
        } finally {
            setPreviewingId(null);
        }
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

            {elKeySaved ? (
                <View style={styles.voiceSection}>
                    <View style={styles.voiceSectionHeader}>
                        <Text style={[styles.label, { color: c.text.secondary }]}>Voices in your account</Text>
                        <Pressable
                            onPress={() => refreshVoices()}
                            disabled={loadingVoices}
                            style={[styles.refreshBtn, { borderColor: c.border, opacity: loadingVoices ? 0.6 : 1 }]}
                            accessibilityRole="button"
                            accessibilityLabel="Refresh voice list from ElevenLabs"
                        >
                            {loadingVoices ? (
                                <ActivityIndicator size="small" />
                            ) : (
                                <>
                                    <Ionicons name="refresh-outline" size={16} color={c.text.primary} />
                                    <Text style={{ color: c.text.primary, marginLeft: 4 }}>Refresh</Text>
                                </>
                            )}
                        </Pressable>
                    </View>
                    {voices.length > 0 ? (
                        <ScrollView style={[styles.voiceScroll, { borderColor: c.border }]} nestedScrollEnabled>
                            {voices.map((v) => {
                                const selected = v.voice_id === voiceId;
                                const subtitle = voiceSubtitle(v);
                                return (
                                    <View
                                        key={v.voice_id}
                                        style={[styles.voiceRow, { borderColor: c.border, backgroundColor: selected ? c.surfaceMuted : c.surface }]}
                                    >
                                        <Pressable
                                            onPress={() => selectVoice(v)}
                                            style={styles.voiceMain}
                                            accessibilityRole="button"
                                            accessibilityState={{ selected }}
                                            accessibilityLabel={`Select voice ${v.name}`}
                                        >
                                            <Ionicons
                                                name={selected ? 'checkmark-circle' : 'ellipse-outline'}
                                                size={20}
                                                color={selected ? theme.primary[500] : c.text.tertiary}
                                            />
                                            <View style={styles.voiceTextCol}>
                                                <Text style={[styles.voiceName, { color: c.text.primary }]} numberOfLines={1}>
                                                    {v.name}
                                                </Text>
                                                {subtitle ? (
                                                    <Text style={[styles.voiceMeta, { color: c.text.tertiary }]} numberOfLines={1}>
                                                        {subtitle}
                                                    </Text>
                                                ) : null}
                                            </View>
                                        </Pressable>
                                        <Pressable
                                            onPress={() => playPreview(v)}
                                            disabled={!v.preview_url || previewingId === v.voice_id}
                                            style={[styles.previewBtn, { borderColor: c.border, opacity: v.preview_url ? 1 : 0.4 }]}
                                            accessibilityRole="button"
                                            accessibilityLabel={`Play preview for ${v.name}`}
                                        >
                                            {previewingId === v.voice_id ? (
                                                <ActivityIndicator size="small" />
                                            ) : (
                                                <Ionicons name="play-outline" size={18} color={c.text.primary} />
                                            )}
                                        </Pressable>
                                    </View>
                                );
                            })}
                        </ScrollView>
                    ) : voicesLoaded && !loadingVoices ? (
                        <Text style={[styles.body, { color: c.text.secondary }]}>
                            No voices to show. Check your key or tap Refresh.
                        </Text>
                    ) : null}
                </View>
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
    voiceSection: { marginTop: 8 },
    voiceSectionHeader: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', marginBottom: 8 },
    label: { fontSize: 13, fontWeight: '600' },
    refreshBtn: {
        flexDirection: 'row',
        alignItems: 'center',
        paddingVertical: 6,
        paddingHorizontal: 10,
        borderWidth: 1,
        borderRadius: 8,
    },
    voiceScroll: { maxHeight: 280, borderWidth: 1, borderRadius: 12 },
    voiceRow: {
        flexDirection: 'row',
        alignItems: 'center',
        borderBottomWidth: StyleSheet.hairlineWidth,
        paddingVertical: 8,
        paddingHorizontal: 10,
    },
    voiceMain: { flex: 1, flexDirection: 'row', alignItems: 'center', gap: 10, minWidth: 0 },
    voiceTextCol: { flex: 1, minWidth: 0 },
    voiceName: { fontSize: 15, fontWeight: '600' },
    voiceMeta: { fontSize: 12, marginTop: 2, textTransform: 'capitalize' },
    previewBtn: {
        marginLeft: 8,
        width: 40,
        height: 40,
        borderRadius: 20,
        borderWidth: 1,
        alignItems: 'center',
        justifyContent: 'center',
    },
});

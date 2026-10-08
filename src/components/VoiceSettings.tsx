import React, { useCallback, useState } from 'react';
import { Alert, Pressable, StyleSheet, Switch, Text, TextInput, View } from 'react-native';
import { useFocusEffect } from '@react-navigation/native';
import { Ionicons } from '@expo/vector-icons';
import {
    DEFAULT_ELEVENLABS_VOICE_ID,
    clearElevenLabsKey,
    getVoiceSettings,
    saveElevenLabsKey,
    setVoiceChoice,
    setVoiceId,
    setVoiceMuted,
    type VoiceChoice,
} from '../voice/voiceSettings';
import { getPremiumVoiceAccess } from '../voice/premiumAccess';
import { PREMIUM_PREVIEW_CAPTION, getSpeechEngine, playPremiumPreview, shouldSpeak } from '../voice/speech';

type Theme = ReturnType<typeof import('../theme').getTheme>;

/** Voice picker: Phone voice (default, free) / Premium Sous voice (Plus, or your own ElevenLabs key). */
export default function VoiceSettings({ theme }: { theme: Theme }) {
    const [choice, setChoice] = useState<VoiceChoice>('phone');
    const [muted, setMuted] = useState(false);
    const [hasKey, setHasKey] = useState(false);
    const [access, setAccess] = useState<'byok' | 'plus' | null>(null);
    const [keyInput, setKeyInput] = useState('');
    const [voice, setVoice] = useState(DEFAULT_ELEVENLABS_VOICE_ID);
    const [previewNote, setPreviewNote] = useState<string | null>(null);

    const load = useCallback(() => {
        getVoiceSettings().then((s) => {
            setChoice(s.choice);
            setMuted(s.muted);
            setHasKey(s.hasElevenLabsKey);
            setVoice(s.voiceId);
        });
        getPremiumVoiceAccess().then((a) => setAccess(a.via));
    }, []);
    useFocusEffect(load);

    const c = theme.colors;

    const pick = async (next: VoiceChoice) => {
        setChoice(next);
        await setVoiceChoice(next);
    };

    const saveKey = async () => {
        if (!keyInput.trim()) return;
        await saveElevenLabsKey(keyInput);
        await setVoiceId(voice);
        setKeyInput('');
        load();
    };

    const preview = async () => {
        const outcome = await playPremiumPreview();
        setPreviewNote(
            outcome === 'not_recorded'
                ? "The preview clip hasn't been recorded yet."
                : outcome === 'silenced'
                  ? 'Voice is muted or a screen reader is on, so the preview is shown as text only.'
                  : null
        );
    };

    const test = async () => {
        if (!(await shouldSpeak())) {
            Alert.alert('Voice is off', 'Unmute Sous, or turn off your screen reader, to hear the voice.');
            return;
        }
        const engine = await getSpeechEngine((message) => Alert.alert('Premium Sous voice', message));
        await engine.speak("Hi, I'm Sous, your AI sous chef. What are we cooking?");
    };

    const Option = ({ value, title, detail }: { value: VoiceChoice; title: string; detail: string }) => {
        const selected = choice === value;
        return (
            <Pressable
                onPress={() => pick(value)}
                style={[styles.option, { borderColor: selected ? theme.primary[500] : c.border, backgroundColor: selected ? theme.primary[50] : c.surface }]}
                accessibilityRole="radio"
                accessibilityState={{ checked: selected }}
                accessibilityLabel={`${title}. ${detail}`}
            >
                <Ionicons name={selected ? 'radio-button-on' : 'radio-button-off'} size={20} color={selected ? theme.primary[500] : c.text.tertiary} />
                <View style={{ flex: 1 }}>
                    <Text style={[styles.optionTitle, { color: c.text.primary }]}>{title}</Text>
                    <Text style={[styles.body, { color: c.text.secondary }]}>{detail}</Text>
                </View>
            </Pressable>
        );
    };

    const premiumStatus =
        access === 'byok'
            ? 'Unlocked with your ElevenLabs key (billed to your ElevenLabs account).'
            : access === 'plus'
              ? 'Included with AmpliFood Plus.'
              : 'Needs AmpliFood Plus, or your own ElevenLabs key. Until then Sous uses your phone voice.';

    return (
        <View style={styles.root}>
            <View style={styles.header}>
                <Ionicons name="volume-high-outline" size={22} color={theme.primary[500]} accessible={false} />
                <Text style={[styles.title, { color: c.text.primary }]} accessibilityRole="header">Sous voice</Text>
                <Text style={[styles.tag, { color: c.text.secondary, borderColor: c.border }]}>AI voice</Text>
            </View>
            <View accessibilityRole="radiogroup" style={{ gap: 8 }}>
                <Option value="phone" title="Phone voice (default)" detail="Free. Uses your device's built-in voice; nothing leaves your phone." />
                <Option value="premium" title="Premium Sous voice (Plus)" detail={premiumStatus} />
            </View>

            <View style={[styles.row, { borderColor: c.border }]}>
                <Text style={[styles.rowText, { color: c.text.primary }]}>Mute Sous's voice</Text>
                <Switch
                    value={muted}
                    onValueChange={async (v) => {
                        setMuted(v);
                        await setVoiceMuted(v);
                    }}
                    accessibilityLabel="Mute Sous's voice"
                />
            </View>
            <Text style={[styles.small, { color: c.text.tertiary }]}>
                Every reply is also shown as text. Sous's voice turns off automatically while VoiceOver or TalkBack is on.
            </Text>

            <View style={[styles.previewBox, { borderColor: c.border, backgroundColor: c.surfaceMuted }]}>
                <View style={styles.previewHeader}>
                    <Text style={[styles.optionTitle, { color: c.text.primary }]}>Premium voice preview</Text>
                    <Text style={[styles.tag, { color: c.text.secondary, borderColor: c.border }]}>AI voice</Text>
                </View>
                <Text style={[styles.body, { color: c.text.secondary }]} accessibilityLabel={`Caption: ${PREMIUM_PREVIEW_CAPTION}`}>
                    "{PREMIUM_PREVIEW_CAPTION}"
                </Text>
                <Pressable onPress={preview} style={[styles.button, styles.outline, { borderColor: c.border, alignSelf: 'flex-start' }]} accessibilityRole="button" accessibilityLabel="Play the premium voice preview">
                    <Text style={[styles.buttonText, { color: c.text.primary }]}>Play preview</Text>
                </Pressable>
                {!!previewNote && <Text style={[styles.small, { color: c.text.tertiary }]}>{previewNote}</Text>}
            </View>

            <Text style={[styles.optionTitle, { color: c.text.primary }]}>Use your own ElevenLabs key (optional)</Text>
            <Text style={[styles.body, { color: c.text.secondary }]}>
                Unlocks the Premium Sous voice without Plus. Reply text you choose to hear goes to ElevenLabs and is billed to your account.
            </Text>
            <TextInput
                value={keyInput}
                onChangeText={setKeyInput}
                placeholder={hasKey ? 'Paste a new ElevenLabs key to replace' : 'Paste ElevenLabs API key'}
                placeholderTextColor={c.text.tertiary}
                secureTextEntry
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="ElevenLabs API key"
                style={[styles.input, { color: c.text.primary, borderColor: c.border, backgroundColor: c.surface }]}
            />
            <TextInput
                value={voice}
                onChangeText={setVoice}
                onEndEditing={() => setVoiceId(voice)}
                placeholder="Voice ID"
                placeholderTextColor={c.text.tertiary}
                autoCapitalize="none"
                autoCorrect={false}
                accessibilityLabel="ElevenLabs voice ID"
                style={[styles.input, { color: c.text.primary, borderColor: c.border, backgroundColor: c.surface }]}
            />
            <View style={styles.buttons}>
                <Pressable onPress={saveKey} style={[styles.button, { backgroundColor: theme.primary[500] }]} accessibilityRole="button">
                    <Text style={styles.buttonText}>Save key</Text>
                </Pressable>
                {hasKey && (
                    <Pressable onPress={async () => { await clearElevenLabsKey(); load(); }} style={[styles.button, styles.outline, { borderColor: c.border }]} accessibilityRole="button" accessibilityLabel="Clear ElevenLabs key">
                        <Text style={[styles.buttonText, { color: c.text.primary }]}>Clear</Text>
                    </Pressable>
                )}
                <Pressable onPress={test} style={[styles.button, styles.outline, { borderColor: c.border }]} accessibilityRole="button" accessibilityLabel="Test the selected voice">
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
    tag: { fontSize: 11, fontWeight: '800', borderWidth: 1, borderRadius: 999, paddingHorizontal: 8, paddingVertical: 2 },
    option: { flexDirection: 'row', gap: 10, alignItems: 'flex-start', borderWidth: 1.5, borderRadius: 14, padding: 12 },
    optionTitle: { fontSize: 15, fontWeight: '800' },
    body: { fontSize: 14, lineHeight: 20 },
    small: { fontSize: 12, lineHeight: 17 },
    row: { flexDirection: 'row', alignItems: 'center', justifyContent: 'space-between', borderTopWidth: 1, paddingTop: 10 },
    rowText: { fontSize: 15, fontWeight: '600', flex: 1 },
    previewBox: { borderWidth: 1, borderRadius: 14, padding: 12, gap: 8 },
    previewHeader: { flexDirection: 'row', alignItems: 'center', gap: 8 },
    input: { borderWidth: 1, borderRadius: 12, paddingHorizontal: 12, paddingVertical: 10, fontSize: 15 },
    buttons: { flexDirection: 'row', gap: 8, flexWrap: 'wrap' },
    button: { paddingHorizontal: 16, paddingVertical: 10, borderRadius: 999 },
    outline: { borderWidth: 1 },
    buttonText: { color: '#FFFFFF', fontWeight: '800' },
});

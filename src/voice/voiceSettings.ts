import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteSecret, getSecret, setSecret } from '../services/aiSettings';

// The user's own ElevenLabs key lives with the AI keys (Keychain/Keystore,
// browser storage on web). A proxied AmpliFood voice comes later with the
// platform backend; see PLATFORM_AI.md.

const ELEVENLABS_KEY_SLOT = 'fooddude.voice.elevenlabs.key';
const VOICE_ID_KEY = 'amplifood.voice.elevenlabsVoiceId';
const AUTO_SPEAK_KEY = 'amplifood.voice.autoSpeak';

// ElevenLabs premade voice "Rachel"; any voice ID from the user's library works.
export const DEFAULT_ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

export type VoiceSettings = {
    hasElevenLabsKey: boolean;
    voiceId: string;
    autoSpeak: boolean;
};

export async function getElevenLabsKey(): Promise<string | null> {
    return (await getSecret(ELEVENLABS_KEY_SLOT)) || null;
}

export async function saveElevenLabsKey(key: string): Promise<void> {
    await setSecret(ELEVENLABS_KEY_SLOT, key.trim());
}

export async function clearElevenLabsKey(): Promise<void> {
    await deleteSecret(ELEVENLABS_KEY_SLOT);
}

export async function getVoiceSettings(): Promise<VoiceSettings> {
    const [key, voiceId, autoSpeak] = await Promise.all([
        getElevenLabsKey(),
        AsyncStorage.getItem(VOICE_ID_KEY),
        AsyncStorage.getItem(AUTO_SPEAK_KEY),
    ]);
    return {
        hasElevenLabsKey: Boolean(key),
        voiceId: voiceId || DEFAULT_ELEVENLABS_VOICE_ID,
        autoSpeak: autoSpeak === 'true',
    };
}

export async function setVoiceId(voiceId: string): Promise<void> {
    await AsyncStorage.setItem(VOICE_ID_KEY, voiceId.trim() || DEFAULT_ELEVENLABS_VOICE_ID);
}

export async function setAutoSpeak(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(AUTO_SPEAK_KEY, String(enabled));
}

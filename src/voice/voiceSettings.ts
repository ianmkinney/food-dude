import AsyncStorage from '@react-native-async-storage/async-storage';
import { deleteSecret, getSecret, setSecret } from '../services/aiSettings';

// Voice choice: the phone's own voice (expo-speech) is the free default for
// everyone. "Premium Sous voice" (ElevenLabs) is a Plus perk served through the
// AmpliFood backend, or unlocked with the user's own ElevenLabs key (BYOK). No
// ElevenLabs key ever ships in the app.

const ELEVENLABS_KEY_SLOT = 'fooddude.voice.elevenlabs.key';
const VOICE_ID_KEY = 'amplifood.voice.elevenlabsVoiceId';
const AUTO_SPEAK_KEY = 'amplifood.voice.autoSpeak';
const CHOICE_KEY = 'amplifood.voice.choice';
const MUTED_KEY = 'amplifood.voice.muted';

export type VoiceChoice = 'phone' | 'premium';

// ElevenLabs premade voice "Rachel"; any voice ID from the user's library works.
export const DEFAULT_ELEVENLABS_VOICE_ID = '21m00Tcm4TlvDq8ikWAM';

export type VoiceSettings = {
    choice: VoiceChoice;
    muted: boolean;
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
    const [key, voiceId, autoSpeak, choice, muted] = await Promise.all([
        getElevenLabsKey(),
        AsyncStorage.getItem(VOICE_ID_KEY),
        AsyncStorage.getItem(AUTO_SPEAK_KEY),
        AsyncStorage.getItem(CHOICE_KEY),
        AsyncStorage.getItem(MUTED_KEY),
    ]);
    return {
        choice: choice === 'premium' ? 'premium' : 'phone',
        muted: muted === 'true',
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

export async function setVoiceChoice(choice: VoiceChoice): Promise<void> {
    await AsyncStorage.setItem(CHOICE_KEY, choice);
}

/** Mute for every Sous voice output (chat, onboarding, previews). Persists. */
export async function isVoiceMuted(): Promise<boolean> {
    return (await AsyncStorage.getItem(MUTED_KEY)) === 'true';
}

export async function setVoiceMuted(muted: boolean): Promise<void> {
    await AsyncStorage.setItem(MUTED_KEY, String(muted));
}

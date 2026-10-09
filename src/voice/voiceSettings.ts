import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTO_SPEAK_KEY = 'amplifood.voice.autoSpeak';
const MUTED_KEY = 'amplifood.voice.muted';

export type VoiceSettings = {
    autoSpeak: boolean;
    muted: boolean;
};

export async function getVoiceSettings(): Promise<VoiceSettings> {
    const [autoSpeakRaw, mutedRaw] = await Promise.all([
        AsyncStorage.getItem(AUTO_SPEAK_KEY),
        AsyncStorage.getItem(MUTED_KEY),
    ]);
    return {
        autoSpeak: autoSpeakRaw === 'true',
        muted: mutedRaw === 'true',
    };
}

export async function setAutoSpeak(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(AUTO_SPEAK_KEY, String(enabled));
}

/** Mute for every assistant voice output (chat, onboarding). Persists. */
export async function isVoiceMuted(): Promise<boolean> {
    return (await AsyncStorage.getItem(MUTED_KEY)) === 'true';
}

export async function setVoiceMuted(muted: boolean): Promise<void> {
    await AsyncStorage.setItem(MUTED_KEY, String(muted));
}

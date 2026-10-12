import AsyncStorage from '@react-native-async-storage/async-storage';

const AUTO_SPEAK_KEY = 'amplifood.voice.autoSpeak';
const MUTED_KEY = 'amplifood.voice.muted';
const EXPRESSIVENESS_KEY = 'amplifood.voice.expressiveness';

export type VoiceExpressiveness = 'natural' | 'expressive' | 'very_expressive';

export type VoiceSettings = {
    autoSpeak: boolean;
    muted: boolean;
    expressiveness: VoiceExpressiveness;
};

const EXPRESSIVENESS_VALUES: VoiceExpressiveness[] = ['natural', 'expressive', 'very_expressive'];

export function normalizeExpressiveness(raw: string | null): VoiceExpressiveness {
    if (raw && EXPRESSIVENESS_VALUES.includes(raw as VoiceExpressiveness)) {
        return raw as VoiceExpressiveness;
    }
    return 'expressive';
}

export async function getVoiceSettings(): Promise<VoiceSettings> {
    const [autoSpeakRaw, mutedRaw, expressivenessRaw] = await Promise.all([
        AsyncStorage.getItem(AUTO_SPEAK_KEY),
        AsyncStorage.getItem(MUTED_KEY),
        AsyncStorage.getItem(EXPRESSIVENESS_KEY),
    ]);
    return {
        autoSpeak: autoSpeakRaw === 'true',
        muted: mutedRaw === 'true',
        expressiveness: normalizeExpressiveness(expressivenessRaw),
    };
}

export async function setVoiceExpressiveness(level: VoiceExpressiveness): Promise<void> {
    await AsyncStorage.setItem(EXPRESSIVENESS_KEY, level);
}

export function voiceStabilityForExpressiveness(level: VoiceExpressiveness): number {
    if (level === 'natural') return 0.55;
    if (level === 'very_expressive') return 0.32;
    return 0.38;
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

const WEB_SPEECH_NOTICE_KEY = 'amplifood.voice.webSpeechNoticeSeen';

/** The browser speech-to-text notice is shown once, on the first mic tap. */
export async function hasSeenWebSpeechNotice(): Promise<boolean> {
    return (await AsyncStorage.getItem(WEB_SPEECH_NOTICE_KEY)) != null;
}

export async function markWebSpeechNoticeSeen(): Promise<void> {
    await AsyncStorage.setItem(WEB_SPEECH_NOTICE_KEY, String(Date.now()));
}

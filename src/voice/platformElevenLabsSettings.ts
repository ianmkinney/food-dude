import AsyncStorage from '@react-native-async-storage/async-storage';

const ENABLED_KEY = 'amplifood.elevenlabs.platform.enabled';
const VOICE_ID_KEY = 'amplifood.elevenlabs.platform.voiceId';
const VOICE_NAME_KEY = 'amplifood.elevenlabs.platform.voiceName';

export type PlatformElevenLabsConfig = {
    enabled: boolean;
    voiceId: string | null;
    voiceName: string | null;
};

export async function getPlatformElevenLabsConfig(): Promise<PlatformElevenLabsConfig> {
    const [enabledRaw, voiceId, voiceName] = await Promise.all([
        AsyncStorage.getItem(ENABLED_KEY),
        AsyncStorage.getItem(VOICE_ID_KEY),
        AsyncStorage.getItem(VOICE_NAME_KEY),
    ]);
    return {
        enabled: enabledRaw === '1',
        voiceId,
        voiceName,
    };
}

export async function setPlatformElevenLabsEnabled(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
}

export async function setPlatformElevenLabsVoice(voiceId: string, voiceName: string): Promise<void> {
    await Promise.all([
        AsyncStorage.setItem(VOICE_ID_KEY, voiceId),
        AsyncStorage.setItem(VOICE_NAME_KEY, voiceName),
    ]);
}

export async function clearPlatformElevenLabsVoice(): Promise<void> {
    await Promise.all([AsyncStorage.removeItem(VOICE_ID_KEY), AsyncStorage.removeItem(VOICE_NAME_KEY)]);
}

/** Platform voice is active when toggled on, a voice is picked, and owner sign-in is present. */
export async function isPlatformElevenLabsActive(hasOwnerSession: boolean): Promise<boolean> {
    if (!hasOwnerSession) return false;
    const cfg = await getPlatformElevenLabsConfig();
    return cfg.enabled && Boolean(cfg.voiceId);
}

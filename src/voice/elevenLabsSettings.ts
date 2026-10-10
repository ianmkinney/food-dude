import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let SecureStore: {
    getItemAsync?: (key: string, options?: object) => Promise<string | null>;
    setItemAsync?: (key: string, value: string, options?: object) => Promise<void>;
    deleteItemAsync?: (key: string, options?: object) => Promise<void>;
    AFTER_FIRST_UNLOCK?: number;
} | null = null;

try {
    if (Platform.OS !== 'web') {
        SecureStore = require('expo-secure-store');
    }
} catch {
    SecureStore = null;
}

const API_KEY_SLOT = 'amplifood.elevenlabs.apiKey';
const VOICE_ID_SLOT = 'amplifood.elevenlabs.voiceId';
const VOICE_NAME_SLOT = 'amplifood.elevenlabs.voiceName';
const WEB_SECRET_PREFIX = 'fooddude.secure.';

const secureOptions =
    SecureStore?.AFTER_FIRST_UNLOCK != null ? { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK } : undefined;

async function secureGet(key: string): Promise<string | null> {
    if (SecureStore?.getItemAsync) {
        try {
            const stored = await SecureStore.getItemAsync(key, secureOptions);
            if (stored != null) return stored;
        } catch {
            // fall through
        }
    }
    return AsyncStorage.getItem(WEB_SECRET_PREFIX + key);
}

async function secureSet(key: string, value: string): Promise<void> {
    if (SecureStore?.setItemAsync) {
        try {
            await SecureStore.setItemAsync(key, value, secureOptions);
            return;
        } catch {
            // fall through
        }
    }
    await AsyncStorage.setItem(WEB_SECRET_PREFIX + key, value);
}

async function secureDelete(key: string): Promise<void> {
    if (SecureStore?.deleteItemAsync) {
        try {
            await SecureStore.deleteItemAsync(key, secureOptions);
        } catch {
            // already gone
        }
    }
    try {
        await AsyncStorage.removeItem(WEB_SECRET_PREFIX + key);
    } catch {
        // already gone
    }
}

export type ElevenLabsVoice = { voice_id: string; name: string };

export type ElevenLabsConfig = {
    apiKey: string | null;
    voiceId: string | null;
    voiceName: string | null;
};

export function maskElevenLabsKey(key: string | null): string {
    if (!key) return '';
    if (key.length <= 4) return '••••';
    return `••••${key.slice(-4)}`;
}

export async function getElevenLabsConfig(): Promise<ElevenLabsConfig> {
    const [apiKey, voiceId, voiceName] = await Promise.all([
        secureGet(API_KEY_SLOT),
        secureGet(VOICE_ID_SLOT),
        secureGet(VOICE_NAME_SLOT),
    ]);
    return { apiKey, voiceId, voiceName };
}

export async function saveElevenLabsApiKey(key: string): Promise<void> {
    const trimmed = key.trim();
    if (!trimmed) throw new Error('Enter an ElevenLabs API key.');
    await secureSet(API_KEY_SLOT, trimmed);
}

export async function clearElevenLabsApiKey(): Promise<void> {
    await Promise.all([secureDelete(API_KEY_SLOT), secureDelete(VOICE_ID_SLOT), secureDelete(VOICE_NAME_SLOT)]);
}

export async function setElevenLabsVoice(voiceId: string, voiceName: string): Promise<void> {
    await secureSet(VOICE_ID_SLOT, voiceId);
    await secureSet(VOICE_NAME_SLOT, voiceName);
}

export async function listElevenLabsVoices(apiKey: string): Promise<ElevenLabsVoice[]> {
    const res = await fetch('https://api.elevenlabs.io/v1/voices', {
        headers: { 'xi-api-key': apiKey },
    });
    if (!res.ok) {
        throw new Error('Could not load voices from ElevenLabs. Check your API key.');
    }
    const data = (await res.json()) as { voices?: { voice_id: string; name: string }[] };
    return (data.voices || []).map((v) => ({ voice_id: v.voice_id, name: v.name }));
}

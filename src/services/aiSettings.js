import { Platform } from 'react-native';
import AsyncStorage from '@react-native-async-storage/async-storage';

let SecureStore = null;
try {
    if (Platform.OS !== 'web') {
        SecureStore = require('expo-secure-store');
    }
} catch {
    SecureStore = null;
}

export const PROVIDERS = [
    {
        id: 'anthropic',
        label: 'Anthropic (Claude)',
        shortLabel: 'Claude',
        hint: 'sk-ant-…',
        docsUrl: 'https://console.anthropic.com/settings/keys',
    },
    {
        id: 'openai',
        label: 'OpenAI',
        shortLabel: 'OpenAI',
        hint: 'sk-…',
        docsUrl: 'https://platform.openai.com/api-keys',
    },
    {
        id: 'xai',
        label: 'xAI (Grok)',
        shortLabel: 'Grok',
        hint: 'xai-…',
        docsUrl: 'https://console.x.ai',
    },
    {
        id: 'gemini',
        label: 'Google Gemini',
        shortLabel: 'Gemini',
        hint: 'AIza…',
        docsUrl: 'https://aistudio.google.com/apikey',
    },
];

export const DEFAULT_MODELS = {
    anthropic: 'claude-3-5-haiku-latest',
    openai: 'gpt-4o-mini',
    xai: 'grok-3-mini',
    gemini: 'gemini-2.0-flash',
};

export const DEFAULT_IMAGE_MODELS = {
    gemini: 'gemini-2.0-flash-preview-image-generation',
};

export const MISSING_KEY_MESSAGE = 'Add an API key in Account to use AI features.';

const PROVIDER_KEY = 'fooddude.ai.provider';
const keySlot = (provider) => `fooddude.ai.key.${provider}`;
const modelSlot = (provider) => `fooddude.ai.model.${provider}`;
const cacheSlot = (provider) => `fooddude.ai.modelsCache.${provider}`;

const WEB_SECRET_PREFIX = 'fooddude.secure.';

const secureOptions =
    SecureStore?.AFTER_FIRST_UNLOCK
        ? { keychainAccessible: SecureStore.AFTER_FIRST_UNLOCK }
        : undefined;

export function getProviderMeta(providerId) {
    return PROVIDERS.find((p) => p.id === providerId) || PROVIDERS[0];
}

export function maskKey(key) {
    if (!key) return '';
    if (key.length <= 4) return '••••';
    return `••••${key.slice(-4)}`;
}

async function secureGet(key) {
    if (SecureStore?.getItemAsync) {
        try {
            const stored = await SecureStore.getItemAsync(key, secureOptions);
            if (stored != null) return stored;
        } catch (error) {
            console.warn('[AI Settings] SecureStore read failed, using AsyncStorage');
        }
    }
    return AsyncStorage.getItem(WEB_SECRET_PREFIX + key);
}

async function secureSet(key, value) {
    if (SecureStore?.setItemAsync) {
        try {
            await SecureStore.setItemAsync(key, value, secureOptions);
            return;
        } catch (error) {
            console.warn('[AI Settings] SecureStore write failed, using AsyncStorage');
        }
    }
    await AsyncStorage.setItem(WEB_SECRET_PREFIX + key, value);
}

async function secureDelete(key) {
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

export async function getSelectedProvider() {
    const stored = await secureGet(PROVIDER_KEY);
    if (stored && PROVIDERS.some((p) => p.id === stored)) {
        return stored;
    }
    return PROVIDERS[0].id;
}

export async function setSelectedProvider(providerId) {
    if (!PROVIDERS.some((p) => p.id === providerId)) {
        throw new Error('Unknown AI provider');
    }
    await secureSet(PROVIDER_KEY, providerId);
}

export async function getApiKey(providerId) {
    const key = await secureGet(keySlot(providerId));
    return key || null;
}

export async function saveApiKey(providerId, apiKey) {
    const trimmed = (apiKey || '').trim();
    if (!trimmed) {
        throw new Error('Enter an API key');
    }
    await secureSet(keySlot(providerId), trimmed);
}

export async function clearApiKey(providerId) {
    await secureDelete(keySlot(providerId));
    await secureDelete(modelSlot(providerId));
    try {
        await AsyncStorage.removeItem(cacheSlot(providerId));
    } catch {
        // cache is non-secret; ignore
    }
}

export async function getSelectedModel(providerId) {
    const stored = await secureGet(modelSlot(providerId));
    return stored || DEFAULT_MODELS[providerId] || null;
}

export async function setSelectedModel(providerId, modelId) {
    if (!modelId) return;
    await secureSet(modelSlot(providerId), modelId);
}

export async function getCachedModels(providerId) {
    try {
        const raw = await AsyncStorage.getItem(cacheSlot(providerId));
        if (!raw) return null;
        const parsed = JSON.parse(raw);
        if (!parsed?.models || !Array.isArray(parsed.models)) return null;
        return parsed;
    } catch {
        return null;
    }
}

export async function setCachedModels(providerId, models) {
    const payload = {
        fetchedAt: Date.now(),
        models,
    };
    await AsyncStorage.setItem(cacheSlot(providerId), JSON.stringify(payload));
    return payload;
}

export async function getActiveCredentials() {
    const provider = await getSelectedProvider();
    const apiKey = await getApiKey(provider);
    const model = await getSelectedModel(provider);
    return { provider, apiKey, model };
}

export async function isAiConfigured() {
    const { apiKey } = await getActiveCredentials();
    return Boolean(apiKey);
}

export async function requireAiConfigured() {
    const creds = await getActiveCredentials();
    if (!creds.apiKey) {
        throw new Error(MISSING_KEY_MESSAGE);
    }
    return creds;
}

export async function getAccountAiState() {
    const provider = await getSelectedProvider();
    const apiKey = await getApiKey(provider);
    const model = await getSelectedModel(provider);
    const cache = await getCachedModels(provider);
    return {
        provider,
        hasKey: Boolean(apiKey),
        keyLast4: apiKey ? maskKey(apiKey) : '',
        model,
        cachedModels: cache?.models || [],
        cacheFetchedAt: cache?.fetchedAt || null,
    };
}

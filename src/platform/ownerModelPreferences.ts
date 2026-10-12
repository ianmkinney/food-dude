import AsyncStorage from '@react-native-async-storage/async-storage';

const CHAT_KEY = 'amplifood.owner.openrouter.chatModel';
const IMAGE_KEY = 'amplifood.owner.openrouter.imageModel';

export async function getOwnerChatModelPreference(): Promise<string | null> {
    const raw = await AsyncStorage.getItem(CHAT_KEY);
    const trimmed = raw?.trim();
    return trimmed || null;
}

export async function clearOwnerChatModelPreference(): Promise<void> {
    await AsyncStorage.removeItem(CHAT_KEY);
}

export async function setOwnerChatModelPreference(modelId: string | null): Promise<void> {
    if (!modelId?.trim()) {
        await AsyncStorage.removeItem(CHAT_KEY);
        return;
    }
    await AsyncStorage.setItem(CHAT_KEY, modelId.trim());
}

export async function getOwnerImageModelPreference(): Promise<string | null> {
    const raw = await AsyncStorage.getItem(IMAGE_KEY);
    const trimmed = raw?.trim();
    return trimmed || null;
}

export async function clearOwnerImageModelPreference(): Promise<void> {
    await AsyncStorage.removeItem(IMAGE_KEY);
}

export async function setOwnerImageModelPreference(modelId: string | null): Promise<void> {
    if (!modelId?.trim()) {
        await AsyncStorage.removeItem(IMAGE_KEY);
        return;
    }
    await AsyncStorage.setItem(IMAGE_KEY, modelId.trim());
}

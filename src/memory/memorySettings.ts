import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'amplifood.memory.enabled';

export async function isMemoryEnabled(): Promise<boolean> {
    try {
        const v = await AsyncStorage.getItem(KEY);
        return v !== 'false';
    } catch {
        return true;
    }
}

export async function setMemoryEnabled(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(KEY, String(enabled));
}

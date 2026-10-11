import AsyncStorage from '@react-native-async-storage/async-storage';

const KEY = 'amplifood.sync.deviceId.v1';

function randomId() {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export async function getSyncDeviceId(): Promise<string> {
    const existing = await AsyncStorage.getItem(KEY);
    if (existing) return existing;
    const id = randomId();
    await AsyncStorage.setItem(KEY, id);
    return id;
}

import AsyncStorage from '@react-native-async-storage/async-storage';

const ENABLED_KEY = 'amplifood.sync.enabled.v1';
const CURSOR_KEY = 'amplifood.sync.cursor.v1';
const LAST_SYNC_KEY = 'amplifood.sync.lastAt.v1';

export async function getSyncEnabled(): Promise<boolean> {
    const raw = await AsyncStorage.getItem(ENABLED_KEY);
    if (raw === null) return true;
    return raw === '1';
}

export async function setSyncEnabled(enabled: boolean): Promise<void> {
    await AsyncStorage.setItem(ENABLED_KEY, enabled ? '1' : '0');
}

export async function getSyncCursor(): Promise<number> {
    const raw = await AsyncStorage.getItem(CURSOR_KEY);
    const n = Number(raw);
    return Number.isFinite(n) && n >= 0 ? n : 0;
}

export async function setSyncCursor(cursor: number): Promise<void> {
    await AsyncStorage.setItem(CURSOR_KEY, String(Math.max(0, Math.floor(cursor))));
}

export async function getLastSyncedAt(): Promise<number | null> {
    const raw = await AsyncStorage.getItem(LAST_SYNC_KEY);
    if (!raw) return null;
    const n = Number(raw);
    return Number.isFinite(n) ? n : null;
}

export async function setLastSyncedAt(ms: number): Promise<void> {
    await AsyncStorage.setItem(LAST_SYNC_KEY, String(ms));
}

/** Re-enable sync on every successful sign-in (sign-out turns sync off). */
export async function defaultEnableSyncAfterSignIn(): Promise<void> {
    await setSyncEnabled(true);
}

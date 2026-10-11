import AsyncStorage from '@react-native-async-storage/async-storage';
import { Platform } from 'react-native';
import { getApiBaseUrl } from '../config/api';

const SESSION_KEY = 'amplifood.owner.session.v1';

export type OwnerSession = {
    token: string;
    email: string;
    name: string;
    picture?: string;
    /** Cached from last /auth/google or /auth/session; server allowlist is authoritative. */
    platformAiAllowed?: boolean;
    savedAt: number;
};

export type OwnerUsage = {
    requests: number;
    requestLimit: number;
    tokens: number;
    tokenLimit: number;
};

let SecureStore: {
    getItemAsync?: (key: string) => Promise<string | null>;
    setItemAsync?: (key: string, value: string) => Promise<void>;
    deleteItemAsync?: (key: string) => Promise<void>;
} | null = null;

try {
    if (Platform.OS !== 'web') {
        SecureStore = require('expo-secure-store');
    }
} catch {
    SecureStore = null;
}

async function readRaw(): Promise<string | null> {
    if (SecureStore?.getItemAsync) {
        try {
            return await SecureStore.getItemAsync(SESSION_KEY);
        } catch {
            // fall through
        }
    }
    return AsyncStorage.getItem(SESSION_KEY);
}

async function writeRaw(value: string | null): Promise<void> {
    if (value === null) {
        if (SecureStore?.deleteItemAsync) {
            try {
                await SecureStore.deleteItemAsync(SESSION_KEY);
            } catch {
                // ignore
            }
        }
        await AsyncStorage.removeItem(SESSION_KEY);
        return;
    }
    if (SecureStore?.setItemAsync) {
        try {
            await SecureStore.setItemAsync(SESSION_KEY, value);
            return;
        } catch {
            // fall through
        }
    }
    await AsyncStorage.setItem(SESSION_KEY, value);
}

export async function getOwnerSession(): Promise<OwnerSession | null> {
    try {
        const raw = await readRaw();
        if (!raw) return null;
        const parsed = JSON.parse(raw) as OwnerSession;
        if (!parsed?.token || !parsed.email) return null;
        return parsed;
    } catch {
        return null;
    }
}

export async function getOwnerSessionToken(): Promise<string | null> {
    const session = await getOwnerSession();
    return session?.token ?? null;
}

export async function hasOwnerSession(): Promise<boolean> {
    return Boolean(await getOwnerSessionToken());
}

export async function saveOwnerSession(session: OwnerSession): Promise<void> {
    await writeRaw(JSON.stringify(session));
}

export async function clearOwnerSession(): Promise<void> {
    await writeRaw(null);
}

export async function exchangeGoogleIdToken(idToken: string, nonce: string): Promise<OwnerSession> {
    const response = await fetch(`${getApiBaseUrl()}/auth/google`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ idToken, nonce }),
    });
    const body = await response.json().catch(() => ({}));
    if (!response.ok) {
        const message = body?.message || 'Google sign-in failed.';
        throw new Error(message);
    }
    const session: OwnerSession = {
        token: body.token,
        email: body.email,
        name: body.name || '',
        picture: body.picture ? String(body.picture) : '',
        platformAiAllowed: Boolean(body.platformAiAllowed),
        savedAt: Date.now(),
    };
    await saveOwnerSession(session);
    return session;
}

export type AuthSessionProfile = {
    email: string;
    name: string;
    picture?: string;
    sub?: string;
    platformAiAllowed: boolean;
    elevenlabsAvailable: boolean;
};

export async function fetchAuthSessionProfile(): Promise<AuthSessionProfile | null> {
    const token = await getOwnerSessionToken();
    if (!token) return null;
    const response = await fetch(`${getApiBaseUrl()}/auth/session`, {
        headers: { Authorization: `Bearer ${token}` },
    });
    if (response.status === 401) {
        await clearOwnerSession();
        return null;
    }
    if (!response.ok) return null;
    const body = await response.json();
    const profile: AuthSessionProfile = {
        email: body.email,
        name: body.name || '',
        picture: body.picture ? String(body.picture) : '',
        sub: body.sub,
        platformAiAllowed: Boolean(body.platformAiAllowed),
        elevenlabsAvailable: Boolean(body.elevenlabsAvailable),
    };
    const existing = await getOwnerSession();
    if (existing?.token) {
        await saveOwnerSession({
            ...existing,
            email: profile.email,
            name: profile.name,
            picture: profile.picture,
            platformAiAllowed: profile.platformAiAllowed,
            savedAt: Date.now(),
        });
    }
    return profile;
}

/** Google sign-in with server allowlist (owner / tester). BYOK users do not need this. */
export async function hasPlatformAiAccess(): Promise<boolean> {
    const session = await getOwnerSession();
    if (!session) return false;
    if (session.platformAiAllowed === true) return true;
    const profile = await fetchAuthSessionProfile();
    return Boolean(profile?.platformAiAllowed);
}

/** @deprecated platform AI usage meters are not stored server-side */
export async function fetchOwnerUsage(): Promise<OwnerUsage | null> {
    return null;
}

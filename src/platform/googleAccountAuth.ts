import { Alert, Platform } from 'react-native';
import {
    clearOwnerSession,
    exchangeGoogleIdToken,
    fetchAuthSessionProfile,
    getOwnerSession,
    saveOwnerSession,
    type AuthSessionProfile,
    type OwnerSession,
} from './ownerSession';
import { getOwnerGoogleClientIds } from './ownerSignInConfig';
import {
    shouldUseSameTabGoogleRedirect,
    signInWithGooglePopup,
    signInWithGoogleRedirect,
    takePendingGoogleSignIn,
    type GoogleSignInPayload,
} from './googleWebAuth';
import { autoMigrateLocalPartiesAfterSignIn } from '../services/partyAutoMigrate';
import { defaultEnableSyncAfterSignIn, setSyncEnabled } from '../sync/syncPrefs';

export type GoogleAccountState = {
    session: OwnerSession | null;
    profile: AuthSessionProfile | null;
    platformAiAllowed: boolean;
    busy: boolean;
};

type Listener = () => void;
const listeners = new Set<Listener>();

export function subscribeGoogleAccount(listener: Listener): () => void {
    listeners.add(listener);
    return () => listeners.delete(listener);
}

function notifyGoogleAccount() {
    listeners.forEach((l) => l());
}

export async function refreshGoogleAccountState(): Promise<GoogleAccountState> {
    const session = await getOwnerSession();
    if (!session) {
        return { session: null, profile: null, platformAiAllowed: false, busy: false };
    }
    const profile = await fetchAuthSessionProfile();
    if (!profile) {
        return { session: null, profile: null, platformAiAllowed: false, busy: false };
    }
    return {
        session,
        profile,
        platformAiAllowed: Boolean(profile.platformAiAllowed),
        busy: false,
    };
}

export async function completeGoogleSignIn(idToken: string, nonce: string): Promise<void> {
    const session = await exchangeGoogleIdToken(idToken, nonce);
    const profile = await fetchAuthSessionProfile();
    if (profile?.picture && !session.picture) {
        await saveOwnerSession({ ...session, picture: profile.picture });
    }
    await defaultEnableSyncAfterSignIn();
    await autoMigrateLocalPartiesAfterSignIn();
    notifyGoogleAccount();
}

export async function signOutGoogleAccount(): Promise<void> {
    await setSyncEnabled(false);
    await clearOwnerSession();
    notifyGoogleAccount();
}

export function randomGoogleNonce(): string {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
}

export function loadGisScript(): Promise<void> {
    if (typeof document === 'undefined') return Promise.resolve();
    if (document.getElementById('google-gsi')) return Promise.resolve();
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.id = 'google-gsi';
        script.src = 'https://accounts.google.com/gsi/client';
        script.async = true;
        script.onload = () => resolve();
        script.onerror = () => reject(new Error('Could not load Google sign-in'));
        document.head.appendChild(script);
    });
}

export function promptGoogleIdTokenWeb(clientId: string, nonce: string): Promise<GoogleSignInPayload> {
    return loadGisScript().then(
        () =>
            new Promise((resolve, reject) => {
                const google = (window as unknown as {
                    google?: { accounts: { id: { initialize: Function; prompt: Function } } };
                }).google;
                if (!google?.accounts?.id) {
                    reject(new Error('Google Identity Services unavailable'));
                    return;
                }
                google.accounts.id.initialize({
                    client_id: clientId,
                    nonce,
                    callback: (response: { credential?: string }) => {
                        if (response?.credential) resolve({ idToken: response.credential, nonce });
                        else reject(new Error('No credential returned'));
                    },
                    auto_select: false,
                    cancel_on_tap_outside: true,
                });
                google.accounts.id.prompt((notification: { isNotDisplayed: () => boolean; isSkippedMoment: () => boolean }) => {
                    if (notification.isNotDisplayed() || notification.isSkippedMoment()) {
                        reject(new Error('not-displayed'));
                    }
                });
            })
    );
}

export async function signInWithGoogleWeb(webClientId: string, usePopup: boolean): Promise<'popup-fallback' | 'done' | 'redirecting'> {
    if (!webClientId) throw new Error('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set in this build.');
    if (shouldUseSameTabGoogleRedirect(navigator.userAgent, navigator.maxTouchPoints)) {
        signInWithGoogleRedirect(webClientId);
        return 'redirecting';
    }
    const nonce = randomGoogleNonce();
    if (usePopup) {
        const pending = signInWithGooglePopup(webClientId);
        const { idToken, nonce: n } = await pending;
        await completeGoogleSignIn(idToken, n);
        return 'done';
    }
    try {
        const { idToken, nonce: n } = await promptGoogleIdTokenWeb(webClientId, nonce);
        await completeGoogleSignIn(idToken, n);
        return 'done';
    } catch (error) {
        if (error instanceof Error && error.message === 'not-displayed') return 'popup-fallback';
        throw error;
    }
}

export function consumePendingWebGoogleSignIn(): Promise<void> {
    if (Platform.OS !== 'web') return Promise.resolve();
    let pending: GoogleSignInPayload | null = null;
    try {
        pending = takePendingGoogleSignIn();
    } catch (error) {
        const message = error instanceof Error ? error.message : '';
        if (message && message !== 'cancelled') Alert.alert('Sign-in failed', message);
        return Promise.resolve();
    }
    if (!pending) return Promise.resolve();
    return completeGoogleSignIn(pending.idToken, pending.nonce).catch((error) => {
        const message = error instanceof Error ? error.message : 'Google sign-in failed.';
        Alert.alert('Sign-in failed', message);
    });
}

export function getGoogleClientIdsForAuth() {
    return getOwnerGoogleClientIds();
}

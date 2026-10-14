// Google sign-in on web without a second AmpliFood instance: Google redirects
// to the static /auth/google-callback page, which hands the ID token back over
// BroadcastChannel / localStorage. Any page under the app origin would boot the
// whole SPA and fight the original tab for the OPFS database.
//
// iPhone Safari cannot use the popup path (see googleWebRedirect.js). That
// browser stores mode=redirect and navigates the same tab.

import {
    googleRedirectUri,
    googleSignInErrorMessage,
    isStandaloneWebApp,
    shouldUseSameTabGoogleRedirect,
} from './googleWebRedirect.js';

const RESULT_KEY = 'amplifood.auth.google.result';
const STATE_KEY = 'amplifood.auth.google.state';
const NONCE_KEY = 'amplifood.auth.google.nonce';
const MODE_KEY = 'amplifood.auth.google.mode';
const RETURN_KEY = 'amplifood.auth.google.return';
const PENDING_KEY = 'amplifood.auth.google.pending';
const RESULT_MAX_AGE_MS = 10 * 60 * 1000;

type CallbackResult = {
    idToken?: string | null;
    state?: string | null;
    error?: string | null;
    errorDescription?: string | null;
    at?: number;
};
type AuthMode = 'popup' | 'redirect';
type AuthPending = {
    state: string;
    nonce: string;
    mode: AuthMode;
    returnTo: string;
    redirectUri: string;
    at: number;
};

const randomString = () => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

function currentRedirectUri() {
    return googleRedirectUri(window.location.origin);
}

function buildAuthUrl(clientId: string, state: string, nonce: string) {
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: currentRedirectUri(),
        response_type: 'id_token',
        scope: 'openid email profile',
        nonce,
        state,
        prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function safeReturnPath(): string {
    try {
        const path = `${window.location.pathname || '/'}${window.location.search || ''}`;
        if (!path.startsWith('/') || path.startsWith('//') || path.startsWith('/auth/')) return '/';
        if (path.includes('\\') || path.includes('://')) return '/';
        return path.slice(0, 512);
    } catch {
        return '/';
    }
}

function writeAuthPending(pending: Omit<AuthPending, 'at' | 'redirectUri'> & { redirectUri?: string }) {
    const record: AuthPending = {
        ...pending,
        redirectUri: pending.redirectUri || currentRedirectUri(),
        at: Date.now(),
    };
    try {
        sessionStorage.setItem(STATE_KEY, record.state);
        sessionStorage.setItem(NONCE_KEY, record.nonce);
        sessionStorage.setItem(MODE_KEY, record.mode);
        sessionStorage.setItem(RETURN_KEY, record.returnTo);
    } catch {
        // Private mode: localStorage mirror below may still survive the round trip.
    }
    try {
        localStorage.setItem(PENDING_KEY, JSON.stringify(record));
        localStorage.removeItem(RESULT_KEY);
    } catch {
        // BroadcastChannel still carries a popup result when storage is blocked.
    }
}

function readStoredResult(): CallbackResult | null {
    try {
        const raw = localStorage.getItem(RESULT_KEY);
        return raw ? (JSON.parse(raw) as CallbackResult) : null;
    } catch {
        return null;
    }
}

function readPending(): AuthPending | null {
    try {
        const raw = localStorage.getItem(PENDING_KEY);
        if (!raw) return null;
        const parsed = JSON.parse(raw) as AuthPending;
        if (!parsed?.state || !parsed?.nonce) return null;
        if (parsed.mode !== 'popup' && parsed.mode !== 'redirect') return null;
        if (Date.now() - (parsed.at ?? 0) > RESULT_MAX_AGE_MS) return null;
        return parsed;
    } catch {
        return null;
    }
}

function clearAuthHandoff() {
    try {
        localStorage.removeItem(RESULT_KEY);
        localStorage.removeItem(PENDING_KEY);
        sessionStorage.removeItem(STATE_KEY);
        sessionStorage.removeItem(NONCE_KEY);
        sessionStorage.removeItem(MODE_KEY);
        sessionStorage.removeItem(RETURN_KEY);
    } catch {
        // ignore
    }
}

export type GoogleSignInPayload = { idToken: string; nonce: string };

export { shouldUseSameTabGoogleRedirect, googleRedirectUri, PRODUCTION_GOOGLE_REDIRECT_URI } from './googleWebRedirect.js';

export function shouldRedirectGoogleSignInHere(): boolean {
    if (typeof navigator === 'undefined') return false;
    const nav = navigator as Navigator & { standalone?: boolean };
    let displayMode = '';
    try {
        if (window.matchMedia('(display-mode: standalone)').matches) displayMode = 'standalone';
        else if (window.matchMedia('(display-mode: fullscreen)').matches) displayMode = 'fullscreen';
    } catch {
        displayMode = '';
    }
    return shouldUseSameTabGoogleRedirect(nav.userAgent, nav.maxTouchPoints || 0, {
        standalone: isStandaloneWebApp({ navigatorStandalone: nav.standalone === true, displayMode }),
    });
}

function settle(
    result: CallbackResult,
    expectedState: string | null,
    expectedNonce: string | null,
    redirectUri: string | null
): GoogleSignInPayload {
    if (!expectedState || result.state !== expectedState) throw new Error('Sign-in response did not match this session.');
    if (result.error) {
        throw new Error(googleSignInErrorMessage(result.error, result.errorDescription || '', redirectUri || ''));
    }
    if (!result.idToken) throw new Error('Google did not return an ID token.');
    if (!expectedNonce) throw new Error('Sign-in response did not match this session.');
    return { idToken: result.idToken, nonce: expectedNonce };
}

/** Error Google sent back on our own URL (storage handoff missed). Clears the query. */
export function takeGoogleAuthErrorFromLocation(): string | null {
    if (typeof window === 'undefined') return null;
    const params = new URLSearchParams(window.location.search);
    const code = params.get('google_auth_error');
    if (!code) return null;
    const description = params.get('google_auth_error_description') || '';
    params.delete('google_auth_error');
    params.delete('google_auth_error_description');
    const query = params.toString();
    const next = `${window.location.pathname}${query ? `?${query}` : ''}${window.location.hash}`;
    window.history.replaceState(null, '', next);
    return googleSignInErrorMessage(code, description, currentRedirectUri());
}

/** Same-tab Google redirect. Must run synchronously inside the tap handler. */
export function signInWithGoogleRedirect(clientId: string): void {
    if (!clientId) throw new Error('EXPO_PUBLIC_GOOGLE_WEB_CLIENT_ID is not set in this build.');
    const state = randomString();
    const nonce = randomString();
    writeAuthPending({ state, nonce, mode: 'redirect', returnTo: safeReturnPath() });
    window.location.assign(buildAuthUrl(clientId, state, nonce));
}

/**
 * Must run synchronously inside the tap handler, or Safari blocks the popup.
 * If the popup can't open, the current tab redirects to Google and comes back
 * to the page that started sign-in, where takePendingGoogleSignIn() picks the token up.
 */
export function signInWithGooglePopup(clientId: string): Promise<GoogleSignInPayload> {
    const state = randomString();
    const nonce = randomString();
    const returnTo = safeReturnPath();
    writeAuthPending({ state, nonce, mode: 'popup', returnTo });

    const url = buildAuthUrl(clientId, state, nonce);
    const popup = window.open(url, 'amplifood-google', 'popup,width=480,height=640');
    // Safari returns null when the open is not a user gesture. A home-screen
    // app sometimes returns a window that is already closed. Both continue here.
    if (!popup || popup.closed) {
        writeAuthPending({ state, nonce, mode: 'redirect', returnTo });
        window.location.assign(url);
        return new Promise(() => {});
    }

    return new Promise((resolve, reject) => {
        let channel: BroadcastChannel | null = null;
        let focusTimer: ReturnType<typeof setTimeout> | null = null;
        let pollTimer: ReturnType<typeof setInterval> | null = null;
        let done = false;
        const startedAt = Date.now();

        const cleanup = () => {
            done = true;
            channel?.close();
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('message', onMessage);
            window.removeEventListener('focus', onFocus);
            if (focusTimer) clearTimeout(focusTimer);
            if (pollTimer) clearInterval(pollTimer);
            clearTimeout(giveUpTimer);
            clearAuthHandoff();
        };
        const finish = (result: CallbackResult) => {
            if (done) return;
            cleanup();
            try {
                resolve(settle(result, state, nonce, currentRedirectUri()));
            } catch (error) {
                reject(error);
            }
        };
        const onStorage = (event: StorageEvent) => {
            if (event.key === RESULT_KEY && event.newValue) {
                try {
                    finish(JSON.parse(event.newValue));
                } catch {
                    // ignore malformed storage
                }
            }
        };
        const onMessage = (event: MessageEvent) => {
            if (event.origin !== window.location.origin) return;
            const data = event.data as { type?: string; result?: CallbackResult } | null;
            if (data?.type === 'google-result' && data.result) finish(data.result);
        };
        const tryStored = () => {
            const stored = readStoredResult();
            if (stored?.state === state) finish(stored);
        };
        const cancel = () => {
            if (done) return;
            tryStored();
            if (done) return;
            cleanup();
            reject(new Error('cancelled'));
        };
        // Opening the popup can bounce focus immediately. Don't treat that as
        // "the user closed Google" — poll storage and wait out a longer grace.
        const onFocus = () => {
            if (Date.now() - startedAt < 2000) return;
            tryStored();
            if (done) return;
            if (focusTimer) clearTimeout(focusTimer);
            focusTimer = setTimeout(cancel, 8000);
        };
        const giveUpTimer = setTimeout(cancel, 5 * 60 * 1000);

        if (typeof BroadcastChannel !== 'undefined') {
            channel = new BroadcastChannel('amplifood-auth');
            channel.onmessage = (event) => {
                if (event.data?.type === 'google-result') finish(event.data.result);
            };
        }
        window.addEventListener('storage', onStorage);
        window.addEventListener('message', onMessage);
        window.addEventListener('focus', onFocus);
        pollTimer = setInterval(tryStored, 400);
    });
}

/** After a full-page redirect sign-in, return the ID token waiting for this tab (once). */
export function takePendingGoogleSignIn(): GoogleSignInPayload | null {
    if (typeof window === 'undefined') return null;
    let mode: string | null = null;
    let state: string | null = null;
    let nonce: string | null = null;
    try {
        mode = sessionStorage.getItem(MODE_KEY);
        state = sessionStorage.getItem(STATE_KEY);
        nonce = sessionStorage.getItem(NONCE_KEY);
    } catch {
        mode = null;
    }
    const pending = readPending();
    if (mode !== 'redirect' && pending?.mode === 'redirect') {
        mode = 'redirect';
        state = state || pending.state;
        nonce = nonce || pending.nonce;
    }
    if (mode !== 'redirect') return null;
    const result = readStoredResult();
    const redirectUri = pending?.redirectUri || currentRedirectUri();
    clearAuthHandoff();
    if (!result) {
        throw new Error(googleSignInErrorMessage('incomplete', '', redirectUri));
    }
    if (Date.now() - (result.at ?? 0) > RESULT_MAX_AGE_MS) return null;
    try {
        return settle(result, state, nonce, redirectUri);
    } catch (error) {
        if (error instanceof Error && error.message === 'Sign-in response did not match this session.') return null;
        throw error;
    }
}

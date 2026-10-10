// Google sign-in on web without a second AmpliFood instance: Google redirects
// to the static /auth/google-callback page, which hands the ID token back over
// BroadcastChannel / localStorage. Any page under the app origin would boot the
// whole SPA and fight the original tab for the OPFS database.

const RESULT_KEY = 'amplifood.auth.google.result';
const STATE_KEY = 'amplifood.auth.google.state';
const NONCE_KEY = 'amplifood.auth.google.nonce';
const MODE_KEY = 'amplifood.auth.google.mode';
const RESULT_MAX_AGE_MS = 10 * 60 * 1000;

type CallbackResult = { idToken?: string | null; state?: string | null; error?: string | null; at?: number };

const randomString = () => {
    const bytes = new Uint8Array(16);
    crypto.getRandomValues(bytes);
    return Array.from(bytes, (b) => b.toString(16).padStart(2, '0')).join('');
};

function buildAuthUrl(clientId: string, state: string, nonce: string) {
    const params = new URLSearchParams({
        client_id: clientId,
        redirect_uri: `${window.location.origin}/auth/google-callback`,
        response_type: 'id_token',
        scope: 'openid email profile',
        nonce,
        state,
        prompt: 'select_account',
    });
    return `https://accounts.google.com/o/oauth2/v2/auth?${params.toString()}`;
}

function readStoredResult(): CallbackResult | null {
    try {
        const raw = localStorage.getItem(RESULT_KEY);
        return raw ? (JSON.parse(raw) as CallbackResult) : null;
    } catch {
        return null;
    }
}

export type GoogleSignInPayload = { idToken: string; nonce: string };

function settle(result: CallbackResult, expectedState: string | null, expectedNonce: string | null): GoogleSignInPayload {
    if (!expectedState || result.state !== expectedState) throw new Error('Sign-in response did not match this session.');
    if (result.error) throw new Error(result.error === 'access_denied' ? 'cancelled' : result.error);
    if (!result.idToken) throw new Error('Google did not return an ID token.');
    if (!expectedNonce) throw new Error('Sign-in response did not match this session.');
    return { idToken: result.idToken, nonce: expectedNonce };
}

/**
 * Must run synchronously inside the tap handler, or Safari blocks the popup.
 * If the popup can't open, the current tab redirects to Google and comes back
 * to /account, where takePendingGoogleSignIn() picks the token up.
 */
export function signInWithGooglePopup(clientId: string): Promise<GoogleSignInPayload> {
    const state = randomString();
    const nonce = randomString();
    try {
        sessionStorage.setItem(STATE_KEY, state);
        sessionStorage.setItem(NONCE_KEY, nonce);
        sessionStorage.setItem(MODE_KEY, 'popup');
        localStorage.removeItem(RESULT_KEY);
    } catch {
        // Private mode without storage: BroadcastChannel still carries the result.
    }

    const url = buildAuthUrl(clientId, state, nonce);
    const popup = window.open(url, 'amplifood-google', 'popup,width=480,height=640');
    if (!popup) {
        try {
            sessionStorage.setItem(MODE_KEY, 'redirect');
        } catch {}
        window.location.assign(url);
        return new Promise(() => {});
    }

    return new Promise((resolve, reject) => {
        let channel: BroadcastChannel | null = null;
        let focusTimer: ReturnType<typeof setTimeout> | null = null;
        let done = false;

        const cleanup = () => {
            done = true;
            channel?.close();
            window.removeEventListener('storage', onStorage);
            window.removeEventListener('focus', onFocus);
            if (focusTimer) clearTimeout(focusTimer);
            clearTimeout(giveUpTimer);
            try {
                localStorage.removeItem(RESULT_KEY);
                sessionStorage.removeItem(STATE_KEY);
            } catch {}
        };
        const finish = (result: CallbackResult) => {
            if (done) return;
            cleanup();
            try {
                resolve(settle(result, state, nonce));
            } catch (error) {
                reject(error);
            }
        };
        const onStorage = (event: StorageEvent) => {
            if (event.key === RESULT_KEY && event.newValue) {
                try {
                    finish(JSON.parse(event.newValue));
                } catch {}
            }
        };
        const cancel = () => {
            if (done) return;
            const stored = readStoredResult();
            if (stored?.state === state) {
                finish(stored);
                return;
            }
            cleanup();
            reject(new Error('cancelled'));
        };
        // Google's COOP header makes popup.closed unreliable, so treat "the user
        // came back to this tab and no result followed" as a cancel.
        const onFocus = () => {
            if (focusTimer) clearTimeout(focusTimer);
            focusTimer = setTimeout(cancel, 3000);
        };
        const giveUpTimer = setTimeout(cancel, 5 * 60 * 1000);

        if (typeof BroadcastChannel !== 'undefined') {
            channel = new BroadcastChannel('amplifood-auth');
            channel.onmessage = (event) => {
                if (event.data?.type === 'google-result') finish(event.data.result);
            };
        }
        window.addEventListener('storage', onStorage);
        window.addEventListener('focus', onFocus);
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
        return null;
    }
    if (mode !== 'redirect') return null;
    const result = readStoredResult();
    try {
        sessionStorage.removeItem(MODE_KEY);
        sessionStorage.removeItem(STATE_KEY);
        sessionStorage.removeItem(NONCE_KEY);
        localStorage.removeItem(RESULT_KEY);
    } catch {}
    if (!result || Date.now() - (result.at ?? 0) > RESULT_MAX_AGE_MS) return null;
    try {
        return settle(result, state, nonce);
    } catch {
        return null;
    }
}

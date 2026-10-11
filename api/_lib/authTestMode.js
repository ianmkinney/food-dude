import { isEmailAllowed } from './env.js';

export const AUTH_TEST_ID_TOKEN = 'amplifood-test-id-token';
export const AUTH_TEST_NONCE = 'amplifood-test-nonce';

/** True only for local dev: never on Vercel or NODE_ENV=production. */
export function isLocalAuthTestModeEnabled() {
    if (process.env.AUTH_TEST_MODE !== '1') return false;
    if (process.env.VERCEL_ENV) return false;
    if (process.env.NODE_ENV === 'production') return false;
    return true;
}

/**
 * @param {{ idToken?: string, nonce?: string, testEmail?: string, testSub?: string, testName?: string }} body
 * @returns {{ sub: string, email: string, name: string, picture: string } | null}
 */
export function tryResolveAuthTestProfile(body) {
    if (!isLocalAuthTestModeEnabled()) return null;
    if (body?.idToken !== AUTH_TEST_ID_TOKEN || body?.nonce !== AUTH_TEST_NONCE) return null;

    const email = String(body?.testEmail || 'tester@example.com').trim();
    if (!email) {
        const err = new Error('Invalid test email');
        err.code = 'auth_test_bad_request';
        throw err;
    }
    if (isEmailAllowed(email)) {
        const err = new Error('Allowlisted emails cannot use auth test mode');
        err.code = 'auth_test_allowlisted_forbidden';
        throw err;
    }

    return {
        sub: String(body?.testSub || 'test-google-sub'),
        email,
        name: String(body?.testName || 'Test User'),
        picture: '',
    };
}

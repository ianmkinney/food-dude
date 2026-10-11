import { applyCors } from '../_lib/cors.js';
import { isEmailAllowed, isGoogleSignInConfigured, requireSecrets } from '../_lib/env.js';
import { verifyGoogleIdToken } from '../_lib/google.js';
import { signSession } from '../_lib/session.js';
const MSG = {
    method_not_allowed: 'Method not allowed.',
    sign_in_disabled: 'Google sign-in is not enabled on this server.',
    misconfigured: 'Server configuration error.',
    bad_request: 'Invalid sign-in request.',
    auth_failed: 'Google sign-in failed.',
};

function jsonError(res, status, error) {
    res.status(status).json({ error, message: MSG[error] || 'Request failed.' });
}

export default async function handler(req, res) {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
        jsonError(res, 405, 'method_not_allowed');
        return;
    }

    if (!isGoogleSignInConfigured()) {
        jsonError(res, 503, 'sign_in_disabled');
        return;
    }

    try {
        requireSecrets();
    } catch (error) {
        console.error('[auth/google] secrets:', error?.message || error);
        jsonError(res, 503, 'misconfigured');
        return;
    }

    const idToken = req.body?.idToken;
    const nonce = req.body?.nonce;
    if (!idToken || typeof idToken !== 'string') {
        jsonError(res, 400, 'bad_request');
        return;
    }
    if (!nonce || typeof nonce !== 'string') {
        jsonError(res, 400, 'bad_request');
        return;
    }

    try {
        const profile = await verifyGoogleIdToken(idToken, nonce);
        const token = await signSession(profile);
        res.status(200).json({
            token,
            email: profile.email,
            name: profile.name,
            sub: profile.sub,
            platformAiAllowed: isEmailAllowed(profile.email),
        });
    } catch (error) {
        console.error('[auth/google] verify failed:', error?.message || error);
        jsonError(res, 401, 'auth_failed');
    }
}

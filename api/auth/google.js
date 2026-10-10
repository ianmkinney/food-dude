import { applyCors } from '../_lib/cors.js';
import { isOwnerGateConfigured, isEmailAllowed, requireSecrets } from '../_lib/env.js';
import { verifyGoogleIdToken } from '../_lib/google.js';
import { signSession } from '../_lib/session.js';
const MSG = {
    method_not_allowed: 'Method not allowed.',
    platform_disabled: 'Owner platform AI is not enabled.',
    misconfigured: 'Server configuration error.',
    bad_request: 'Invalid sign-in request.',
    not_allowed: 'This Google account is not authorized.',
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

    if (!isOwnerGateConfigured()) {
        jsonError(res, 503, 'platform_disabled');
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
        if (!isEmailAllowed(profile.email)) {
            jsonError(res, 403, 'not_allowed');
            return;
        }
        const token = await signSession(profile);
        res.status(200).json({
            token,
            email: profile.email,
            name: profile.name,
        });
    } catch (error) {
        console.error('[auth/google] verify failed:', error?.message || error);
        jsonError(res, 401, 'auth_failed');
    }
}

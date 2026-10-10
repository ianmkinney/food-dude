const { applyCors } = require('../lib/cors');
const { isOwnerGateConfigured, isEmailAllowed, requireSecrets } = require('../lib/env');
const { verifyGoogleIdToken } = require('../lib/google');
const { signSession } = require('../lib/session');

module.exports = async function handler(req, res) {
    if (applyCors(req, res)) return;
    if (req.method !== 'POST') {
        res.status(405).json({ error: 'method_not_allowed' });
        return;
    }

    if (!isOwnerGateConfigured()) {
        res.status(503).json({
            error: 'platform_disabled',
            message: 'Owner platform AI is not enabled (set ALLOWED_EMAILS on the server).',
        });
        return;
    }

    try {
        requireSecrets();
    } catch (error) {
        res.status(503).json({ error: 'misconfigured', message: error.message });
        return;
    }

    const idToken = req.body?.idToken;
    if (!idToken || typeof idToken !== 'string') {
        res.status(400).json({ error: 'bad_request', message: 'Missing idToken' });
        return;
    }

    try {
        const profile = await verifyGoogleIdToken(idToken);
        if (!isEmailAllowed(profile.email)) {
            res.status(403).json({
                error: 'not_allowed',
                message: 'This Google account is not on the owner allowlist.',
            });
            return;
        }
        const token = await signSession(profile);
        res.status(200).json({
            token,
            email: profile.email,
            name: profile.name,
        });
    } catch (error) {
        res.status(401).json({
            error: 'auth_failed',
            message: error?.message || 'Google sign-in failed',
        });
    }
};

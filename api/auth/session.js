import { applyCors } from '../_lib/cors.js';
import { isEmailAllowed, isGoogleSignInConfigured, requireSecrets } from '../_lib/env.js';
import { isElevenLabsConfigured } from '../_lib/elevenLabs.js';
import { bearerToken, verifySession } from '../_lib/session.js';

export default async function handler(req, res) {
    if (applyCors(req, res)) return;
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'method_not_allowed', message: 'Method not allowed.' });
        return;
    }

    if (!isGoogleSignInConfigured()) {
        res.status(503).json({
            error: 'sign_in_disabled',
            message: 'Google sign-in is not enabled on this server.',
        });
        return;
    }

    try {
        requireSecrets();
    } catch (error) {
        console.error('[auth/session] secrets:', error?.message || error);
        res.status(503).json({ error: 'misconfigured', message: 'Server configuration error.' });
        return;
    }

    const token = bearerToken(req);
    if (!token) {
        res.status(401).json({ error: 'unauthorized', message: 'Sign in again in Account.' });
        return;
    }

    try {
        const session = await verifySession(token);
        const platformAiAllowed = isEmailAllowed(session.email);
        res.status(200).json({
            email: session.email,
            name: session.name,
            picture: session.picture || '',
            sub: session.sub,
            platformAiAllowed,
            elevenlabsAvailable: platformAiAllowed && isElevenLabsConfigured(),
        });
    } catch {
        res.status(401).json({ error: 'unauthorized', message: 'Sign in again in Account.' });
        return;
    }
}

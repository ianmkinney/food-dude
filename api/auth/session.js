import { applyCors } from '../_lib/cors.js';
import { isOwnerGateConfigured, isEmailAllowed, requireSecrets } from '../_lib/env.js';
import { bearerToken, verifySession } from '../_lib/session.js';

export default async function handler(req, res) {
    if (applyCors(req, res)) return;
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'method_not_allowed', message: 'Method not allowed.' });
        return;
    }

    if (!isOwnerGateConfigured()) {
        res.status(503).json({
            error: 'platform_disabled',
            message: 'Owner platform AI is not enabled.',
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
        if (!isEmailAllowed(session.email)) {
            res.status(403).json({ error: 'not_allowed', message: 'This Google account is not authorized.' });
            return;
        }
        res.status(200).json({
            email: session.email,
            name: session.name,
        });
    } catch {
        res.status(401).json({ error: 'unauthorized', message: 'Sign in again in Account.' });
    }
}

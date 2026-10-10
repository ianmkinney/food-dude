import { applyCors } from '../lib/cors.js';
import { getDailyLimits, isOwnerGateConfigured, isEmailAllowed } from '../lib/env.js';
import { bearerToken, verifySession } from '../lib/session.js';
import { getUsage, StoreMisconfiguredError } from '../lib/store.js';

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
        const usage = await getUsage(session.sub);
        const limits = getDailyLimits();
        res.status(200).json({
            email: session.email,
            name: session.name,
            usage: {
                requests: usage.requests,
                requestLimit: limits.maxRequests,
                tokens: usage.tokens,
                tokenLimit: limits.maxTokens,
            },
        });
    } catch (error) {
        if (error instanceof StoreMisconfiguredError) {
            console.error('[auth/session] store:', error.message);
            res.status(503).json({ error: 'misconfigured', message: 'Server configuration error.' });
            return;
        }
        res.status(401).json({ error: 'unauthorized', message: 'Sign in again in Account.' });
    }
}

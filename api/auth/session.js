const { applyCors } = require('../lib/cors');
const { getDailyLimits, isOwnerGateConfigured, isEmailAllowed } = require('../lib/env');
const { bearerToken, verifySession } = require('../lib/session');
const { getUsage } = require('../lib/store');

module.exports = async function handler(req, res) {
    if (applyCors(req, res)) return;
    if (req.method !== 'GET') {
        res.status(405).json({ error: 'method_not_allowed' });
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
        res.status(401).json({ error: 'unauthorized' });
        return;
    }

    try {
        const session = await verifySession(token);
        if (!isEmailAllowed(session.email)) {
            res.status(403).json({ error: 'not_allowed' });
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
    } catch {
        res.status(401).json({ error: 'unauthorized' });
    }
};

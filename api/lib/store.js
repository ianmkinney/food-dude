const memory = new Map();

let redis = null;

function getRedis() {
    if (redis !== null) return redis;
    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (url && token) {
        try {
            const { Redis } = require('@upstash/redis');
            redis = new Redis({ url, token });
            return redis;
        } catch {
            redis = false;
            return null;
        }
    }
    redis = false;
    return null;
}

function usageKey(userId) {
    const day = new Date().toISOString().slice(0, 10);
    return `amplifood:owner-ai:${userId}:${day}`;
}

async function getUsage(userId) {
    const key = usageKey(userId);
    const client = getRedis();
    if (client) {
        const row = await client.hgetall(key);
        return {
            requests: Number(row?.requests || 0),
            tokens: Number(row?.tokens || 0),
        };
    }
    return memory.get(key) || { requests: 0, tokens: 0 };
}

async function recordUsage(userId, { requestDelta = 0, tokenDelta = 0 }) {
    const key = usageKey(userId);
    const client = getRedis();
    if (client) {
        const pipe = client.pipeline();
        if (requestDelta) pipe.hincrby(key, 'requests', requestDelta);
        if (tokenDelta) pipe.hincrby(key, 'tokens', tokenDelta);
        pipe.expire(key, 60 * 60 * 48);
        await pipe.exec();
        return getUsage(userId);
    }
    const prev = memory.get(key) || { requests: 0, tokens: 0 };
    const next = {
        requests: prev.requests + requestDelta,
        tokens: prev.tokens + tokenDelta,
    };
    memory.set(key, next);
    return next;
}

module.exports = { getUsage, recordUsage, getRedis };

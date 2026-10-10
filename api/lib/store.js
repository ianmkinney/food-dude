const memory = new Map();

/** @type {import('@upstash/redis').Redis | false | null} */
let redis = null;

async function getRedis() {
    if (redis === false) return null;
    if (redis) return redis;

    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        redis = false;
        return null;
    }

    try {
        const { Redis } = await import('@upstash/redis');
        redis = new Redis({ url, token });
        return redis;
    } catch (error) {
        console.warn('[store] Upstash Redis unavailable, using in-memory counters:', error?.message || error);
        redis = false;
        return null;
    }
}

function usageKey(userId) {
    const day = new Date().toISOString().slice(0, 10);
    return `amplifood:owner-ai:${userId}:${day}`;
}

export async function getUsage(userId) {
    const key = usageKey(userId);
    const client = await getRedis();
    if (client) {
        const row = await client.hgetall(key);
        return {
            requests: Number(row?.requests || 0),
            tokens: Number(row?.tokens || 0),
        };
    }
    return memory.get(key) || { requests: 0, tokens: 0 };
}

export async function recordUsage(userId, { requestDelta = 0, tokenDelta = 0 }) {
    const key = usageKey(userId);
    const client = await getRedis();
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

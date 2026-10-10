const memory = new Map();

const DEV = process.env.NODE_ENV === 'development';

/** @type {import('@upstash/redis').Redis | null} */
let redis = null;

export class StoreMisconfiguredError extends Error {
    constructor(message) {
        super(message);
        this.name = 'StoreMisconfiguredError';
    }
}

export async function getRedis() {
    if (redis) return redis;

    const url = process.env.KV_REST_API_URL || process.env.UPSTASH_REDIS_REST_URL;
    const token = process.env.KV_REST_API_TOKEN || process.env.UPSTASH_REDIS_REST_TOKEN;
    if (!url || !token) {
        if (DEV) return null;
        throw new StoreMisconfiguredError('KV_REST_API_URL and KV_REST_API_TOKEN are required');
    }

    try {
        const { Redis } = await import('@upstash/redis');
        redis = new Redis({ url, token });
        return redis;
    } catch (error) {
        console.error('[store] Upstash Redis import failed:', error?.message || error);
        if (DEV) return null;
        throw new StoreMisconfiguredError('Upstash Redis is unavailable');
    }
}

function usageKey(userId) {
    const day = new Date().toISOString().slice(0, 10);
    return `amplifood:owner-ai:${userId}:${day}`;
}

function memoryUsage(key) {
    return memory.get(key) || { requests: 0, tokens: 0 };
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
    const row = memoryUsage(key);
    return { requests: row.requests, tokens: row.tokens };
}

/**
 * Atomically reserve daily quota before upstream. Rolls back on failure.
 * @returns {Promise<{ ok: true, reservedTokens: number } | { ok: false }>}
 */
export async function reserveDailyUsage(userId, { tokenReserve, limits }) {
    const key = usageKey(userId);
    const client = await getRedis();

    if (!client) {
        const prev = memoryUsage(key);
        const nextRequests = prev.requests + 1;
        const nextTokens = prev.tokens + tokenReserve;
        if (nextRequests > limits.maxRequests || nextTokens > limits.maxTokens) {
            return { ok: false };
        }
        memory.set(key, { requests: nextRequests, tokens: nextTokens });
        return { ok: true, reservedTokens: tokenReserve };
    }

    const pipe = client.pipeline();
    pipe.hincrby(key, 'requests', 1);
    pipe.hincrby(key, 'tokens', tokenReserve);
    pipe.expire(key, 172800);
    const results = await pipe.exec();
    const requests = Number(results[0]);
    const tokens = Number(results[1]);

    if (requests > limits.maxRequests || tokens > limits.maxTokens) {
        await client
            .pipeline()
            .hincrby(key, 'requests', -1)
            .hincrby(key, 'tokens', -tokenReserve)
            .exec();
        return { ok: false };
    }
    return { ok: true, reservedTokens: tokenReserve };
}

/** Adjust token counter after upstream: actual usage minus what was reserved. */
export async function reconcileDailyUsage(userId, { tokenDelta }) {
    if (!tokenDelta) return;
    const key = usageKey(userId);
    const client = await getRedis();
    if (client) {
        await client.hincrby(key, 'tokens', tokenDelta);
        return;
    }
    const prev = memoryUsage(key);
    memory.set(key, { ...prev, tokens: prev.tokens + tokenDelta });
}

const RL_MAX_PER_MINUTE = 10;
const CONCURRENCY_MAX = 2;

export async function checkMinuteRateLimit(userId) {
    const minute = Math.floor(Date.now() / 60_000);
    const rlKey = `amplifood:rl:${userId}:${minute}`;
    const client = await getRedis();

    if (!client) {
        const memKey = `rl:${userId}:${minute}`;
        const count = (memory.get(memKey) || 0) + 1;
        memory.set(memKey, count);
        return count <= RL_MAX_PER_MINUTE;
    }

    const count = await client.incr(rlKey);
    if (count === 1) {
        await client.expire(rlKey, 60);
    }
    if (count > RL_MAX_PER_MINUTE) {
        await client.decr(rlKey);
        return false;
    }
    return true;
}

/**
 * @returns {Promise<(() => Promise<void>) | null>} release fn, or null if over limit
 */
export async function acquireConcurrency(userId) {
    const key = `amplifood:conc:${userId}`;
    const client = await getRedis();

    if (!client) {
        const memKey = `conc:${userId}`;
        const n = (memory.get(memKey) || 0) + 1;
        memory.set(memKey, n);
        if (n > CONCURRENCY_MAX) {
            memory.set(memKey, n - 1);
            return null;
        }
        return async () => {
            const cur = memory.get(memKey) || 1;
            memory.set(memKey, Math.max(0, cur - 1));
        };
    }

    const n = await client.incr(key);
    if (n === 1) {
        await client.expire(key, 3600);
    }
    if (n > CONCURRENCY_MAX) {
        await client.decr(key);
        return null;
    }
    return async () => {
        try {
            await client.decr(key);
        } catch (error) {
            console.error('[store] concurrency release failed:', error?.message || error);
        }
    };
}

/** @deprecated Use reserveDailyUsage / reconcileDailyUsage in chat handler */
export async function recordUsage(userId, { requestDelta = 0, tokenDelta = 0 }) {
    const key = usageKey(userId);
    const client = await getRedis();
    if (client) {
        const pipe = client.pipeline();
        if (requestDelta) pipe.hincrby(key, 'requests', requestDelta);
        if (tokenDelta) pipe.hincrby(key, 'tokens', tokenDelta);
        pipe.expire(key, 172800);
        await pipe.exec();
        return getUsage(userId);
    }
    const prev = memoryUsage(key);
    const next = {
        requests: prev.requests + requestDelta,
        tokens: prev.tokens + tokenDelta,
    };
    memory.set(key, next);
    return next;
}
